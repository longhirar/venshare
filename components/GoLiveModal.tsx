import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { Text } from "@components/Text";
import { PluginNative } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, React, showToast, TextInput, useEffect, useState } from "@webpack/common";

import { clearTurnCache, IceProvider, testTurnConfig } from "../ice";
import type { CaptureSource } from "../native";
import { settings } from "../settings";
import { ResolutionPreset, webrtcManager } from "../webrtc";

const Native = VencordNative.pluginHelpers.Venshare as PluginNative<typeof import("../native")>;

interface GoLiveModalProps {
    modalProps: RenderModalProps;
    channelId: string;
}

const ICE_OPTIONS: Array<{ value: IceProvider; label: string }> = [
    { value: "cf-turn", label: "Cloudflare TURN" },
    { value: "custom-turn", label: "Custom TURN/STUN" },
    { value: "stun-only", label: "STUN Only" }
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

    const [iceProvider, setIceProvider] = useState<IceProvider>(
        (settings.store.iceProvider as IceProvider) ?? "cf-turn"
    );
    const [cfTurnKeyId, setCfTurnKeyId] = useState<string>(settings.store.cfTurnKeyId ?? "");
    const [cfTurnApiToken, setCfTurnApiToken] = useState<string>(settings.store.cfTurnApiToken ?? "");
    const [customTurnUrls, setCustomTurnUrls] = useState<string>(settings.store.customTurnUrls ?? "");
    const [customTurnUsername, setCustomTurnUsername] = useState<string>(settings.store.customTurnUsername ?? "");
    const [customTurnCredential, setCustomTurnCredential] = useState<string>(settings.store.customTurnCredential ?? "");
    const [forceTurnRelay, setForceTurnRelay] = useState<boolean>(Boolean(settings.store.forceTurnRelay));

    const [testingTurn, setTestingTurn] = useState(false);
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

    const persistIceSettings = () => {
        settings.store.iceProvider = iceProvider;
        settings.store.cfTurnKeyId = cfTurnKeyId;
        settings.store.cfTurnApiToken = cfTurnApiToken;
        settings.store.customTurnUrls = customTurnUrls;
        settings.store.customTurnUsername = customTurnUsername;
        settings.store.customTurnCredential = customTurnCredential;
        settings.store.forceTurnRelay = forceTurnRelay;
    };

    const handleIceProviderChange = (provider: IceProvider) => {
        setIceProvider(provider);
        settings.store.iceProvider = provider;
        clearTurnCache();
    };

    const handleTestTurn = async () => {
        persistIceSettings();
        setTestingTurn(true);
        try {
            const result = await testTurnConfig();
            showToast({
                text: `ICE config OK (${result.serverCount} server group${result.serverCount === 1 ? "" : "s"}, TURN ${result.hasTurn ? "enabled" : "not present"})`,
                variant: "success"
            });
        } catch (err) {
            showToast({
                text: err instanceof Error ? err.message : String(err),
                variant: "critical"
            });
        } finally {
            setTestingTurn(false);
        }
    };

    const handleStart = async () => {
        const chosen = sources.find(s => s.id === selectedId);
        if (!chosen) return;

        persistIceSettings();

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
                text: `Failed to start stream: ${err instanceof Error ? err.message : String(err)}`,
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
            title="Venshare — WebRTC Screen Share"
            actions={[
                {
                    text: "Cancel",
                    variant: "secondary",
                    onClick: modalProps.onClose
                },
                {
                    text: starting ? "Starting..." : "Go Live",
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
                            maxHeight: 240,
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
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text size="xs" weight="semibold" tag="h5" style={{ textTransform: "uppercase" }}>
                            ICE / TURN Server
                        </Text>
                        <Button
                            size="min"
                            variant="secondary"
                            disabled={testingTurn}
                            onClick={() => void handleTestTurn()}
                        >
                            {testingTurn ? "Testing..." : "Test Config"}
                        </Button>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: iceProvider !== "stun-only" ? 8 : 0 }}>
                        {ICE_OPTIONS.map(opt => (
                            <Button
                                key={opt.value}
                                size="small"
                                variant={iceProvider === opt.value ? "primary" : "secondary"}
                                onClick={() => handleIceProviderChange(opt.value)}
                            >
                                {opt.label}
                            </Button>
                        ))}
                    </div>

                    {iceProvider === "cf-turn" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <TextInput
                                value={cfTurnKeyId}
                                onChange={val => {
                                    setCfTurnKeyId(val);
                                    settings.store.cfTurnKeyId = val;
                                    clearTurnCache();
                                }}
                                placeholder="Cloudflare TURN Key ID"
                            />
                            <TextInput
                                type="password"
                                value={cfTurnApiToken}
                                onChange={val => {
                                    setCfTurnApiToken(val);
                                    settings.store.cfTurnApiToken = val;
                                    clearTurnCache();
                                }}
                                placeholder="Cloudflare TURN API Token"
                            />
                            <Text size="xs" style={{ color: "var(--text-muted)" }}>
                                Generates short-lived TURN credentials via Cloudflare Realtime API. Viewers automatically receive temporary credentials in the offer.
                            </Text>
                        </div>
                    )}

                    {iceProvider === "custom-turn" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <TextInput
                                value={customTurnUrls}
                                onChange={val => {
                                    setCustomTurnUrls(val);
                                    settings.store.customTurnUrls = val;
                                }}
                                placeholder="turn:turn.example.com:3478, turns:turn.example.com:5349"
                            />
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <TextInput
                                    value={customTurnUsername}
                                    onChange={val => {
                                        setCustomTurnUsername(val);
                                        settings.store.customTurnUsername = val;
                                    }}
                                    placeholder="Username (optional)"
                                />
                                <TextInput
                                    type="password"
                                    value={customTurnCredential}
                                    onChange={val => {
                                        setCustomTurnCredential(val);
                                        settings.store.customTurnCredential = val;
                                    }}
                                    placeholder="Credential / Password (optional)"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {iceProvider !== "stun-only" && (
                    <FormSwitch
                        title="Force TURN Relay"
                        description="Route all media through TURN (hides IP addresses and bypasses strict NAT)"
                        value={forceTurnRelay}
                        onChange={val => {
                            setForceTurnRelay(val);
                            settings.store.forceTurnRelay = val;
                        }}
                        hideBorder
                    />
                )}

                <FormSwitch
                    title="Share Audio"
                    description="Capture desktop/window audio (falls back to video-only if unsupported)"
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
