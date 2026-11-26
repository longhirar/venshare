import { useEffect, useState } from "@webpack/common";

export interface ActiveStreamInfo {
    userId: string;
    username: string;
    channelId: string;
    title: string;
}

export type ViewerConnectionState = "idle" | "connecting" | "connected" | "failed";

export interface VenshareState {
    currentVoiceChannelId: string | null;
    isStreaming: boolean;
    streamTitle: string | null;
    localStream: MediaStream | null;
    activePeersCount: number;
    availableStreams: Record<string, ActiveStreamInfo>;
    watchingUserId: string | null;
    remoteStream: MediaStream | null;
    viewerState: ViewerConnectionState;
}

type Listener = () => void;

const initialState: VenshareState = {
    currentVoiceChannelId: null,
    isStreaming: false,
    streamTitle: null,
    localStream: null,
    activePeersCount: 0,
    availableStreams: {},
    watchingUserId: null,
    remoteStream: null,
    viewerState: "idle"
};

let state: VenshareState = { ...initialState };
const listeners = new Set<Listener>();

function emit() {
    for (const listener of listeners) {
        listener();
    }
}

export const venshareStore = {
    getState(): VenshareState {
        return state;
    },

    setVoiceChannel(channelId: string | null) {
        if (state.currentVoiceChannelId === channelId) return;
        state = {
            ...state,
            currentVoiceChannelId: channelId,
            availableStreams: {}
        };
        emit();
    },

    setStreaming(isStreaming: boolean, streamTitle: string | null = null, localStream: MediaStream | null = null) {
        state = {
            ...state,
            isStreaming,
            streamTitle,
            localStream,
            activePeersCount: isStreaming ? state.activePeersCount : 0
        };
        emit();
    },

    setActivePeersCount(count: number) {
        if (state.activePeersCount === count) return;
        state = { ...state, activePeersCount: count };
        emit();
    },

    upsertAvailableStream(info: ActiveStreamInfo) {
        state = {
            ...state,
            availableStreams: {
                ...state.availableStreams,
                [info.userId]: info
            }
        };
        emit();
    },

    removeAvailableStream(userId: string) {
        if (!state.availableStreams[userId]) return;
        const next = { ...state.availableStreams };
        delete next[userId];
        state = { ...state, availableStreams: next };
        emit();
    },

    setWatching(userId: string | null, viewerState: ViewerConnectionState, remoteStream: MediaStream | null = null) {
        state = {
            ...state,
            watchingUserId: userId,
            viewerState,
            remoteStream
        };
        emit();
    },

    reset() {
        state = { ...initialState };
        emit();
    }
};

export function useVenshareState(): VenshareState {
    const [snapshot, setSnapshot] = useState<VenshareState>(() => venshareStore.getState());

    useEffect(() => {
        const update = () => setSnapshot(venshareStore.getState());
        listeners.add(update);
        return () => {
            listeners.delete(update);
        };
    }, []);

    return snapshot;
}
