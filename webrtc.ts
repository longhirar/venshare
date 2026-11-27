import { SelectedChannelStore, showToast, UserStore } from "@webpack/common";

import { SignalPayload } from "./codec";
import { resolveRtcConfig } from "./ice";
import { deleteSignalMessages, sendSignal } from "./signaling";
import { venshareStore } from "./store";

export type ResolutionPreset = "720" | "1080" | "1440" | "source";

export interface StartShareOptions {
    sourceId: string;
    sourceName: string;
    resolution: ResolutionPreset;
    fps: number;
    bitrateMbps: number;
    audio: boolean;
}

export interface WebRtcStatsSnapshot {
    fps: number;
    width: number;
    height: number;
    bitrateKbps: number;
    candidateType: string;
    ipFamily: string;
    protocol: string;
}

const RESOLUTION_DIMS: Record<Exclude<ResolutionPreset, "source">, { width: number; height: number }> = {
    "720": { width: 1280, height: 720 },
    "1080": { width: 1920, height: 1080 },
    "1440": { width: 2560, height: 1440 }
};

class WebRtcManager {
    private localStream: MediaStream | null = null;
    private currentBitrateMbps = 8;
    private viewerPeers = new Map<string, RTCPeerConnection>();
    private outgoingOfferMsgs = new Map<string, { channelId: string; messageIds: string[] }>();
    private viewerPc: RTCPeerConnection | null = null;
    private lastStatsBytes = 0;
    private lastStatsTimestamp = 0;

    private async gatherCompleteSdp(pc: RTCPeerConnection, timeoutMs = 5000): Promise<string> {
        if (pc.iceGatheringState === "complete" && pc.localDescription) {
            return pc.localDescription.sdp;
        }

        await new Promise<void>(resolve => {
            const timer = setTimeout(() => {
                pc.removeEventListener("icegatheringstatechange", onStateChange);
                resolve();
            }, timeoutMs);

            const onStateChange = () => {
                if (pc.iceGatheringState === "complete") {
                    clearTimeout(timer);
                    pc.removeEventListener("icegatheringstatechange", onStateChange);
                    resolve();
                }
            };

            pc.addEventListener("icegatheringstatechange", onStateChange);
        });

        if (!pc.localDescription) {
            throw new Error("Missing localDescription after ICE gathering");
        }

        return pc.localDescription.sdp;
    }

    private async applyVideoBitrate(pc: RTCPeerConnection, bitrateMbps: number): Promise<void> {
        const maxBitrate = Math.max(500_000, bitrateMbps * 1_000_000);
        for (const sender of pc.getSenders()) {
            if (sender.track?.kind !== "video") continue;
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = maxBitrate;
            await sender.setParameters(params).catch(() => {});
        }
    }

    async startStreaming(channelId: string, opts: StartShareOptions): Promise<void> {
        await this.stopStreaming(channelId);

        // Validate and warm up ICE/TURN credentials before capturing screen
        await resolveRtcConfig();

        const videoMandatory: Record<string, unknown> = {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: opts.sourceId,
            maxFrameRate: opts.fps
        };

        if (opts.resolution !== "source") {
            const dims = RESOLUTION_DIMS[opts.resolution];
            videoMandatory.maxWidth = dims.width;
            videoMandatory.maxHeight = dims.height;
        }

        const buildConstraints = (withAudio: boolean): MediaStreamConstraints => ({
            video: { mandatory: videoMandatory } as unknown as MediaTrackConstraints,
            audio: withAudio
                ? ({
                    mandatory: {
                        chromeMediaSource: "desktop",
                        chromeMediaSourceId: opts.sourceId
                    }
                } as unknown as MediaTrackConstraints)
                : false
        });

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(buildConstraints(opts.audio));
        } catch (err) {
            if (!opts.audio) throw err;
            // Fallback to video-only on platforms where desktop audio capture is unsupported
            stream = await navigator.mediaDevices.getUserMedia(buildConstraints(false));
            showToast({
                text: "Desktop audio capture unavailable on this source; streaming video only.",
                variant: "default"
            });
        }

        this.localStream = stream;
        this.currentBitrateMbps = opts.bitrateMbps;

        // Clean up if user clicks OS "Stop sharing" button
        const [videoTrack] = stream.getVideoTracks();
        videoTrack?.addEventListener("ended", () => {
            void this.stopStreaming(channelId);
        });

