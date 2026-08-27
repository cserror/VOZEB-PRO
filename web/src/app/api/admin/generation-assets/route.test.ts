import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    cleanupExpiredLocalMediaAssets: vi.fn(),
    deleteLocalMediaAssets: vi.fn(),
    findPublicUserIdsByKeyword: vi.fn(),
    getCurrentUser: vi.fn(),
    getPublicUsersByIds: vi.fn(),
    getLocalMediaAssetSummary: vi.fn(),
    listLocalMediaAssets: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ findPublicUserIdsByKeyword: mocks.findPublicUserIdsByKeyword, getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("@/lib/server/local-media-storage", () => ({
    cleanupExpiredLocalMediaAssets: mocks.cleanupExpiredLocalMediaAssets,
    deleteLocalMediaAssets: mocks.deleteLocalMediaAssets,
    getLocalMediaAssetSummary: mocks.getLocalMediaAssetSummary,
    listLocalMediaAssets: mocks.listLocalMediaAssets,
}));

import { DELETE, GET } from "./route";

describe("GET /api/admin/generation-assets", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["generation.read"] });
        mocks.findPublicUserIdsByKeyword.mockResolvedValue([]);
        mocks.getLocalMediaAssetSummary.mockResolvedValue({ totalFiles: 2, totalBytes: 30, permanentFiles: 2, permanentBytes: 30, temporaryFiles: 0, temporaryBytes: 0, expiredTemporaryFiles: 0 });
    });

    it("returns summary-only data without loading media rows or users", async () => {
        const response = await GET(new Request("http://localhost/api/admin/generation-assets?summaryOnly=1"));

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { summary: { totalFiles: 2, totalBytes: 30 } }, msg: "OK" });
        expect(mocks.getLocalMediaAssetSummary).toHaveBeenCalledTimes(1);
        expect(mocks.listLocalMediaAssets).not.toHaveBeenCalled();
        expect(mocks.getPublicUsersByIds).not.toHaveBeenCalled();
    });

    it("adds the public account id to registered media owners", async () => {
        mocks.listLocalMediaAssets.mockResolvedValue({ items: [{ id: "asset-one", ownerUserId: "user-one" }], total: 1, page: 1, pageSize: 20, summary: {} });
        mocks.getPublicUsersByIds.mockResolvedValue([{ id: "user-one", accountId: "0001", username: "creator", displayName: "创作者" }]);

        const response = await GET(new Request("http://localhost/api/admin/generation-assets?page=1"));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(mocks.getPublicUsersByIds).toHaveBeenCalledWith(["user-one"]);
        expect(payload.data.items[0]).toMatchObject({ ownerUserId: "user-one", ownerAccountId: "0001", ownerUsername: "creator", ownerDisplayName: "创作者" });
    });

    it("resolves public account-id search to internal media ownership", async () => {
        mocks.findPublicUserIdsByKeyword.mockResolvedValue(["user-one"]);
        mocks.listLocalMediaAssets.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, summary: {} });
        mocks.getPublicUsersByIds.mockResolvedValue([]);

        await GET(new Request("http://localhost/api/admin/generation-assets?search=0001"));

        expect(mocks.findPublicUserIdsByKeyword).toHaveBeenCalledWith("0001");
        expect(mocks.listLocalMediaAssets).toHaveBeenCalledWith(expect.objectContaining({ search: "0001", ownerUserIds: ["user-one"] }));
    });

    it("reports a registered deletion failure as pending instead of deleted", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin", role: "admin", status: "active", adminPermissions: ["generation.manage"] });
        mocks.deleteLocalMediaAssets.mockResolvedValueOnce({ deletedFiles: 0, deletedBytes: 0, blocked: [], pending: [{ id: "asset-one", storageKey: "permanent/image.png" }] });

        const response = await DELETE(
            new Request("http://localhost/api/admin/generation-assets", {
                method: "DELETE",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ids: ["asset-one"] }),
            }),
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toMatchObject({ data: { deletedFiles: 0, pending: [{ id: "asset-one" }] }, msg: "部分媒体文件删除失败，已进入维护重试" });
    });
});
