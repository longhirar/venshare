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
import { Button, Forms, React, Switch, Text, TextInput, Toasts, useEffect, useState } from "@webpack/common";
import { PluginNative } from "@utils/types";

import type { CaptureSource } from "../native";
import { settings } from "../settings";
import { StunProvider } from "../stun";
import { ResolutionPreset, webrtcManager } from "../webrtc";

const Native = VencordNative.pluginHelpers.Venshare as PluginNative<typeof import("../native")>;

interface GoLiveModalProps {
    modalProps: ModalProps;
    channelId: string;
}

const STUN_OPTIONS: Array<{ value: StunProvider; label: string }> = [
    { value: "cf", label: "Cloudflare" },
    { value: "google", label: "Google" },
    { value: "custom", label: "Custom" }
];

function GoLiveModal({ modalProps, channelId }: GoLiveModalProps) {
    const [sources, setSources] = useState<CaptureSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string>("");
    const [resolution, setResolution] = useState<ResolutionPreset>(
        (settings.store.defaultResolution as ResolutionPreset) ?? "1080"
    );
    const [fps, setFps] = useState<number>(Number(settings.store.defaultFps) || 60);
    const [bitrateMbps, setBitrateMbps] = useState<number>(Number(settings.store.videoBitrateMbps) || 8);
    const [audio, setAudio] = useState(true);
    const [stunProvider, setStunProvider] = useState<StunProvider>(
        (settings.store.stunProvider as StunProvider) ?? "cf"
    );
    const [customStun, setCustomStun] = useState<string>(settings.store.customStunUrl ?? "");
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        let mounted = true;
        Native.getCaptureSources()
            .then(list => {
                if (!mounted) return;
                setSources(list);
                if (list.length > 0) setSelectedId(list[0].id);
            })
            .catch(err => {
                Toasts.show({
                    message: `Failed to list screens: ${String(err)}`,
                    type: Toasts.Type.FAILURE,
                    id: Toasts.genId()
                });
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, []);

    const handleStunChange = (provider: StunProvider) => {
        setStunProvider(provider);
        settings.store.stunProvider = provider;
    };

    const handleStart = async () => {
        const chosen = sources.find(s => s.id === selectedId);
        if (!chosen) return;

        settings.store.stunProvider = stunProvider;
        if (stunProvider === "custom") {
            settings.store.customStunUrl = customStun;
        }

        setStarting(true);
        try {
            await webrtcManager.startStreaming(channelId, {
                sourceId: chosen.id,
                sourceName: chosen.name,
                resolution,
                fps,
                bitrateMbps,
                audio
            });
            modalProps.onClose();
        } catch (err) {
            Toasts.show({
                message: `Failed to start P2P stream: ${String(err)}`,
                type: Toasts.Type.FAILURE,
                id: Toasts.genId()
            });
        } finally {
            setStarting(false);
        }
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE}>
            <ModalHeader separator={false}>
                <Text variant="heading-lg/semibold" style={{ flexGrow: 1 }}>
                    Venshare — P2P Screen Share
                </Text>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>

            <ModalContent style={{ paddingBottom: 16 }}>
                <Forms.FormTitle tag="h5">Choose Screen or Window</Forms.FormTitle>
                {loading ? (
                    <Text variant="text-sm/normal" color="text-muted">Loading capture sources...</Text>
                ) : (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))",
                            gap: 10,
                            maxHeight: 260,
                            overflowY: "auto",
                            padding: 4,
                            marginBottom: 16
                        }}
                    >
                        {sources.map(src => {
                            const active = src.id === selectedId;
                            return (
                                <button
                                    key={src.id}
                                    type="button"
                                    onClick={() => setSelectedId(src.id)}
                                    style={{
                                        background: "var(--background-secondary)",
                                        border: active
                                            ? "2px solid var(--brand-experiment)"
                                            : "2px solid transparent",
                                        borderRadius: 8,
                                        padding: 6,
                                        cursor: "pointer",
                                        textAlign: "left",
                                        color: "var(--text-normal)"
                                    }}
                                >
                                    <img
                                        src={src.thumbnailDataUrl}
                                        alt={src.name}
                                        style={{
                                            width: "100%",
                                            height: 92,
                                            objectFit: "cover",
                                            borderRadius: 4,
                                            background: "#000"
                                        }}
                                    />
                                    <div
                                        style={{
                                            marginTop: 6,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis"
                                        }}
                                        title={src.name}
                                    >
                                        {src.name}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                        <Forms.FormTitle tag="h5">Resolution</Forms.FormTitle>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {(["720", "1080", "1440", "source"] as ResolutionPreset[]).map(res => (
                                <Button
                                    key={res}
                                    size={Button.Sizes.SMALL}
                                    color={resolution === res ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                                    onClick={() => setResolution(res)}
                                >
                                    {res === "source" ? "Source" : `${res}p`}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Forms.FormTitle tag="h5">Frame Rate</Forms.FormTitle>
                        <div style={{ display: "flex", gap: 6 }}>
                            {[30, 60].map(targetFps => (
                                <Button
                                    key={targetFps}
                                    size={Button.Sizes.SMALL}
                                    color={fps === targetFps ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                                    onClick={() => setFps(targetFps)}
                                >
                                    {targetFps} FPS
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <Forms.FormTitle tag="h5">Max Video Bitrate: {bitrateMbps} Mbps</Forms.FormTitle>
                    <input
                        type="range"
                        min={2}
                        max={20}
                        step={1}
                        value={bitrateMbps}
                        onChange={e => setBitrateMbps(Number(e.target.value))}
                        style={{ width: "100%" }}
                    />
                </div>

                <div style={{ marginBottom: 12 }}>
                    <Forms.FormTitle tag="h5">STUN Server (P2P / IPv6)</Forms.FormTitle>
                    <div style={{ display: "flex", gap: 6, marginBottom: stunProvider === "custom" ? 8 : 0 }}>
                        {STUN_OPTIONS.map(opt => (
                            <Button
                                key={opt.value}
                                size={Button.Sizes.SMALL}
                                color={stunProvider === opt.value ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                                onClick={() => handleStunChange(opt.value)}
                            >
                                {opt.label}
                            </Button>
                        ))}
                    </div>
                    {stunProvider === "custom" && (
                        <TextInput
                            value={customStun}
                            onChange={val => {
                                setCustomStun(val);
                                settings.store.customStunUrl = val;
                            }}
                            placeholder="stun:your-stun-server:3478"
                        />
                    )}
                </div>

                <Switch
                    value={audio}
                    onChange={setAudio}
                    note="Capture desktop/window audio (works best on Windows & macOS 13+)"
                    hideBorder
                >
                    Share Audio
                </Switch>
            </ModalContent>

            <ModalFooter>
                <Button
                    color={Button.Colors.BRAND}
                    disabled={!selectedId || starting}
                    onClick={handleStart}
                >
                    {starting ? "Starting..." : "Go Live (P2P)"}
                </Button>
                <Button
                    color={Button.Colors.TRANSPARENT}
                    look={Button.Looks.LINK}
                    onClick={modalProps.onClose}
                >
                    Cancel
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

export function openGoLiveModal(channelId: string) {
    openModal(modalProps => <GoLiveModal modalProps={modalProps} channelId={channelId} />);
}
