import { afterEach, describe, expect, it, vi } from "vitest";

import { addGenerationHistoryResultToLibrary, deleteGenerationHistoryResults, listGenerationHistory } from "./generation-history";

describe("generation history api", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("requests a bounded filtered result page", async () => {
        const data = { items: [], total: 0, page: 2, pageSize: 24 };
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: 0, data, msg: "OK" }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            listGenerationHistory({
                page: 2,
                kind: "image",
                status: "success",
                keyword: " 海报 ",
                start: new Date("2026-07-31T16:00:00.000Z"),
                end: new Date("2026-08-31T15:59:59.999Z"),
            }),
        ).resolves.toEqual(data);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/generation-history?page=2&pageSize=24&kind=image&status=success&keyword=%E6%B5%B7%E6%8A%A5&start=2026-07-31T16%3A00%3A00.000Z&end=2026-08-31T15%3A59%3A59.999Z",
            { cache: "no-store", signal: undefined },
        );
    });

    it("adds material and deletes selected results through scoped actions", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(Response.json({ code: 0, data: { asset: { id: "asset-one" } }, msg: "已添加到素材" }))
            .mockResolvedValueOnce(Response.json({ code: 0, data: { deleted: 2 }, msg: "已删除" }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(addGenerationHistoryResultToLibrary("result-one")).resolves.toMatchObject({ id: "asset-one" });
        await expect(deleteGenerationHistoryResults(["result-one", "result-two"])).resolves.toEqual({ deleted: 2 });
        expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/generation-history", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "add-to-library", resultId: "result-one" }) }));
        expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/generation-history", expect.objectContaining({ method: "DELETE", body: JSON.stringify({ resultIds: ["result-one", "result-two"] }) }));
    });
});
