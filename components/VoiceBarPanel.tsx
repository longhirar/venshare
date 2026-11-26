import { Button, React, Text, Toasts } from "@webpack/common";

import { useVenshareState } from "../store";
import { webrtcManager } from "../webrtc";
import { openGoLiveModal } from "./GoLiveModal";
import { openStreamViewerModal } from "./StreamViewerModal";

export function VoiceBarPanel() {
    const {
        currentVoiceChannelId,
        isStreaming,
        streamTitle,
        activePeersCount,
        availableStreams
    } = useVenshareState();

    if (!currentVoiceChannelId) return null;

    const streams = Object.values(availableStreams);

    const handleWatch = async (userId: string, username: string, title: string) => {
        try {
            await webrtcManager.requestWatch(userId, currentVoiceChannelId);
            openStreamViewerModal(username, title);
        } catch (err) {
            Toasts.show({
                message: `Failed to connect to stream: ${String(err)}`,
                type: Toasts.Type.FAILURE,
                id: Toasts.genId()
            });
        }
    };

    return (
        <div
            style={{
                padding: "8px 10px",
                borderTop: "1px solid var(--background-modifier-accent)",
                background: "var(--background-secondary-alt)",
                display: "flex",
                flexDirection: "column",
                gap: 6
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text variant="text-xs/semibold" color="text-normal">
                    {isStreaming ? `P2P Live (${activePeersCount} watching)` : "Venshare P2P"}
                </Text>
                {isStreaming ? (
                    <Button
                        size={Button.Sizes.MIN}
                        color={Button.Colors.RED}
                        onClick={() => void webrtcManager.stopStreaming(currentVoiceChannelId)}
                    >
                        Stop
                    </Button>
                ) : (
                    <Button
                        size={Button.Sizes.MIN}
                        color={Button.Colors.BRAND}
                        onClick={() => openGoLiveModal(currentVoiceChannelId)}
                    >
                        Share Screen
                    </Button>
                )}
            </div>

            {isStreaming && streamTitle && (
                <Text variant="text-xs/normal" color="text-muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {streamTitle}
                </Text>
            )}

            {streams.map(stream => (
                <div
                    key={stream.userId}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                        padding: "4px 6px",
                        borderRadius: 4,
                        background: "var(--background-secondary)"
                    }}
                >
                    <Text
                        variant="text-xs/medium"
                        style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                        LIVE: {stream.username}
                    </Text>
                    <Button
                        size={Button.Sizes.MIN}
                        color={Button.Colors.GREEN}
                        onClick={() => void handleWatch(stream.userId, stream.username, stream.title)}
                    >
                        Watch
                    </Button>
                </div>
            ))}
        </div>
    );
}
