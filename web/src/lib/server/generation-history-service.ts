import { createHash } from "node:crypto";

import {
    GENERATION_HISTORY_PAGE_SIZE,
    generationHistoryResultId,
    parseGenerationHistoryResultId,
    type GenerationHistoryItem,
    type GenerationHistoryKind,
    type GenerationHistoryPage,
    type GenerationHistoryResultIdentity,
    type GenerationHistoryStatus,
} from "@/lib/generation-history-contract";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled } from "@/lib/server/database";
import type { GenerationHistoryResultRecord } from "@/lib/server/database/content-repository";
import { getCreativeConversationsByIds, getCreativeUserMessagesByRunIds } from "@/lib/server/creative-runtime-store";
import { readGenerationLogDb } from "@/lib/server/generation-log-repository";
import type { StoredGenerationLog } from "@/lib/server/generation-log-types";
import { deleteGenerationLogs } from "@/lib/server/generation-log-store";
import { deleteGenerationLogResultsForUser, deleteLegacyGenerationLogAssetsForUser, GenerationLogOwnershipError } from "@/lib/server/generation-log-task-service";
import { getStoredGenerationTaskRecordsByIds, type StoredGenerationTaskRecord } from "@/lib/server/generation-task-store";
import { createLibraryAssetIfAbsent, listLibraryGenerationResultIds } from "@/lib/server/library-asset-store";
import { localMediaStorageKeyFromValue } from "@/lib/server/local-media-references";

export type GenerationHistoryListInput = {
    page?: unknown;
    pageSize?: unknown;
    kind?: unknown;
    status?: unknown;
    keyword?: unknown;
    start?: unknown;
    end?: unknown;
};

export class GenerationHistoryServiceError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

export async function listGenerationHistoryForUser(userId: string, input: GenerationHistoryListInput): Promise<GenerationHistoryPage> {
    const options = normalizeListInput(input);
    const page = isPostgresDatabaseEnabled() ? await listPostgresResultPage(userId, options) : listFileResultPage(await readGenerationLogDb(), userId, options);
    return enrichResultPage(userId, page);
}

export async function addGenerationHistoryResultToLibrary(userId: string, resultId: string) {
    const identity = parseGenerationHistoryResultId(resultId);
    if (!identity) throw new GenerationHistoryServiceError("生成结果不存在", 404);
    const record = await getResultRecord(userId, identity);
    if (!record || record.status !== "success" || !record.asset) throw new GenerationHistoryServiceError("只有已完成的图片或视频可以添加到素材", 409);
    const url = record.asset.serverUrl || record.asset.url;
    const storageKey = localMediaStorageKeyFromValue(url) || localMediaStorageKeyFromValue(record.asset.url);
    if (!storageKey || !url) throw new GenerationHistoryServiceError("该生成结果没有可复用的站内媒体", 409);

    const now = new Date().toISOString();
    const id = `generation-result-${createHash("sha256").update(`${userId}\0${resultId}`).digest("hex").slice(0, 32)}`;
    const base = {
        id,
        kind: record.kind,
        title: record.title || (record.kind === "video" ? "生成视频" : "生成图片"),
        coverUrl: record.kind === "image" ? url : "",
        tags: [record.kind === "video" ? "生成视频" : "生成图片"],
        source: "generation-history",
        createdAt: now,
        updatedAt: now,
        metadata: { source: "generation-history", generationResultId: resultId, generationLogId: record.logId, ...(record.slotId ? { generationSlotId: record.slotId } : {}) },
    };
    const media = {
        storageKey,
        serverUrl: url,
        remoteUrl: record.asset.remoteUrl,
        bytes: record.asset.bytes || 0,
        mimeType: record.asset.mimeType || (record.kind === "video" ? "video/mp4" : "image/png"),
        width: record.asset.width || 0,
        height: record.asset.height || 0,
    };
    const asset =
        record.kind === "image"
            ? await createLibraryAssetIfAbsent(userId, { ...base, kind: "image", data: { ...media, dataUrl: url } })
            : await createLibraryAssetIfAbsent(userId, { ...base, kind: "video", data: { ...media, url } });
    return asset;
}

