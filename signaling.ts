import { Constants, RestAPI } from "@webpack/common";

import { encodeSignal, SignalPayload } from "./codec";
import { settings } from "./settings";

interface PendingMessage {
    channelId: string;
    messageId: string;
    timer: ReturnType<typeof setTimeout>;
}

const pendingDeletes = new Map<string, PendingMessage>();

export async function deleteSignalMessage(channelId: string, messageId: string): Promise<void> {
    const pending = pendingDeletes.get(messageId);
    if (pending) {
        clearTimeout(pending.timer);
        pendingDeletes.delete(messageId);
    }

    try {
        await RestAPI.del({
            url: Constants.Endpoints.MESSAGE(channelId, messageId)
        });
    } catch {
        // Ignore if already deleted or lacking access
    }
}

/**
 * Sends a compressed signaling message to the Discord channel and schedules auto-deletion.
 */
export async function sendSignal(
    channelId: string,
    payload: SignalPayload,
    overrideDelayMs?: number
): Promise<string | null> {
    const content = await encodeSignal(payload);
    if (content.length > 2000) {
        throw new Error(`Signaling payload too large (${content.length} chars)`);
    }

    const res = await RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channelId),
        body: { content }
    });

    const messageId: string | undefined = res?.body?.id;
    if (!messageId) return null;

    const delayMs = overrideDelayMs ?? settings.store.autoDeleteDelayMs ?? 5000;
    const timer = setTimeout(() => {
        void deleteSignalMessage(channelId, messageId);
    }, delayMs);

    pendingDeletes.set(messageId, { channelId, messageId, timer });
    return messageId;
}

/**
 * Immediately deletes all pending signaling messages (e.g. on plugin stop).
 */
export async function flushPendingDeletes(): Promise<void> {
    const items = Array.from(pendingDeletes.values());
    await Promise.all(items.map(item => deleteSignalMessage(item.channelId, item.messageId)));
}
