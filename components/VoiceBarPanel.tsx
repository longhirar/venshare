import { Button } from "@components/Button";
import { Text } from "@components/Text";
import { React, showToast } from "@webpack/common";

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
            showToast({
                text: `Failed to connect to stream: ${String(err)}`,
                variant: "critical"
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
                <Text size="xs" weight="semibold">
                    {isStreaming ? `P2P Live (${activePeersCount} watching)` : "Venshare P2P"}
                </Text>
                {isStreaming ? (
                    <Button
                        size="min"
                        variant="dangerPrimary"
                        onClick={() => void webrtcManager.stopStreaming(currentVoiceChannelId)}
                    >
                        Stop
                    </Button>
                ) : (
                    <Button
                        size="min"
                        variant="primary"
                        onClick={() => openGoLiveModal(currentVoiceChannelId)}
                    >
                        Share Screen
                    </Button>
                )}
            </div>

            {isStreaming && streamTitle && (
                <Text
                    size="xs"
                    style={{
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                    }}
                >
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
                        size="xs"
                        weight="medium"
                        style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                        LIVE: {stream.username}
                    </Text>
                    <Button
                        size="min"
                        variant="positive"
                        onClick={() => void handleWatch(stream.userId, stream.username, stream.title)}
                    >
                        Watch
                    </Button>
                </div>
            ))}
        </div>
    );
}
