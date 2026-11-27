export const SIGNAL_PREFIX = "[venshare:v1:";
export const SIGNAL_SUFFIX = "]";

const CHUNK_PREFIX = "p:";
const MAX_MESSAGE_LEN = 1900;
const CHUNK_TTL_MS = 30_000;

export type SignalPayload =
    | { t: "announce"; from: string; name: string; vc: string; title: string }
    | { t: "stop"; from: string; vc: string }
    | { t: "watch"; from: string; to: string; vc: string }
    | { t: "offer"; from: string; to: string; vc: string; sdp: string; ice?: RTCIceServer[] }
    | { t: "answer"; from: string; to: string; vc: string; sdp: string };

interface PendingChunkGroup {
    total: number;
    parts: Map<number, string>;
    timer: ReturnType<typeof setTimeout>;
}

const pendingChunks = new Map<string, PendingChunkGroup>();

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str: string): Uint8Array {
    const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function deflate(input: Uint8Array): Promise<Uint8Array> {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    void writer.write(input as BufferSource);
    void writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
}

async function inflate(input: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    void writer.write(input as BufferSource);
    void writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(buf);
}

function randomChunkId(): string {
    return Math.random().toString(36).slice(2, 8);
}

async function decodeCompressedBase64(b64: string): Promise<SignalPayload | null> {
    try {
        const compressed = base64UrlToBytes(b64);
        const raw = await inflate(compressed);
        const parsed = JSON.parse(new TextDecoder().decode(raw));
        if (!parsed || typeof parsed.t !== "string" || typeof parsed.from !== "string") {
            return null;
        }
        return parsed as SignalPayload;
    } catch {
        return null;
    }
}

/**
 * Encodes and compresses a signaling payload into one or more Discord messages
 * (automatically chunking if the compressed string exceeds Discord's 2000-char limit).
 */
export async function encodeSignalMessages(payload: SignalPayload): Promise<string[]> {
    const raw = new TextEncoder().encode(JSON.stringify(payload));
    const compressed = await deflate(raw);
    const b64 = bytesToBase64Url(compressed);

    const single = `${SIGNAL_PREFIX}${b64}${SIGNAL_SUFFIX}`;
    if (single.length <= MAX_MESSAGE_LEN) {
        return [single];
    }

    const id = randomChunkId();
    // Reserve headroom for "[venshare:v1:p:<id>:<idx>/<total>:<slice>]"
    const chunkSize = MAX_MESSAGE_LEN - SIGNAL_PREFIX.length - SIGNAL_SUFFIX.length - 32;
    const total = Math.ceil(b64.length / chunkSize);
    const messages: string[] = [];

    for (let i = 0; i < total; i++) {
        const slice = b64.slice(i * chunkSize, (i + 1) * chunkSize);
        messages.push(`${SIGNAL_PREFIX}${CHUNK_PREFIX}${id}:${i + 1}/${total}:${slice}${SIGNAL_SUFFIX}`);
    }

    return messages;
}

/**
 * Parses and decompresses a `[venshare:v1:...]` message (handling multi-part chunks),
 * or returns null if unrelated or still waiting for remaining chunks.
 */
export async function decodeSignal(content: string): Promise<SignalPayload | null> {
    if (!content.startsWith(SIGNAL_PREFIX) || !content.endsWith(SIGNAL_SUFFIX)) {
        return null;
    }

    const body = content.slice(SIGNAL_PREFIX.length, -SIGNAL_SUFFIX.length);

    if (body.startsWith(CHUNK_PREFIX)) {
        // Format: p:<id>:<index>/<total>:<b64slice>
        const match = /^p:([a-z0-9]+):(\d+)\/(\d+):(.*)$/.exec(body);
        if (!match) return null;

        const [, id, idxStr, totalStr, slice] = match;
        const idx = Number(idxStr);
        const total = Number(totalStr);
        if (!idx || !total || idx < 1 || idx > total || total > 20) return null;

        let group = pendingChunks.get(id);
        if (!group) {
            const timer = setTimeout(() => {
                pendingChunks.delete(id);
            }, CHUNK_TTL_MS);
            group = { total, parts: new Map(), timer };
            pendingChunks.set(id, group);
        }

        group.parts.set(idx, slice);
        if (group.parts.size < group.total) {
            return null;
        }

        clearTimeout(group.timer);
        pendingChunks.delete(id);

        let fullB64 = "";
        for (let i = 1; i <= group.total; i++) {
            const part = group.parts.get(i);
            if (part === undefined) return null;
            fullB64 += part;
        }

        return decodeCompressedBase64(fullB64);
    }

    return decodeCompressedBase64(body);
}
