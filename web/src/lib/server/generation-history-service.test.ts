import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => true),
    listResultPage: vi.fn(),
    getGenerationLogById: vi.fn(),
    readGenerationLogDb: vi.fn(),
    listTaskRecords: vi.fn(),
    getConversations: vi.fn(),
    getUserMessages: vi.fn(),
    listAddedResultIds: vi.fn(),
    createLibraryAssetIfAbsent: vi.fn(),
    deleteSlotResults: vi.fn(),
    deleteLegacyAssets: vi.fn(),
    deleteLogs: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    isPostgresDatabaseEnabled: mocks.isPostgresDatabaseEnabled,
    createPostgresRepositories: () => ({ generationLogs: { listResultPage: mocks.listResultPage, getById: mocks.getGenerationLogById } }),
}));
vi.mock("@/lib/server/generation-log-repository", () => ({ readGenerationLogDb: mocks.readGenerationLogDb }));
vi.mock("@/lib/server/generation-log-store", () => ({ deleteGenerationLogs: mocks.deleteLogs }));
vi.mock("@/lib/server/generation-log-task-service", () => ({
    GenerationLogOwnershipError: class GenerationLogOwnershipError extends Error {},
    deleteGenerationLogResultsForUser: mocks.deleteSlotResults,
    deleteLegacyGenerationLogAssetsForUser: mocks.deleteLegacyAssets,
}));
vi.mock("@/lib/server/generation-task-store", () => ({ getStoredGenerationTaskRecordsByIds: mocks.listTaskRecords }));
vi.mock("@/lib/server/creative-runtime-store", () => ({ getCreativeConversationsByIds: mocks.getConversations, getCreativeUserMessagesByRunIds: mocks.getUserMessages }));
vi.mock("@/lib/server/library-asset-store", () => ({ listLibraryGenerationResultIds: mocks.listAddedResultIds, createLibraryAssetIfAbsent: mocks.createLibraryAssetIfAbsent }));

import { generationHistoryResultId } from "@/lib/generation-history-contract";
import { addGenerationHistoryResultToLibrary, deleteGenerationHistoryResultsForUser, listGenerationHistoryForUser } from "./generation-history-service";