        venshareStore.setStreaming(true, opts.sourceName, stream);
        showToast({
            text: `Venshare Live: ${opts.sourceName}`,
            variant: "success"
        });

        await this.reannounceStream(channelId);
    }

    async reannounceStream(channelId: string): Promise<void> {
        const title = venshareStore.getState().streamTitle;
        const me = UserStore.getCurrentUser();
        if (!this.localStream || !title || !me) return;

        await sendSignal(channelId, {
            t: "announce",
            from: me.id,
            name: me.globalName || me.username,
            vc: channelId,
            title
        });
    }

    async stopStreaming(channelId?: string): Promise<void> {
        const wasStreaming = this.localStream !== null;

        for (const pc of this.viewerPeers.values()) {
            pc.close();
        }
        this.viewerPeers.clear();
        this.outgoingOfferMsgs.clear();

        if (this.localStream) {
            for (const track of this.localStream.getTracks()) {
                track.stop();
            }
            this.localStream = null;
        }

        venshareStore.setStreaming(false, null, null);

        if (wasStreaming && channelId) {
            const me = UserStore.getCurrentUser();
            if (me) {
                await sendSignal(channelId, {
                    t: "stop",
                    from: me.id,
                    vc: channelId
                }, 3000).catch(() => {});
            }
        }
    }

    async requestWatch(streamerId: string, channelId: string): Promise<void> {
        this.stopWatching();
        const me = UserStore.getCurrentUser();
        if (!me) return;

        venshareStore.setWatching(streamerId, "connecting", null);

        await sendSignal(channelId, {
            t: "watch",
            from: me.id,
            to: streamerId,
            vc: channelId
        }, 4000);
    }

    stopWatching(): void {
        if (this.viewerPc) {
            this.viewerPc.close();
            this.viewerPc = null;
        }
        this.lastStatsBytes = 0;
        this.lastStatsTimestamp = 0;
        venshareStore.setWatching(null, "idle", null);
    }

    async handleSignal(payload: SignalPayload, channelId: string): Promise<void> {
        const me = UserStore.getCurrentUser();
        if (!me || payload.from === me.id) return;

        const currentVc = venshareStore.getState().currentVoiceChannelId
            ?? SelectedChannelStore.getVoiceChannelId()
            ?? null;
        if (!currentVc || payload.vc !== currentVc) return;

        try {
            switch (payload.t) {
                case "announce":
                    venshareStore.upsertAvailableStream({
                        userId: payload.from,
                        username: payload.name,
                        channelId: payload.vc,
                        title: payload.title
                    });
                    break;

                case "stop":
                    venshareStore.removeAvailableStream(payload.from);
                    if (venshareStore.getState().watchingUserId === payload.from) {
                        this.stopWatching();
                    }
                    break;

                case "watch":
                    if (payload.to !== me.id || !this.localStream) return;
                    await this.handleWatchRequest(payload.from, channelId, me.id);
                    break;

                case "offer":
                    if (payload.to !== me.id) return;
                    await this.handleOffer(payload.from, channelId, me.id, payload.sdp, payload.ice);
                    break;

                case "answer":
                    if (payload.to !== me.id) return;
                    await this.handleAnswer(payload.from, payload.sdp);
                    break;
            }
        } catch (err) {
            console.error("[Venshare] Signal handling failed:", payload.t, err);
            if (payload.t === "offer" && venshareStore.getState().watchingUserId === payload.from) {
                venshareStore.setWatching(payload.from, "failed", venshareStore.getState().remoteStream);
            }
            showToast({
                text: `Venshare error (${payload.t}): ${err instanceof Error ? err.message : String(err)}`,
                variant: "critical"
            });
        }
    }

    private async handleWatchRequest(viewerId: string, channelId: string, myId: string): Promise<void> {
        if (!this.localStream) return;

        const { rtcConfig, shareableIceServers } = await resolveRtcConfig();

        this.viewerPeers.get(viewerId)?.close();
        const pc = new RTCPeerConnection(rtcConfig);
        this.viewerPeers.set(viewerId, pc);
        venshareStore.setActivePeersCount(this.viewerPeers.size);

        for (const track of this.localStream.getTracks()) {
            pc.addTrack(track, this.localStream);
        }

        await this.applyVideoBitrate(pc, this.currentBitrateMbps);

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
                if (pc.connectionState !== "disconnected") {
                    this.viewerPeers.delete(viewerId);
                    venshareStore.setActivePeersCount(this.viewerPeers.size);
                }
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sdp = await this.gatherCompleteSdp(pc);

        const messageIds = await sendSignal(channelId, {
            t: "offer",
            from: myId,
            to: viewerId,
            vc: channelId,
            sdp,
            ...(shareableIceServers ? { ice: shareableIceServers } : {})
        }, 10000);

        if (messageIds.length > 0) {
            this.outgoingOfferMsgs.set(viewerId, { channelId, messageIds });
        }
    }

    private async handleOffer(
        streamerId: string,
        channelId: string,
        myId: string,
        sdp: string,
        offeredIceServers?: RTCIceServer[]
    ): Promise<void> {
        const { rtcConfig } = await resolveRtcConfig({ overrideIceServers: offeredIceServers });

        this.viewerPc?.close();
        const pc = new RTCPeerConnection(rtcConfig);
        this.viewerPc = pc;

        const remoteStream = new MediaStream();
        pc.ontrack = event => {
            for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
                if (!remoteStream.getTracks().includes(track)) {
                    remoteStream.addTrack(track);
                }
            }
            venshareStore.setWatching(streamerId, "connected", remoteStream);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") {
                venshareStore.setWatching(streamerId, "connected", remoteStream);
            } else if (pc.connectionState === "failed") {
                venshareStore.setWatching(streamerId, "failed", remoteStream);
            }
        };

        await pc.setRemoteDescription({ type: "offer", sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const completeSdp = await this.gatherCompleteSdp(pc);

        await sendSignal(channelId, {
            t: "answer",
            from: myId,
            to: streamerId,
            vc: channelId,
            sdp: completeSdp
        }, 5000);
    }

    private async handleAnswer(viewerId: string, sdp: string): Promise<void> {
        const pc = this.viewerPeers.get(viewerId);
        if (!pc) return;

        await pc.setRemoteDescription({ type: "answer", sdp });

        const offerMsg = this.outgoingOfferMsgs.get(viewerId);
        if (offerMsg) {
            this.outgoingOfferMsgs.delete(viewerId);
            void deleteSignalMessages(offerMsg.channelId, offerMsg.messageIds);
        }
    }

    async getViewerStats(): Promise<WebRtcStatsSnapshot | null> {
        if (!this.viewerPc) return null;

        const stats = await this.viewerPc.getStats();
        let fps = 0;
        let width = 0;
        let height = 0;
        let bitrateKbps = 0;
        let selectedPairId: string | null = null;
        let localCandidateId: string | null = null;

        stats.forEach(report => {
            if (report.type === "inbound-rtp" && report.kind === "video") {
                fps = Math.round(report.framesPerSecond ?? 0);
                width = report.frameWidth ?? 0;
                height = report.frameHeight ?? 0;

                const now = report.timestamp;
                const bytes = report.bytesReceived ?? 0;
                if (this.lastStatsTimestamp > 0 && now > this.lastStatsTimestamp) {
                    const dtSec = (now - this.lastStatsTimestamp) / 1000;
                    bitrateKbps = Math.round(((bytes - this.lastStatsBytes) * 8) / dtSec / 1000);
                }
                this.lastStatsBytes = bytes;
                this.lastStatsTimestamp = now;
            } else if (report.type === "transport" && report.selectedCandidatePairId) {
                selectedPairId = report.selectedCandidatePairId;
            }
        });

        let candidateType = "unknown";
        let ipFamily = "unknown";
        let protocol = "udp";

        if (selectedPairId) {
            const pair = stats.get(selectedPairId);
            if (pair) {
                localCandidateId = pair.localCandidateId;
            }
        }

        if (localCandidateId) {
            const cand = stats.get(localCandidateId);
            if (cand) {
                candidateType = cand.candidateType ?? "unknown";
                protocol = cand.protocol ?? "udp";
                const ip: string = cand.address ?? cand.ip ?? "";
                ipFamily = ip.includes(":") ? "IPv6" : ip ? "IPv4" : "unknown";
            }
        }

        return { fps, width, height, bitrateKbps, candidateType, ipFamily, protocol };
    }
}

export const webrtcManager = new WebRtcManager();