export async function deleteGenerationHistoryResultsForUser(userId: string, resultIds: string[]) {
    const identities = Array.from(new Set(resultIds.map((id) => id.trim()).filter(Boolean)))
        .slice(0, GENERATION_HISTORY_PAGE_SIZE)
        .map(parseGenerationHistoryResultId)
        .filter((identity): identity is GenerationHistoryResultIdentity => Boolean(identity));
    if (!identities.length) return { deleted: 0 };

    const records = await Promise.all(identities.map((identity) => getResultRecord(userId, identity)));
    if (records.some((record) => !record)) throw new GenerationHistoryServiceError("部分生成结果不存在，请刷新后重试", 404);
    if (records.some((record) => record?.status === "pending")) throw new GenerationHistoryServiceError("生成中的结果暂时不能删除", 409);

    const byLog = new Map<string, GenerationHistoryResultIdentity[]>();
    for (const identity of identities) byLog.set(identity.logId, [...(byLog.get(identity.logId) || []), identity]);
    try {
        for (const [logId, selected] of byLog) {
            const slotIds = selected.flatMap((identity) => (identity.slotId ? [identity.slotId] : []));
            const assetIndexes = selected.flatMap((identity) => (!identity.slotId && identity.assetIndex !== undefined ? [identity.assetIndex] : []));
            const deleteWholeLog = selected.some((identity) => !identity.slotId && identity.assetIndex === undefined);
            if (deleteWholeLog) {
                await deleteGenerationLogs([logId]);
                continue;
            }
            let updated = slotIds.length ? await deleteGenerationLogResultsForUser(userId, logId, slotIds) : null;
            if (assetIndexes.length) updated = await deleteLegacyGenerationLogAssetsForUser(userId, logId, assetIndexes);
            if (updated && !updated.assets.length && !(updated.requestSnapshot?.slots.length || 0)) await deleteGenerationLogs([logId]);
        }
    } catch (error) {
        if (error instanceof GenerationLogOwnershipError) throw new GenerationHistoryServiceError("生成结果不存在", 404);
        throw error;
    }
    return { deleted: identities.length };
}

async function listPostgresResultPage(userId: string, options: NormalizedListInput) {
    await ensurePostgresSchema();
    return createPostgresRepositories().generationLogs.listResultPage({ userId, ...options });
}

function listFileResultPage(database: Awaited<ReturnType<typeof readGenerationLogDb>>, userId: string, options: NormalizedListInput) {
    const items = database.logs
        .filter((log) => log.userId === userId)
        .flatMap(resultRecordsFromLog)
        .filter((item) => (!options.kind || item.kind === options.kind) && (!options.status || item.status === options.status))
        .filter((item) => inDateRange(item.createdAt, options.startAt, options.endAt))
        .filter((item) => !options.keyword || [item.title, item.originalPrompt, item.model].join(" ").toLowerCase().includes(options.keyword.toLowerCase()))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.logId.localeCompare(right.logId) || Number(left.assetIndex || 0) - Number(right.assetIndex || 0));
    const offset = (options.page - 1) * options.pageSize;
    return { items: items.slice(offset, offset + options.pageSize), total: items.length, page: options.page, pageSize: options.pageSize };
}

export function resultRecordsFromLog(log: StoredGenerationLog): GenerationHistoryResultRecord[] {
    const originalPrompt = publicOriginalPrompt(log);
    const slots = log.requestSnapshot?.slots || [];
    if (slots.length)
        return slots.map((slot) => ({
            logId: log.id,
            slotId: slot.id,
            assetIndex: slot.assetIndex,
            kind: log.kind,
            source: log.source,
            status: slot.status,
            title: log.title,
            originalPrompt,
            model: slot.taskModel || log.model,
            parameters: cleanParameters(slot.parameters || log.requestSnapshot?.parameters),
            conversationId: log.conversationId,
            taskId: slot.taskId || log.taskId,
            asset: slot.assetIndex === undefined ? undefined : log.assets[slot.assetIndex],
            error: slot.error || log.error,
            durationMs: log.durationMs,
            createdAt: log.createdAt,
            completedAt: log.completedAt,
        }));
    if (log.assets.length)
        return log.assets.map((asset, assetIndex) => ({
            logId: log.id,
            assetIndex,
            kind: asset.type,
            source: log.source,
            status: log.status,
            title: log.title,
            originalPrompt,
            model: log.model,
            parameters: cleanParameters(log.requestSnapshot?.parameters),
            conversationId: log.conversationId,
            taskId: log.taskId,
            asset,
            error: log.error,
            durationMs: log.durationMs,
            createdAt: log.createdAt,
            completedAt: log.completedAt,
        }));
    return [
        {
            logId: log.id,
            kind: log.kind,
            source: log.source,
            status: log.status,
            title: log.title,
            originalPrompt,
            model: log.model,
            parameters: cleanParameters(log.requestSnapshot?.parameters),
            conversationId: log.conversationId,
            taskId: log.taskId,
            error: log.error,
            durationMs: log.durationMs,
            createdAt: log.createdAt,
            completedAt: log.completedAt,
        },
    ];
}

