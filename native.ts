import { desktopCapturer, IpcMainInvokeEvent } from "electron";

export interface CaptureSource {
    id: string;
    name: string;
    thumbnailDataUrl: string;
    appIconDataUrl: string | null;
    type: "screen" | "window";
}

export interface IceServerEntry {
    urls: string | string[];
    username?: string;
    credential?: string;
}

export async function getCaptureSources(_event: IpcMainInvokeEvent): Promise<CaptureSource[]> {
    const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
    });

    return sources.map(src => ({
        id: src.id,
        name: src.name,
        thumbnailDataUrl: src.thumbnail.toDataURL(),
        appIconDataUrl: src.appIcon ? src.appIcon.toDataURL() : null,
        type: src.id.startsWith("screen:") ? "screen" : "window"
    }));
}

/**
 * Generates short-lived TURN/STUN credentials from the Cloudflare Realtime TURN API.
 * Executed in the Electron main process to avoid Discord renderer CORS/CSP restrictions.
 */
export async function generateCloudflareTurnCredentials(
    _event: IpcMainInvokeEvent,
    turnKeyId: string,
    apiToken: string,
    ttlSeconds = 3600
): Promise<IceServerEntry[]> {
    const keyId = turnKeyId.trim();
    const token = apiToken.trim();

    if (!keyId || !token) {
        throw new Error("Cloudflare TURN Key ID and API Token are required.");
    }

    const clampedTtl = Math.max(60, Math.min(86400, Math.floor(Number(ttlSeconds) || 3600)));
    const endpoint = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ ttl: clampedTtl })
    });

    if (!response.ok) {
        let detail = "";
        try {
            detail = (await response.text()).slice(0, 300);
        } catch {
            // ignore
        }
        throw new Error(`Cloudflare TURN API error (${response.status}): ${detail || response.statusText}`);
    }

    const data = await response.json() as { iceServers?: IceServerEntry | IceServerEntry[] };
    const rawServers = data?.iceServers;
    if (!rawServers) {
        throw new Error("Cloudflare TURN API response did not contain iceServers.");
    }

    const list = Array.isArray(rawServers) ? rawServers : [rawServers];
    if (list.length === 0) {
        throw new Error("Cloudflare TURN API returned an empty iceServers list.");
    }

    return list;
}