describe("generation history service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isPostgresDatabaseEnabled.mockReturnValue(true);
        mocks.listAddedResultIds.mockResolvedValue([]);
        mocks.getConversations.mockResolvedValue([]);
        mocks.getUserMessages.mockResolvedValue([]);
        mocks.listTaskRecords.mockResolvedValue([]);
        mocks.deleteLogs.mockResolvedValue({ deleted: 1 });
        mocks.createLibraryAssetIfAbsent.mockImplementation(async (_userId: string, asset: unknown) => asset);
    });

    it("returns one public item per result and enriches it with safe Agent metadata", async () => {
        mocks.listResultPage.mockResolvedValue({
            page: 1,
            pageSize: 24,
            total: 2,
            items: [
                {
                    logId: "log-one",
                    slotId: "slot-one",
                    assetIndex: 0,
                    kind: "image",
                    source: "agent",
                    status: "success",
                    title: "商品主图",
                    originalPrompt: "",
                    model: "image-model",
                    parameters: { size: "1:1", quality: "high" },
                    conversationId: "conversation-one",
                    taskId: "task-one",
                    asset: { type: "image", url: "/api/generation-log-assets/permanent/one.webp", serverUrl: "/api/generation-log-assets/permanent/one.webp", width: 1024, height: 1024, mimeType: "image/webp", bytes: 10 },
                    createdAt: "2026-08-24T08:00:00.000Z",
                    completedAt: "2026-08-24T08:00:02.000Z",
                    durationMs: 2000,
                },
                {
                    logId: "log-one",
                    slotId: "slot-two",
                    assetIndex: 1,
                    kind: "image",
                    source: "agent",
                    status: "success",
                    title: "商品主图",
                    originalPrompt: "用户原始需求",
                    model: "image-model",
                    parameters: { size: "1:1" },
                    conversationId: "conversation-one",
                    taskId: "task-two",
                    asset: { type: "image", url: "/api/generation-log-assets/permanent/two.webp", serverUrl: "/api/generation-log-assets/permanent/two.webp" },
                    createdAt: "2026-08-24T08:00:00.000Z",
                    completedAt: "2026-08-24T08:00:03.000Z",
                    durationMs: 3000,
                },
            ],
        });
        mocks.listTaskRecords
            .mockResolvedValueOnce([
                { id: "task-one", userId: "user-one", type: "image", status: "success", runId: "run-one", parentTaskId: "planned-one", payload: { billing: { pointsCost: 2.5 } } },
                { id: "task-two", userId: "user-one", type: "image", status: "success", runId: "run-one", parentTaskId: "planned-two", payload: { billing: { pointsCost: 3 } } },
            ])
            .mockResolvedValueOnce([
                {
                    id: "run-one",
                    userId: "user-one",
                    type: "agent",
                    status: "success",
                    payload: {
                        publicPrompt: "Agent 用户需求",
                        prompt: "不得公开的执行上下文",
                        tasks: [
                            { id: "planned-one", optimizedPrompt: "可公开优化提示词一" },
                            { id: "planned-two", optimizedPrompt: "可公开优化提示词二" },
                        ],
                    },
                },
            ]);
        mocks.getConversations.mockResolvedValue([{ id: "conversation-one", userId: "user-one", surface: "canvas", source: "canvas", projectId: "canvas-one" }]);
        const firstId = generationHistoryResultId({ logId: "log-one", slotId: "slot-one", assetIndex: 0 });
        mocks.listAddedResultIds.mockResolvedValue([firstId]);

        const result = await listGenerationHistoryForUser("user-one", { page: 1, pageSize: 24, kind: "image", status: "success", keyword: "商品", start: "2026-08-01", end: "2026-08-31" });

        expect(mocks.listResultPage).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", page: 1, pageSize: 24, kind: "image", status: "success", keyword: "商品" }));
        expect(result.items).toHaveLength(2);
        expect(result.items[0]).toMatchObject({
            id: firstId,
            originalPrompt: "Agent 用户需求",
            optimizedPrompt: "可公开优化提示词一",
            pointsCost: 2.5,
            projectId: "canvas-one",
            continueHref: "/canvas/canvas-one",
            addedToLibrary: true,
        });
        expect(JSON.stringify(result.items)).not.toContain("不得公开的执行上下文");
        expect(result.items[1]).toMatchObject({ originalPrompt: "用户原始需求", optimizedPrompt: "可公开优化提示词二", pointsCost: 3, addedToLibrary: false });
    });

    it("keeps internal log prompts hidden when no explicit public prompt exists", async () => {
        mocks.listResultPage.mockResolvedValue({
            page: 1,
            pageSize: 24,
            total: 1,
            items: [
                {
                    logId: "log-private",
                    slotId: "slot-private",
                    kind: "video",
                    source: "drama",
                    status: "failed",
                    title: "镜头",
                    originalPrompt: "",
                    model: "video-model",
                    parameters: {},
                    conversationId: "conversation-missing",
                    taskId: "task-missing",
                    error: "上游失败",
                    createdAt: "2026-08-24T08:00:00.000Z",
                    durationMs: 0,
                },
            ],
        });

        const result = await listGenerationHistoryForUser("user-one", { page: 1, pageSize: 24 });

        expect(result.items[0]).toMatchObject({ originalPrompt: "", optimizedPrompt: undefined, continueHref: undefined, pointsCost: undefined });
    });

    it("recovers old Agent history from the child task, run and exact user message", async () => {
        mocks.listResultPage.mockResolvedValue({
            page: 1,
            pageSize: 24,
            total: 1,
            items: [
                {
                    logId: "log-old-agent",
                    assetIndex: 0,
                    kind: "image",
                    source: "agent",
                    status: "success",
                    title: "自然写实公鸡图片",
                    originalPrompt: "",
                    model: "gpt-image-2",
                    parameters: {},
                    taskId: "child-image",
                    asset: { type: "image", url: "/api/generation-log-assets/permanent/chicken.png" },
                    createdAt: "2026-08-23T12:39:10.505Z",
                    completedAt: "2026-08-23T12:39:46.834Z",
                    durationMs: 36_328,
                },
            ],
        });
        mocks.listTaskRecords
            .mockResolvedValueOnce([
                {
                    id: "child-image",
                    userId: "user-one",
                    type: "image",
                    status: "success",
                    conversationId: "conversation-one",
                    runId: "run-one",
                    parentTaskId: "run-one",
                    payload: { config: { size: "1024x1024", quality: "high", apiKey: "must-not-leak" } },
                },
            ])
            .mockResolvedValueOnce([
                {
                    id: "run-one",
                    userId: "user-one",
                    type: "agent",
                    status: "success",
                    payload: {
                        inputMessageId: "message-user",
                        tasks: [
                            {
                                id: "planned-image",
                                optimizedPrompt: "可公开的优化提示词",
                                taskIds: ["child-image"],
                                childTasks: [{ id: "child-image", status: "completed" }],
                            },
                        ],
                    },
                },
            ]);
        mocks.getConversations.mockResolvedValue([{ id: "conversation-one", userId: "user-one", surface: "chat", source: "agent" }]);
        mocks.getUserMessages.mockResolvedValue([
            { id: "message-user", conversationId: "conversation-one", runId: "run-one", role: "user", status: "completed", content: "生成一只自然写实的公鸡", sequence: 1, metadata: {}, createdAt: 1, updatedAt: 1 },
        ]);

        const result = await listGenerationHistoryForUser("user-one", { page: 1, pageSize: 24 });

        expect(result.items[0]).toMatchObject({
            conversationId: "conversation-one",
            continueHref: "/create?conversationId=conversation-one",
            originalPrompt: "生成一只自然写实的公鸡",
            optimizedPrompt: "可公开的优化提示词",
            parameters: { size: "1024x1024", quality: "high" },
        });
        expect(JSON.stringify(result.items[0])).not.toContain("must-not-leak");
    });

    it("deletes selected result slots without deleting sibling results", async () => {
        const log = generationLog(["slot-one", "slot-two"]);
        mocks.getGenerationLogById.mockResolvedValue(log);
        mocks.deleteSlotResults.mockResolvedValue({ ...log, assets: [log.assets[1]], requestSnapshot: { ...log.requestSnapshot, slots: [log.requestSnapshot.slots[1]] } });
        const resultId = generationHistoryResultId({ logId: log.id, slotId: "slot-one", assetIndex: 0 });

        await expect(deleteGenerationHistoryResultsForUser("user-one", [resultId])).resolves.toEqual({ deleted: 1 });

        expect(mocks.deleteSlotResults).toHaveBeenCalledWith("user-one", "log-delete", ["slot-one"]);
        expect(mocks.deleteLogs).not.toHaveBeenCalled();
    });

    it("blocks deletion while a selected result is still generating", async () => {
        const log = generationLog(["slot-one"]);
        log.requestSnapshot.slots[0].status = "pending";
        mocks.getGenerationLogById.mockResolvedValue(log);

        await expect(deleteGenerationHistoryResultsForUser("user-one", [generationHistoryResultId({ logId: log.id, slotId: "slot-one" })])).rejects.toMatchObject({ status: 409 });
        expect(mocks.deleteSlotResults).not.toHaveBeenCalled();
    });

    it("reuses the generation storage key and a deterministic material identity", async () => {
        const log = generationLog(["slot-one"]);
        mocks.getGenerationLogById.mockResolvedValue(log);
        const resultId = generationHistoryResultId({ logId: log.id, slotId: "slot-one", assetIndex: 0 });

        const first = await addGenerationHistoryResultToLibrary("user-one", resultId);
        const second = await addGenerationHistoryResultToLibrary("user-one", resultId);

        expect(first.id).toBe(second.id);
        expect(mocks.createLibraryAssetIfAbsent).toHaveBeenCalledTimes(2);
        expect(mocks.createLibraryAssetIfAbsent).toHaveBeenLastCalledWith(
            "user-one",
            expect.objectContaining({
                id: first.id,
                kind: "image",
                source: "generation-history",
                metadata: expect.objectContaining({ generationResultId: resultId }),
                data: expect.objectContaining({ storageKey: "permanent/slot-one.webp", serverUrl: "/api/generation-log-assets/permanent/slot-one.webp" }),
            }),
        );
    });
});

function generationLog(slotIds: string[]) {
    const createdAt = "2026-08-24T08:00:00.000Z";
    return {
        id: "log-delete",
        userId: "user-one",
        username: "user",
        displayName: "User",
        kind: "image" as const,
        source: "agent" as const,
        status: "success" as const,
        title: "测试",
        prompt: "内部提示词",
        model: "image-model",
        summary: "完成",
        durationMs: 10,
        count: slotIds.length,
        successCount: slotIds.length,
        failCount: 0,
        assets: slotIds.map((id) => ({ type: "image" as const, url: `/api/generation-log-assets/permanent/${id}.webp` })),
        requestSnapshot: {
            version: 1 as const,
            userPrompt: "用户原文",
            parameters: {},
            references: [],
            slots: slotIds.map((id, index) => ({ id, index, status: "success" as "pending" | "success", assetIndex: index })),
        },
        createdAt,
        updatedAt: createdAt,
        completedAt: createdAt,
    };
}
