import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { Text } from "@components/Text";
import { PluginNative } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, React, showToast, TextInput, useEffect, useState } from "@webpack/common";

import type { CaptureSource } from "../native";
import { settings } from "../settings";
import { StunProvider } from "../stun";
import { ResolutionPreset, webrtcManager } from "../webrtc";

const Native = VencordNative.pluginHelpers.Venshare as PluginNative<typeof import("../native")>;

interface GoLiveModalProps {
    modalProps: RenderModalProps;
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
                showToast({
                    text: `Failed to list screens: ${String(err)}`,
                    variant: "critical"
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
            showToast({
                text: `Failed to start P2P stream: ${String(err)}`,
                variant: "critical"
            });
        } finally {
            setStarting(false);
        }
    };

    return (
        <Modal
            {...modalProps}
            size="lg"
            title="Venshare — P2P Screen Share"
            actions={[
                {
                    text: "Cancel",
                    variant: "secondary",
                    onClick: modalProps.onClose
                },
                {
                    text: starting ? "Starting..." : "Go Live (P2P)",
                    variant: "primary",
                    disabled: !selectedId || starting,
                    onClick: handleStart
                }
            ]}
        >
            <div style={{ paddingBottom: 16 }}>
                <Text size="xs" weight="semibold" tag="h5" style={{ marginBottom: 8, textTransform: "uppercase" }}>
                    Choose Screen or Window
                </Text>
                {loading ? (
                    <Text size="sm" style={{ color: "var(--text-muted)" }}>Loading capture sources...</Text>
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
                        <Text size="xs" weight="semibold" tag="h5" style={{ marginBottom: 6, textTransform: "uppercase" }}>
                            Resolution
                        </Text>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {(["720", "1080", "1440", "source"] as ResolutionPreset[]).map(res => (
                                <Button
                                    key={res}
                                    size="small"
                                    variant={resolution === res ? "primary" : "secondary"}
                                    onClick={() => setResolution(res)}
                                >
                                    {res === "source" ? "Source" : `${res}p`}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Text size="xs" weight="semibold" tag="h5" style={{ marginBottom: 6, textTransform: "uppercase" }}>
                            Frame Rate
                        </Text>
                        <div style={{ display: "flex", gap: 6 }}>
                            {[30, 60].map(targetFps => (
                                <Button
                                    key={targetFps}
                                    size="small"
                                    variant={fps === targetFps ? "primary" : "secondary"}
                                    onClick={() => setFps(targetFps)}
                                >
                                    {targetFps} FPS
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <Text size="xs" weight="semibold" tag="h5" style={{ marginBottom: 6, textTransform: "uppercase" }}>
                        Max Video Bitrate: {bitrateMbps} Mbps
                    </Text>
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
                    <Text size="xs" weight="semibold" tag="h5" style={{ marginBottom: 6, textTransform: "uppercase" }}>
                        STUN Server (P2P / IPv6)
                    </Text>
                    <div style={{ display: "flex", gap: 6, marginBottom: stunProvider === "custom" ? 8 : 0 }}>
                        {STUN_OPTIONS.map(opt => (
                            <Button
                                key={opt.value}
                                size="small"
                                variant={stunProvider === opt.value ? "primary" : "secondary"}
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

                <FormSwitch
                    title="Share Audio"
                    description="Capture desktop/window audio (works best on Windows & macOS 13+)"
                    value={audio}
                    onChange={setAudio}
                    hideBorder
                />
            </div>
        </Modal>
    );
}

export function openGoLiveModal(channelId: string) {
    openModal(modalProps => <GoLiveModal modalProps={modalProps} channelId={channelId} />);
}
