import { Button } from "@components/Button";
import { Text } from "@components/Text";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, React, useEffect, useRef, useState } from "@webpack/common";

import { useVenshareState } from "../store";
import { webrtcManager, WebRtcStatsSnapshot } from "../webrtc";

interface StreamViewerModalProps {
    modalProps: RenderModalProps;
    streamerName: string;
    streamTitle: string;
}

function StreamViewerModal({ modalProps, streamerName, streamTitle }: StreamViewerModalProps) {
    const { remoteStream, viewerState } = useVenshareState();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [stats, setStats] = useState<WebRtcStatsSnapshot | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = remoteStream;
    }, [remoteStream]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.volume = volume;
        video.muted = muted;
    }, [volume, muted]);

    useEffect(() => {
        const interval = setInterval(() => {
            void webrtcManager.getViewerStats().then(s => {
                if (s) setStats(s);
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleClose = () => {
        webrtcManager.stopWatching();
        modalProps.onClose();
    };

    const handleFullscreen = () => {
        void videoRef.current?.requestFullscreen?.();
    };

    const handlePip = () => {
        const video = videoRef.current;
        if (!video) return;
        if (document.pictureInPictureElement) {
            void document.exitPictureInPicture();
        } else {
            void video.requestPictureInPicture?.();
        }
    };

    return (
        <Modal
            {...modalProps}
            size="lg"
            title={`${streamerName} — ${streamTitle}`}
            subtitle={
                `Status: ${viewerState}` +
                (stats && stats.width > 0
                    ? ` • ${stats.width}x${stats.height} @ ${stats.fps}fps • ${stats.bitrateKbps} kbps • ${stats.candidateType} (${stats.ipFamily}/${stats.protocol})`
                    : "")
            }
            actions={[
                {
                    text: "Leave Stream",
                    variant: "critical-primary",
                    onClick: handleClose
                }
            ]}
        >
            <div style={{ background: "#000", borderRadius: 6, overflow: "hidden" }}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{
                        width: "100%",
                        maxHeight: "65vh",
                        display: "block",
                        background: "#000"
                    }}
                />
            </div>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    marginTop: 12
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Button size="small" variant="secondary" onClick={() => setMuted(m => !m)}>
                        {muted ? "Unmute" : "Mute"}
                    </Button>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={muted ? 0 : volume}
                        onChange={e => {
                            setMuted(false);
                            setVolume(Number(e.target.value));
                        }}
                    />
                    <Text size="xs" style={{ color: "var(--text-muted)" }}>
                        {Math.round((muted ? 0 : volume) * 100)}%
                    </Text>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <Button size="small" variant="secondary" onClick={handlePip}>
                        PiP
                    </Button>
                    <Button size="small" variant="secondary" onClick={handleFullscreen}>
                        Fullscreen
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export function openStreamViewerModal(streamerName: string, streamTitle: string) {
    openModal(modalProps => (
        <StreamViewerModal
            modalProps={modalProps}
            streamerName={streamerName}
            streamTitle={streamTitle}
        />
    ));
}
