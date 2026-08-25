import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    listHistory: vi.fn(),
    addToLibrary: vi.fn(),
    deleteResults: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/generation-history-service", () => ({
    GenerationHistoryServiceError: class GenerationHistoryServiceError extends Error {
        constructor(message: string, readonly status: number) {
            super(message);
        }
    },
    listGenerationHistoryForUser: mocks.listHistory,
    addGenerationHistoryResultToLibrary: mocks.addToLibrary,
    deleteGenerationHistoryResultsForUser: mocks.deleteResults,
}));

import { DELETE, GET, POST } from "./route";

describe("generation history route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.listHistory.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24 });
        mocks.addToLibrary.mockResolvedValue({ id: "asset-one" });
        mocks.deleteResults.mockResolvedValue({ deleted: 2 });
    });

    it("requires a signed-in user", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await GET(new Request("http://localhost/api/generation-history"));
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ code: 401, data: null, msg: "请先登录" });
    });

    it("passes bounded result filters to the service", async () => {
        const response = await GET(new Request("http://localhost/api/generation-history?page=2&kind=image&status=success&keyword=海报&start=2026-08-01&end=2026-08-31"));
        expect(mocks.listHistory).toHaveBeenCalledWith("user-one", { page: "2", pageSize: null, kind: "image", status: "success", keyword: "海报", start: "2026-08-01", end: "2026-08-31" });
        expect(await response.json()).toEqual({ code: 0, data: { items: [], total: 0, page: 1, pageSize: 24 }, msg: "OK" });
    });

    it("adds one result to the material library idempotently", async () => {
        const response = await POST(new Request("http://localhost/api/generation-history", { method: "POST", body: JSON.stringify({ action: "add-to-library", resultId: "slot:log:slot:" }) }));
        expect(mocks.addToLibrary).toHaveBeenCalledWith("user-one", "slot:log:slot:");
        expect(await response.json()).toEqual({ code: 0, data: { asset: { id: "asset-one" } }, msg: "已添加到素材" });
    });

    it("deletes only the selected result identities", async () => {
        const response = await DELETE(new Request("http://localhost/api/generation-history", { method: "DELETE", body: JSON.stringify({ resultIds: ["one", "two"] }) }));
        expect(mocks.deleteResults).toHaveBeenCalledWith("user-one", ["one", "two"]);
        expect(await response.json()).toEqual({ code: 0, data: { deleted: 2 }, msg: "已删除" });
    });
});
