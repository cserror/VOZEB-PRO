export const GENERATION_HISTORY_PAGE_SIZE = 24;
export const GENERATION_HISTORY_ZIP_LIMIT_BYTES = 256 * 1024 * 1024;

export type GenerationHistoryKind = "image" | "video";
export type GenerationHistoryStatus = "pending" | "success" | "failed";

export type GenerationHistoryAsset = {
    type: GenerationHistoryKind;
    url: string;
    remoteUrl?: string;
    serverUrl?: string;
    storageKey?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    bytes?: number;
};

export type GenerationHistoryItem = {
    id: string;
    logId: string;
    slotId?: string;
    assetIndex?: number;
    kind: GenerationHistoryKind;
    source: "agent" | "image-workbench" | "video-workbench" | "canvas" | "drama" | "unknown";
    status: GenerationHistoryStatus;
    title: string;
    originalPrompt: string;
    optimizedPrompt?: string;
    model: string;
    parameters: Record<string, string>;
    pointsCost?: number;
    conversationId?: string;
    projectId?: string;
    continueHref?: string;
    asset?: GenerationHistoryAsset;
    error?: string;
    durationMs: number;
    createdAt: string;
    completedAt?: string;
    addedToLibrary: boolean;
};

export type GenerationHistoryPage = {
    items: GenerationHistoryItem[];
    total: number;
    page: number;
    pageSize: number;
};

export type GenerationHistoryResultIdentity = { logId: string; slotId?: string; assetIndex?: number };

export function generationHistoryResultId(identity: GenerationHistoryResultIdentity) {
    const logId = encodeURIComponent(identity.logId.trim());
    if (identity.slotId) return `slot:${logId}:${encodeURIComponent(identity.slotId)}:${identity.assetIndex === undefined ? "" : identity.assetIndex}`;
    if (identity.assetIndex !== undefined) return `asset:${logId}:${identity.assetIndex}`;
    return `log:${logId}`;
}

export function parseGenerationHistoryResultId(value: string): GenerationHistoryResultIdentity | null {
    const parts = value.split(":");
    try {
        if (parts[0] === "slot" && parts.length === 4) {
            const logId = decodeURIComponent(parts[1] || "").trim();
            const slotId = decodeURIComponent(parts[2] || "").trim();
            const assetIndex = optionalIndex(parts[3]);
            return logId && slotId && assetIndex !== null ? { logId, slotId, ...(assetIndex === undefined ? {} : { assetIndex }) } : null;
        }
        if (parts[0] === "asset" && parts.length === 3) {
            const logId = decodeURIComponent(parts[1] || "").trim();
            const assetIndex = requiredIndex(parts[2]);
            return logId && assetIndex !== null ? { logId, assetIndex } : null;
        }
        if (parts[0] === "log" && parts.length === 2) {
            const logId = decodeURIComponent(parts[1] || "").trim();
            return logId ? { logId } : null;
        }
    } catch {
        return null;
    }
    return null;
}

function requiredIndex(value: string | undefined) {
    const index = Number(value);
    return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function optionalIndex(value: string | undefined): number | undefined | null {
    return value === "" || value === undefined ? undefined : requiredIndex(value);
}
