import { ApplicationCommandInputType } from "@api/Commands";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { SelectedChannelStore, Toasts, UserStore } from "@webpack/common";

import { openGoLiveModal } from "./components/GoLiveModal";
import { VoiceBarPanel } from "./components/VoiceBarPanel";
import { decodeSignal, SIGNAL_PREFIX } from "./codec";
import { settings } from "./settings";
import { flushPendingDeletes } from "./signaling";
import { venshareStore } from "./store";
import { webrtcManager } from "./webrtc";

interface VoiceStateUpdate {
    userId: string;
    channelId: string | null;
}

export default definePlugin({
    name: "Venshare",
    description: "Serverless P2P WebRTC screen sharing over STUN with auto-deleting Discord signaling.",
    authors: [{ name: "longhi", id: 0n }],
    settings,

    patches: [
        {
            find: "rtcConnectionStatus",
            replacement: {
                match: /(\.Fragment,\{children:\[)/,
                replace: "$1$self.renderVoiceBarPanel(),"
            }
        }
    ],

    renderVoiceBarPanel: ErrorBoundary.wrap(VoiceBarPanel, { noop: true }),

    commands: [
        {
            name: "venshare",
            description: "Open Venshare P2P screen share picker for your current voice channel",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: () => {
                const vcId = SelectedChannelStore.getVoiceChannelId();
                if (!vcId) {
                    Toasts.show({
                        message: "Join a voice channel first to start Venshare.",
                        type: Toasts.Type.FAILURE,
                        id: Toasts.genId()
                    });
                    return;
                }
                openGoLiveModal(vcId);
            }
        }
    ],

    flux: {
        async MESSAGE_CREATE({ message }: { message?: { content?: string; channel_id?: string } }) {
            const content = message?.content;
            const channelId = message?.channel_id;
            if (!content || !channelId || !content.startsWith(SIGNAL_PREFIX)) return;

            const payload = await decodeSignal(content);
            if (!payload) return;

            await webrtcManager.handleSignal(payload, channelId);
        },

        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceStateUpdate[] }) {
            const me = UserStore.getCurrentUser();
            const currentVc = SelectedChannelStore.getVoiceChannelId() ?? null;
            const prevVc = venshareStore.getState().currentVoiceChannelId;

            if (prevVc !== currentVc) {
                if (prevVc && venshareStore.getState().isStreaming) {
                    void webrtcManager.stopStreaming(prevVc);
                }
                if (venshareStore.getState().watchingUserId) {
                    webrtcManager.stopWatching();
                }
                venshareStore.setVoiceChannel(currentVc);
            }

            if (!me || !currentVc) return;

            for (const vs of voiceStates) {
                if (vs.userId !== me.id && vs.channelId !== currentVc) {
                    venshareStore.removeAvailableStream(vs.userId);
                    if (venshareStore.getState().watchingUserId === vs.userId) {
                        webrtcManager.stopWatching();
                    }
                }
            }
        }
    },

    start() {
        const vcId = SelectedChannelStore.getVoiceChannelId() ?? null;
        venshareStore.setVoiceChannel(vcId);
    },

    stop() {
        const prevVc = venshareStore.getState().currentVoiceChannelId ?? undefined;
        void webrtcManager.stopStreaming(prevVc);
        webrtcManager.stopWatching();
        void flushPendingDeletes();
        venshareStore.reset();
    }
});
