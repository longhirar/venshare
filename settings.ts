import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    iceProvider: {
        type: OptionType.SELECT,
        description: "ICE / TURN server used for WebRTC connections",
        options: [
            { label: "Cloudflare TURN (Recommended)", value: "cf-turn", default: true },
            { label: "Custom TURN / STUN Server", value: "custom-turn" },
            { label: "STUN Only (Direct P2P, no relay)", value: "stun-only" }
        ]
    },
    cfTurnKeyId: {
        type: OptionType.STRING,
        description: "Cloudflare TURN Key ID (Cloudflare Dashboard -> Realtime -> TURN)",
        default: "",
        placeholder: "e.g. a1b2c3d4e5f6..."
    },
    cfTurnApiToken: {
        type: OptionType.STRING,
        description: "Cloudflare TURN API Token (used to generate short-lived ICE credentials)",
        default: "",
        placeholder: "Cloudflare TURN API Token"
    },
    cfTurnTtl: {
        type: OptionType.SELECT,
        description: "Cloudflare TURN ephemeral credential lifetime",
        options: [
            { label: "1 hour", value: 3600, default: true },
            { label: "6 hours", value: 21600 },
            { label: "24 hours", value: 86400 }
        ]
    },
    customTurnUrls: {
        type: OptionType.STRING,
        description: "Custom TURN/STUN URL(s), comma-separated (used when provider is Custom)",
        default: "",
        placeholder: "turn:turn.example.com:3478, turns:turn.example.com:5349"
    },
    customTurnUsername: {
        type: OptionType.STRING,
        description: "Custom TURN username (optional)",
        default: "",
        placeholder: "username"
    },
    customTurnCredential: {
        type: OptionType.STRING,
        description: "Custom TURN credential / password (optional)",
        default: "",
        placeholder: "password"
    },
    forceTurnRelay: {
        type: OptionType.BOOLEAN,
        description: "Force TURN relay (hide IP / bypass strict NAT; requires TURN)",
        default: false
    },
    defaultResolution: {
        type: OptionType.SELECT,
        description: "Default screen share resolution",
        options: [
            { label: "720p", value: "720" },
            { label: "1080p", value: "1080", default: true },
            { label: "1440p", value: "1440" },
            { label: "Source (Native)", value: "source" }
        ]
    },
    defaultFps: {
        type: OptionType.SELECT,
        description: "Default frame rate",
        options: [
            { label: "30 FPS", value: 30 },
            { label: "60 FPS", value: 60, default: true }
        ]
    },
    videoBitrateMbps: {
        type: OptionType.SLIDER,
        description: "Max video bitrate (Mbps)",
        markers: [2, 5, 8, 12, 16, 20],
        default: 8,
        stickToMarkers: false
    },
    autoDeleteDelayMs: {
        type: OptionType.SLIDER,
        description: "Auto-delete signaling messages after (ms)",
        markers: [2000, 4000, 6000, 8000, 10000],
        default: 5000,
        stickToMarkers: true
    }
});