async function enrichResultPage(userId: string, page: { items: GenerationHistoryResultRecord[]; total: number; page: number; pageSize: number }): Promise<GenerationHistoryPage> {
    const taskIds = page.items.flatMap((item) => (item.taskId ? [item.taskId] : []));
    const taskRecords = await getStoredGenerationTaskRecordsByIds(userId, taskIds);
    const taskById = new Map(taskRecords.map((task) => [task.id, task]));
    const runIds = Array.from(new Set(taskRecords.flatMap((task) => (task.runId ? [task.runId] : []))));
    const conversationIds = Array.from(
        new Set(
            page.items.flatMap((item) => {
                const task = item.taskId ? taskById.get(item.taskId) : undefined;
                const conversationId = item.conversationId || task?.conversationId;
                return conversationId ? [conversationId] : [];
            }),
        ),
    );
    const ids = page.items.map((item) => generationHistoryResultId(item));
    const [runRecords, conversations, userMessages, addedResultIds] = await Promise.all([
        getStoredGenerationTaskRecordsByIds(userId, runIds),
        getCreativeConversationsByIds(userId, conversationIds),
        getCreativeUserMessagesByRunIds(userId, runIds),
        listLibraryGenerationResultIds(userId, ids),
    ]);
    const runById = new Map(runRecords.map((task) => [task.id, task]));
    const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    const userMessagesByRunId = new Map(userMessages.flatMap((message) => (message.runId ? [[message.runId, message] as const] : [])));
    const userMessagesById = new Map(userMessages.map((message) => [message.id, message]));
    const addedIds = new Set(addedResultIds);

    return {
        ...page,
        items: page.items.map((record): GenerationHistoryItem => {
            const id = generationHistoryResultId(record);
            const task = record.taskId ? taskById.get(record.taskId) : undefined;
            const run = task?.runId ? runById.get(task.runId) : undefined;
            const effectiveConversationId = record.conversationId || task?.conversationId;
            const conversation = effectiveConversationId ? conversationById.get(effectiveConversationId) : undefined;
            const projectId = task?.projectId || conversation?.projectId;
            const runPayload = object(run?.payload);
            const plannedTask = plannedAgentTaskForChild(runPayload.tasks, task);
            const inputMessageId = text(runPayload.inputMessageId);
            const userMessage = (inputMessageId ? userMessagesById.get(inputMessageId) : undefined) || (task?.runId ? userMessagesByRunId.get(task.runId) : undefined);
            const originalPrompt = record.originalPrompt || text(task?.userPrompt) || text(object(task?.payload).userPrompt) || text(runPayload.publicPrompt) || text(userMessage?.content);
            const optimizedPrompt = text(plannedTask?.optimizedPrompt) || undefined;
            const parameters = Object.keys(record.parameters).length ? cleanParameters(record.parameters) : taskPublicParameters(task);
            const assetUrl = record.asset?.serverUrl || record.asset?.url || "";
            return {
                id,
                logId: record.logId,
                slotId: record.slotId,
                assetIndex: record.assetIndex,
                kind: record.kind,
                source: generationSource(record.source),
                status: record.status,
                title: record.title,
                originalPrompt,
                optimizedPrompt,
                model: record.model,
                parameters,
                pointsCost: taskPointsCost(task),
                conversationId: effectiveConversationId,
                projectId,
                continueHref: continueHref(record.source, conversation?.id, conversation?.surface, projectId),
                asset: record.asset
                    ? {
                          ...record.asset,
                          storageKey: localMediaStorageKeyFromValue(assetUrl) || localMediaStorageKeyFromValue(record.asset.url) || undefined,
                      }
                    : undefined,
                error: record.error,
                durationMs: record.durationMs,
                createdAt: record.createdAt,
                completedAt: record.completedAt,
                addedToLibrary: addedIds.has(id),
            };
        }),
    };
}

