import { desktopCapturer, IpcMainInvokeEvent } from "electron";

export interface CaptureSource {
    id: string;
    name: string;
    thumbnailDataUrl: string;
    appIconDataUrl: string | null;
    type: "screen" | "window";
}

export async function getCaptureSources(_event: IpcMainInvokeEvent): Promise<CaptureSource[]> {
    const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
    });

    return sources.map(src => ({
        id: src.id,
        name: src.name,
        thumbnailDataUrl: src.thumbnail.toDataURL(),
        appIconDataUrl: src.appIcon ? src.appIcon.toDataURL() : null,
        type: src.id.startsWith("screen:") ? "screen" : "window"
    }));
}
