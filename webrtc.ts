import { UserStore } from "@webpack/common";

import { SignalPayload } from "./codec";
import { settings } from "./settings";
import { deleteSignalMessage, sendSignal } from "./signaling";
import { venshareStore } from "./store";
import { buildRtcConfig, StunProvider } from "./stun";

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
    private outgoingOfferMsgs = new Map<string, { channelId: string; messageId: string }>();
    private viewerPc: RTCPeerConnection | null = null;
    private lastStatsBytes = 0;
    private lastStatsTimestamp = 0;

    private getRtcConfig(): RTCConfiguration {
        const provider = (settings.store.stunProvider ?? "cf") as StunProvider;
        const customUrl = settings.store.customStunUrl ?? "";
        return buildRtcConfig(provider, customUrl);
    }

    private async gatherCompleteSdp(pc: RTCPeerConnection, timeoutMs = 2500): Promise<string> {
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

        const constraints: MediaStreamConstraints = {
            video: { mandatory: videoMandatory } as unknown as MediaTrackConstraints,
            audio: opts.audio
                ? ({
                    mandatory: {
                        chromeMediaSource: "desktop",
                        chromeMediaSourceId: opts.sourceId
                    }
                } as unknown as MediaTrackConstraints)
                : false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.localStream = stream;
        this.currentBitrateMbps = opts.bitrateMbps;

        // Clean up if user clicks OS "Stop sharing" button
        const [videoTrack] = stream.getVideoTracks();
        videoTrack?.addEventListener("ended", () => {
            void this.stopStreaming(channelId);
        });

        venshareStore.setStreaming(true, opts.sourceName, stream);

        const me = UserStore.getCurrentUser();
        if (me) {
            await sendSignal(channelId, {
                t: "announce",
                from: me.id,
                name: me.globalName || me.username,
                vc: channelId,
                title: opts.sourceName
            });
        }
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

        const currentVc = venshareStore.getState().currentVoiceChannelId;
        if (!currentVc || payload.vc !== currentVc) return;

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
                await this.handleOffer(payload.from, channelId, me.id, payload.sdp);
                break;

            case "answer":
                if (payload.to !== me.id) return;
                await this.handleAnswer(payload.from, payload.sdp);
                break;
        }
    }

    private async handleWatchRequest(viewerId: string, channelId: string, myId: string): Promise<void> {
        if (!this.localStream) return;

        this.viewerPeers.get(viewerId)?.close();
        const pc = new RTCPeerConnection(this.getRtcConfig());
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

        const messageId = await sendSignal(channelId, {
            t: "offer",
            from: myId,
            to: viewerId,
            vc: channelId,
            sdp
        }, 10000);

        if (messageId) {
            this.outgoingOfferMsgs.set(viewerId, { channelId, messageId });
        }
    }

    private async handleOffer(streamerId: string, channelId: string, myId: string, sdp: string): Promise<void> {
        this.viewerPc?.close();
        const pc = new RTCPeerConnection(this.getRtcConfig());
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
            void deleteSignalMessage(offerMsg.channelId, offerMsg.messageId);
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
