export type StunProvider = "cf" | "google" | "custom";

export const STUN_PRESETS: Record<Exclude<StunProvider, "custom">, string[]> = {
    cf: ["stun:stun.cloudflare.com:3478"],
    google: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
    ]
};

/**
 * Resolves the RTCConfiguration iceServers list from the selected STUN provider.
 * Uses STUN-only (no TURN) for direct P2P / IPv6 connections.
 */
export function buildRtcConfig(provider: StunProvider, customUrl: string): RTCConfiguration {
    let urls: string[];

    if (provider === "custom") {
        const trimmed = customUrl.trim();
        urls = trimmed.length > 0
            ? [trimmed.startsWith("stun:") ? trimmed : `stun:${trimmed}`]
            : STUN_PRESETS.cf;
    } else {
        urls = STUN_PRESETS[provider] ?? STUN_PRESETS.cf;
    }

    return {
        iceServers: [{ urls }],
        iceCandidatePoolSize: 2
    };
}
