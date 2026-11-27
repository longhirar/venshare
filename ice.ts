import { PluginNative } from "@utils/types";

import type { IceServerEntry } from "./native";
import { settings } from "./settings";

export type IceProvider = "cf-turn" | "custom-turn" | "stun-only";

export const FALLBACK_STUN_SERVERS: RTCIceServer[] = [
    {
        urls: [
            "stun:stun.cloudflare.com:3478",
            "stun:stun.l.google.com:19302"
        ]
    }
];

interface CachedCloudflareTurn {
    cacheKey: string;
    iceServers: RTCIceServer[];
    expiresAt: number;
}

let cfTurnCache: CachedCloudflareTurn | null = null;

function getNative() {
    return VencordNative?.pluginHelpers?.Venshare as PluginNative<typeof import("./native")> | undefined;
}

export function clearTurnCache(): void {
    cfTurnCache = null;
}

function parseCustomUrls(raw: string): string[] {
    return raw
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(u => (/^(stuns?|turns?):/i.test(u) ? u : `turn:${u}`));
}

function hasTurnServer(servers: RTCIceServer[]): boolean {
    return servers.some(server => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.some(u => /^turns?:/i.test(u));
    });
}

async function getCloudflareTurnServers(): Promise<RTCIceServer[]> {
    const keyId = (settings.store.cfTurnKeyId ?? "").trim();
    const apiToken = (settings.store.cfTurnApiToken ?? "").trim();
    const ttlSeconds = Math.max(60, Math.min(86400, Number(settings.store.cfTurnTtl) || 3600));

    if (!keyId || !apiToken) {
        throw new Error("Cloudflare TURN Key ID and API Token must be configured in Venshare settings.");
    }

    const cacheKey = `${keyId}:${apiToken}:${ttlSeconds}`;
    // Reuse cached credentials if more than 5 minutes remain before expiry
    if (cfTurnCache && cfTurnCache.cacheKey === cacheKey && Date.now() < cfTurnCache.expiresAt - 300_000) {
        return cfTurnCache.iceServers;
    }

    const native = getNative();
    if (!native?.generateCloudflareTurnCredentials) {
        throw new Error("Venshare native helper is unavailable (Desktop Vencord required for Cloudflare TURN).");
    }

    const entries: IceServerEntry[] = await native.generateCloudflareTurnCredentials(keyId, apiToken, ttlSeconds);
    const iceServers: RTCIceServer[] = entries.map(entry => ({
        urls: entry.urls,
        ...(entry.username ? { username: entry.username } : {}),
        ...(entry.credential ? { credential: entry.credential } : {})
    }));

    cfTurnCache = {
        cacheKey,
        iceServers,
        expiresAt: Date.now() + ttlSeconds * 1000
    };

    return iceServers;
}

function getCustomTurnServers(): RTCIceServer[] {
    const urls = parseCustomUrls(settings.store.customTurnUrls ?? "");
    if (urls.length === 0) {
        throw new Error("Custom TURN/STUN URL is empty. Enter at least one turn:, turns:, or stun: URL.");
    }

    const username = (settings.store.customTurnUsername ?? "").trim();
    const credential = (settings.store.customTurnCredential ?? "").trim();

    const customEntry: RTCIceServer = {
        urls,
        ...(username ? { username } : {}),
        ...(credential ? { credential } : {})
    };

    const servers: RTCIceServer[] = [customEntry];
    const hasStun = urls.some(u => /^stuns?:/i.test(u));
    if (!hasStun && !settings.store.forceTurnRelay) {
        servers.unshift({ urls: ["stun:stun.cloudflare.com:3478"] });
    }

    return servers;
}

export interface ResolvedRtcConfig {
    rtcConfig: RTCConfiguration;
    /**
     * Ephemeral ICE servers (e.g. short-lived Cloudflare TURN credentials) that can be
     * safely shared with viewers in the SDP offer so viewers do not need their own API key.
     */
    shareableIceServers?: RTCIceServer[];
}

export async function resolveRtcConfig(opts?: {
    overrideIceServers?: RTCIceServer[];
}): Promise<ResolvedRtcConfig> {
    const forceRelay = Boolean(settings.store.forceTurnRelay);

    if (opts?.overrideIceServers && opts.overrideIceServers.length > 0) {
        const useRelay = forceRelay && hasTurnServer(opts.overrideIceServers);
        return {
            rtcConfig: {
                iceServers: opts.overrideIceServers,
                iceTransportPolicy: useRelay ? "relay" : "all",
                iceCandidatePoolSize: 4
            }
        };
    }

    const provider = (settings.store.iceProvider ?? "cf-turn") as IceProvider;
    let iceServers: RTCIceServer[];
    let shareableIceServers: RTCIceServer[] | undefined;

    if (provider === "cf-turn") {
        iceServers = await getCloudflareTurnServers();
        shareableIceServers = iceServers;
    } else if (provider === "custom-turn") {
        iceServers = getCustomTurnServers();
    } else {
        iceServers = FALLBACK_STUN_SERVERS;
    }

    const useRelay = forceRelay && hasTurnServer(iceServers);

    return {
        rtcConfig: {
            iceServers,
            iceTransportPolicy: useRelay ? "relay" : "all",
            iceCandidatePoolSize: 4
        },
        shareableIceServers
    };
}

/**
 * Validates the currently selected ICE/TURN configuration (and forces a fresh Cloudflare
 * credential fetch when testing Cloudflare TURN).
 */
export async function testTurnConfig(): Promise<{ serverCount: number; hasTurn: boolean }> {
    clearTurnCache();
    const { rtcConfig } = await resolveRtcConfig();
    const servers = rtcConfig.iceServers ?? [];
    return {
        serverCount: servers.length,
        hasTurn: hasTurnServer(servers)
    };
}
