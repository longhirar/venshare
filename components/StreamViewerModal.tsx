import {
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalProps,
    ModalRoot,
    ModalSize,
    openModal
} from "@utils/modal";
import { Button, React, Text, useEffect, useRef, useState } from "@webpack/common";

import { useVenshareState } from "../store";
import { webrtcManager, WebRtcStatsSnapshot } from "../webrtc";

interface StreamViewerModalProps {
    modalProps: ModalProps;
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
        <ModalRoot {...modalProps} size={ModalSize.LARGE}>
            <ModalHeader separator={false}>
                <div style={{ flexGrow: 1 }}>
                    <Text variant="heading-md/semibold">
                        {streamerName} — {streamTitle}
                    </Text>
                    <Text variant="text-xs/normal" color="text-muted">
                        Status: {viewerState}
                        {stats && stats.width > 0
                            ? ` • ${stats.width}x${stats.height} @ ${stats.fps}fps • ${stats.bitrateKbps} kbps • ${stats.candidateType} (${stats.ipFamily}/${stats.protocol})`
                            : ""}
                    </Text>
                </div>
                <ModalCloseButton onClick={handleClose} />
            </ModalHeader>

            <ModalContent style={{ padding: 0, background: "#000" }}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{
                        width: "100%",
                        maxHeight: "70vh",
                        display: "block",
                        background: "#000"
                    }}
                />
            </ModalContent>

            <ModalFooter>
                <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Button size={Button.Sizes.SMALL} onClick={() => setMuted(m => !m)}>
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
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <Button size={Button.Sizes.SMALL} onClick={handlePip}>
                            PiP
                        </Button>
                        <Button size={Button.Sizes.SMALL} onClick={handleFullscreen}>
                            Fullscreen
                        </Button>
                        <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={handleClose}>
                            Leave Stream
                        </Button>
                    </div>
                </div>
            </ModalFooter>
        </ModalRoot>
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
