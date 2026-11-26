import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    stunProvider: {
        type: OptionType.SELECT,
        description: "STUN server used for P2P NAT/IPv6 discovery",
        options: [
            { label: "Cloudflare (stun.cloudflare.com)", value: "cf", default: true },
            { label: "Google (stun.l.google.com)", value: "google" },
            { label: "Custom STUN", value: "custom" }
        ]
    },
    customStunUrl: {
        type: OptionType.STRING,
        description: "Custom STUN URL (used when STUN server is set to Custom)",
        default: "stun:stun.cloudflare.com:3478",
        placeholder: "stun:example.com:3478"
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
