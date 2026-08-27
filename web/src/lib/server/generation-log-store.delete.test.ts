import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getAuthSettings: vi.fn(),
    createPostgresRepositories: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(),
    withPostgresTransaction: vi.fn(),
    deleteUserLocalMediaAssets: vi.fn(),
    listByUserIdBatch: vi.fn(),
    getByIds: vi.fn(),
    listByUserAndStorageKeys: vi.fn(),
    delete: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: mocks.createPostgresRepositories,
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    isPostgresDatabaseEnabled: mocks.isPostgresDatabaseEnabled,
    withPostgresTransaction: mocks.withPostgresTransaction,
}));
vi.mock("@/lib/server/local-media-references", () => ({
    collectLocalMediaStorageKeys: vi.fn((value: unknown) => {
        if (Array.isArray(value)) return value.flatMap((item) => (item && typeof item === "object" && "storageKey" in item ? [String((item as { storageKey: unknown }).storageKey)] : []));
        return value && typeof value === "object" && "storageKey" in value ? [String((value as { storageKey: unknown }).storageKey)] : [];
    }),
    countLocalMediaReferences: vi.fn(),
    localMediaStorageKeyFromValue: vi.fn((value: string) => value),
}));
vi.mock("@/lib/server/local-media-storage", () => ({
    deleteLocalMediaAssetsByStorageKeys: vi.fn(),
    deleteUserLocalMediaAssets: mocks.deleteUserLocalMediaAssets,
    GENERATION_MEDIA_ROOT: "generation-assets",
}));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: vi.fn() }));

import { deleteGenerationLogsByUserId, listUserGenerationLogsForDelete } from "./generation-log-store";

describe("generation log user deletion", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isPostgresDatabaseEnabled.mockReturnValue(true);
        mocks.getAuthSettings.mockResolvedValue({ dataLifecycle: { maintenanceBatchSize: 2 } });
        mocks.ensurePostgresSchema.mockResolvedValue(undefined);
        mocks.withPostgresTransaction.mockImplementation(async (handler: (client: unknown) => Promise<unknown>) => handler({}));
        mocks.createPostgresRepositories.mockReturnValue({
            generationLogs: {
                listByUserIdBatch: mocks.listByUserIdBatch,
                getByIds: mocks.getByIds,
                listByUserAndStorageKeys: mocks.listByUserAndStorageKeys,
                delete: mocks.delete,
            },
        });
        mocks.deleteUserLocalMediaAssets.mockResolvedValue({ deletedFiles: 0, deletedBytes: 0, blocked: [] });
        mocks.listByUserIdBatch
            .mockResolvedValueOnce([generationLog("log-one", "one.webp"), generationLog("log-two", "two.webp")])
            .mockResolvedValueOnce([generationLog("log-three", "three.webp")])
            .mockResolvedValueOnce([]);
        mocks.delete.mockResolvedValue(2);
    });

    it("deletes configured batches and cleans each committed batch's media", async () => {
        await expect(deleteGenerationLogsByUserId(" user-one ")).resolves.toEqual({ deleted: 3 });

        expect(mocks.getAuthSettings).toHaveBeenCalledOnce();
        expect(mocks.listByUserIdBatch).toHaveBeenNthCalledWith(1, "user-one", 2, true);
        expect(mocks.listByUserIdBatch).toHaveBeenNthCalledWith(2, "user-one", 2, true);
        expect(mocks.listByUserIdBatch).toHaveBeenNthCalledWith(3, "user-one", 2, true);
        expect(mocks.delete).toHaveBeenNthCalledWith(1, ["log-one", "log-two"]);
        expect(mocks.delete).toHaveBeenNthCalledWith(2, ["log-three"]);
        expect(mocks.deleteUserLocalMediaAssets).toHaveBeenCalledWith("user-one", ["one.webp", "two.webp"]);
        expect(mocks.deleteUserLocalMediaAssets).toHaveBeenCalledWith("user-one", ["three.webp"]);
    });

    it("includes same-user logs that share a stable storage key", async () => {
        const requested = generationLog("log-requested", "permanent/shared.webp");
        const shared = generationLog("log-shared", "permanent/shared.webp");
        mocks.getByIds.mockResolvedValue([requested]);
        mocks.listByUserAndStorageKeys.mockResolvedValue([requested, shared]);

        await expect(listUserGenerationLogsForDelete(" user-one ", ["log-requested"])).resolves.toEqual([requested, shared]);

        expect(mocks.getByIds).toHaveBeenCalledWith(["log-requested"], "user-one");
        expect(mocks.listByUserAndStorageKeys).toHaveBeenCalledWith("user-one", ["permanent/shared.webp"]);
    });
});

function generationLog(id: string, storageKey: string) {
    return {
        id,
        userId: "user-one",
        username: "user",
        displayName: "User",
        kind: "image" as const,
        source: "canvas" as const,
        status: "success" as const,
        title: id,
        prompt: id,
        model: "model",
        summary: "done",
        durationMs: 1,
        count: 1,
        successCount: 1,
        failCount: 0,
        assets: [{ type: "image" as const, storageKey }],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}
