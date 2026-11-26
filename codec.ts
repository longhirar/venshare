export const SIGNAL_PREFIX = "[venshare:v1:";
export const SIGNAL_SUFFIX = "]";

export type SignalPayload =
    | { t: "announce"; from: string; name: string; vc: string; title: string }
    | { t: "stop"; from: string; vc: string }
    | { t: "watch"; from: string; to: string; vc: string }
    | { t: "offer"; from: string; to: string; vc: string; sdp: string }
    | { t: "answer"; from: string; to: string; vc: string; sdp: string };

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
    writer.write(input);
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
}

async function inflate(input: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(input);
    writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(buf);
}

/**
 * Encodes and compresses a signaling payload into a compact Discord message string.
 */
export async function encodeSignal(payload: SignalPayload): Promise<string> {
    const raw = new TextEncoder().encode(JSON.stringify(payload));
    const compressed = await deflate(raw);
    return `${SIGNAL_PREFIX}${bytesToBase64Url(compressed)}${SIGNAL_SUFFIX}`;
}

/**
 * Parses and decompresses a `[venshare:v1:...]` message, or returns null if unrelated.
 */
export async function decodeSignal(content: string): Promise<SignalPayload | null> {
    if (!content.startsWith(SIGNAL_PREFIX) || !content.endsWith(SIGNAL_SUFFIX)) {
        return null;
    }

    try {
        const b64 = content.slice(SIGNAL_PREFIX.length, -SIGNAL_SUFFIX.length);
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
