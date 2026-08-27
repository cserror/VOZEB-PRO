import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getPublicUsersByIds: vi.fn(),
    listExternalStorageFiles: vi.fn(),
    deleteExternalStorageFiles: vi.fn(),
    audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds, isAuthInputError: vi.fn(() => false) }));
vi.mock("@/lib/server/object-storage-service", () => ({
    deleteExternalStorageFiles: mocks.deleteExternalStorageFiles,
    listExternalStorageFiles: mocks.listExternalStorageFiles,
}));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin" })), safeRecordAuditLog: mocks.audit }));

import { DELETE, GET } from "./route";

describe("GET /api/admin/object-storage/files", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["system.manage"] });
        mocks.listExternalStorageFiles.mockResolvedValue({ items: [{ key: "media/image.webp", ownerUserId: "user-one" }], bucket: "media", prefix: "vozeb-pro/" });
        mocks.getPublicUsersByIds.mockResolvedValue([{ id: "user-one", accountId: "0001", username: "creator", displayName: "创作者" }]);
        mocks.deleteExternalStorageFiles.mockResolvedValue({ deleted: 1, blocked: [], pending: [] });
    });

    it("audits destructive object deletion", async () => {
        const response = await DELETE(
            new Request("http://localhost/api/admin/object-storage/files", {
                method: "DELETE",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ keys: ["media/image.webp"] }),
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.deleteExternalStorageFiles).toHaveBeenCalledWith(["media/image.webp"]);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.object-storage.files.delete", metadata: { requested: 1, deleted: 1, blocked: 0, pending: 0 } }));
    });

    it("reports and audits managed objects that remain pending", async () => {
        mocks.deleteExternalStorageFiles.mockResolvedValueOnce({ deleted: 0, blocked: [], pending: [{ key: "media/image.webp", storageKey: "permanent/image.webp" }] });

        const response = await DELETE(
            new Request("http://localhost/api/admin/object-storage/files", {
                method: "DELETE",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ keys: ["media/image.webp"] }),
            }),
        );
        const payload = await response.json();

        expect(payload.msg).toBe("部分对象删除失败，已进入维护重试");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { requested: 1, deleted: 0, blocked: 0, pending: 1 } }));
    });

    it("requires an administrator", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-one", role: "user" });

        expect((await GET(new Request("http://localhost/api/admin/object-storage/files"))).status).toBe(403);
        expect(mocks.listExternalStorageFiles).not.toHaveBeenCalled();
    });

    it("adds public owner identity without replacing the internal relation key", async () => {
        const response = await GET(new Request("http://localhost/api/admin/object-storage/files?limit=30&ownerUserId=user-one"));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(mocks.listExternalStorageFiles).toHaveBeenCalledWith(expect.objectContaining({ limit: 30, ownerUserId: "user-one" }));
        expect(mocks.getPublicUsersByIds).toHaveBeenCalledWith(["user-one"]);
        expect(payload.data.items[0]).toMatchObject({ ownerUserId: "user-one", ownerAccountId: "0001", ownerUsername: "creator", ownerDisplayName: "创作者" });
    });
});
