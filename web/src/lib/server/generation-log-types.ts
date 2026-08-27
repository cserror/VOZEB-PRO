import type { GenerationLogRequestSnapshot, GenerationLogSnapshotParameters } from "@/lib/generation-log-snapshot";

export type GenerationLogKind = "image" | "video";
export type GenerationLogSource = "agent" | "image-workbench" | "video-workbench" | "canvas" | "drama" | "unknown";
export type GenerationLogStatus = "pending" | "success" | "failed";

export type GenerationLogAsset = {
    type: GenerationLogKind;
    storageKey: string;
    displayUrl?: string;
    thumbnailUrl?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    bytes?: number;
};

export type GenerationLogAssetInput = Partial<GenerationLogAsset> & {
    url?: string;
    remoteUrl?: string;
    serverUrl?: string;
    targetSize?: string;
};

export type StoredGenerationLog = {
    id: string;
    userId: string;
    accountId?: string;
    conversationId?: string;
    username: string;
    displayName: string;
    kind: GenerationLogKind;
    source: GenerationLogSource;
    status: GenerationLogStatus;
    title: string;
    prompt: string;
    model: string;
    summary: string;
    durationMs: number;
    count: number;
    successCount: number;
    failCount: number;
    assets: GenerationLogAsset[];
    requestSnapshot?: GenerationLogRequestSnapshot;
    taskId?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
};

export type GenerationLogInput = Partial<Pick<StoredGenerationLog, "id" | "taskId" | "title" | "summary" | "error" | "requestSnapshot">> & {
    userId: string;
    username: string;
    displayName: string;
    conversationId?: string;
    kind: GenerationLogKind;
    source?: GenerationLogSource;
    status: GenerationLogStatus;
    prompt?: string;
    model?: string;
    durationMs?: number;
    count?: number;
    successCount?: number;
    failCount?: number;
    assets?: GenerationLogAssetInput[];
    createdAt?: string | number;
    completedAt?: string | number;
};

export type GenerationTaskLogResultInput = {
    logId?: string;
    slotId?: string;
    clientRequestId?: string;
    taskId: string;
    userId: string;
    username: string;
    displayName: string;
    conversationId?: string;
    runId?: string;
    userPrompt?: string;
    parameters?: GenerationLogSnapshotParameters;
    kind: GenerationLogKind;
    source: GenerationLogSource;
    status: "success" | "failed";
    title: string;
    prompt: string;
    model: string;
    summary: string;
    durationMs: number;
    asset?: GenerationLogAssetInput;
    assets?: GenerationLogAssetInput[];
    error?: string;
    canRetry?: boolean;
    taskKind?: "generation" | "edit";
    taskProvider?: "openai" | "seedance" | "generation";
    taskPollPath?: string;
    serverTaskId?: string;
    createdAt: string | number;
};

export type GenerationLogListOptions = {
    page?: number;
    pageSize?: number;
    keyword?: string;
    kind?: string;
    source?: string;
    status?: string;
    userId?: string;
    start?: string;
    end?: string;
};

export type GenerationAssetStats = {
    totalFiles: number;
    totalBytes: number;
    referencedFiles: number;
    referencedBytes: number;
    unreferencedFiles: number;
    unreferencedBytes: number;
    missingReferences: number;
};

export type GenerationLogDatabase = {
    version: 1;
    logs: StoredGenerationLog[];
};
