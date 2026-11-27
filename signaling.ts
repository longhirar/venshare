import { Constants, RestAPI } from "@webpack/common";

import { encodeSignalMessages, SignalPayload } from "./codec";
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

export async function deleteSignalMessages(channelId: string, messageIds: string[]): Promise<void> {
    await Promise.all(messageIds.map(id => deleteSignalMessage(channelId, id)));
}

/**
 * Sends a compressed signaling message (automatically chunked if > 1900 chars)
 * to the Discord channel and schedules auto-deletion for all sent parts.
 */
export async function sendSignal(
    channelId: string,
    payload: SignalPayload,
    overrideDelayMs?: number
): Promise<string[]> {
    const chunks = await encodeSignalMessages(payload);
    const delayMs = overrideDelayMs ?? settings.store.autoDeleteDelayMs ?? 5000;
    const messageIds: string[] = [];

    for (const content of chunks) {
        const res = await RestAPI.post({
            url: Constants.Endpoints.MESSAGES(channelId),
            body: { content }
        });

        const messageId: string | undefined = res?.body?.id;
        if (!messageId) continue;

        messageIds.push(messageId);
        const timer = setTimeout(() => {
            void deleteSignalMessage(channelId, messageId);
        }, delayMs);

        pendingDeletes.set(messageId, { channelId, messageId, timer });
    }

    return messageIds;
}

/**
 * Immediately deletes all pending signaling messages (e.g. on plugin stop).
 */
export async function flushPendingDeletes(): Promise<void> {
    const items = Array.from(pendingDeletes.values());
    await Promise.all(items.map(item => deleteSignalMessage(item.channelId, item.messageId)));
}