async function getResultRecord(userId: string, identity: GenerationHistoryResultIdentity) {
    let log: StoredGenerationLog | null = null;
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const candidate = await createPostgresRepositories().generationLogs.getById(identity.logId);
        if (candidate?.userId === userId) log = candidate as StoredGenerationLog;
    } else {
        log = (await readGenerationLogDb()).logs.find((item) => item.userId === userId && item.id === identity.logId) || null;
    }
    if (!log) return null;
    return resultRecordsFromLog(log).find((record) => (identity.slotId ? record.slotId === identity.slotId : identity.assetIndex !== undefined ? !record.slotId && record.assetIndex === identity.assetIndex : !record.slotId && record.assetIndex === undefined));
}

function normalizeListInput(input: GenerationHistoryListInput): NormalizedListInput {
    return {
        page: positiveInteger(input.page, 1, 1_000_000),
        pageSize: positiveInteger(input.pageSize, GENERATION_HISTORY_PAGE_SIZE, GENERATION_HISTORY_PAGE_SIZE),
        kind: input.kind === "image" || input.kind === "video" ? input.kind : undefined,
        status: input.status === "pending" || input.status === "success" || input.status === "failed" ? input.status : undefined,
        keyword: text(input.keyword).slice(0, 160) || undefined,
        startAt: dateBoundary(input.start, false),
        endAt: dateBoundary(input.end, true),
    };
}

type NormalizedListInput = { page: number; pageSize: number; kind?: GenerationHistoryKind; status?: GenerationHistoryStatus; keyword?: string; startAt?: string; endAt?: string };

function publicOriginalPrompt(log: StoredGenerationLog) {
    const explicit = log.requestSnapshot?.userPrompt?.trim();
    if (explicit) return explicit;
    return log.source === "image-workbench" || log.source === "video-workbench" ? log.prompt.trim() : "";
}

function taskPointsCost(task?: StoredGenerationTaskRecord) {
    const payload = object(task?.payload);
    const value = task?.type === "video" ? object(payload.upstream).pointsCost : object(payload.billing).pointsCost;
    const points = Number(value);
    return Number.isFinite(points) && points >= 0 ? points : undefined;
}

function plannedAgentTaskForChild(value: unknown, task?: StoredGenerationTaskRecord) {
    if (!task) return undefined;
    const plannedTasks = array(value).map(object);
    return (
        plannedTasks.find((planned) => {
            const childIds = [text(planned.taskId), ...array(planned.taskIds).map(text), ...array(planned.childTasks).map((child) => text(object(child).id))];
            return childIds.includes(task.id);
        }) || plannedTasks.find((planned) => text(planned.id) === task.parentTaskId)
    );
}

function taskPublicParameters(task?: StoredGenerationTaskRecord) {
    const payload = object(task?.payload);
    const config = object(payload.config);
    const explicit = object(payload.generationLogParameters);
    return cleanParameters({
        size: text(explicit.size) || text(config.size),
        quality: text(explicit.quality) || text(config.quality),
        resolution: text(explicit.resolution),
        seconds: text(explicit.seconds) || numericText(payload.requestedDurationSeconds),
        generateAudio: text(explicit.generateAudio),
        watermark: text(explicit.watermark),
    });
}

function continueHref(source: string, conversationId: string | undefined, surface: unknown, projectId?: string) {
    if (projectId && (surface === "canvas" || source === "canvas")) return `/canvas/${encodeURIComponent(projectId)}`;
    if (projectId && (surface === "drama" || source === "drama")) return `/drama/${encodeURIComponent(projectId)}`;
    return conversationId ? `/create?${new URLSearchParams({ conversationId }).toString()}` : undefined;
}

function generationSource(value: string): GenerationHistoryItem["source"] {
    return value === "agent" || value === "image-workbench" || value === "video-workbench" || value === "canvas" || value === "drama" ? value : "unknown";
}

function cleanParameters(value: unknown) {
    return Object.fromEntries(Object.entries(object(value)).flatMap(([key, item]) => (typeof item === "string" && item.trim() ? [[key, item.trim()]] : [])));
}

function numericText(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? String(number) : "";
}

function inDateRange(value: string, start?: string, end?: string) {
    const time = Date.parse(value);
    return (!start || time >= Date.parse(start)) && (!end || time <= Date.parse(end));
}

function dateBoundary(value: unknown, end: boolean) {
    const raw = text(value).slice(0, 40);
    if (!raw) return undefined;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T${end ? "23:59:59.999" : "00:00:00.000"}Z` : raw;
    const time = Date.parse(day);
    return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function positiveInteger(value: unknown, fallback: number, max: number) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
