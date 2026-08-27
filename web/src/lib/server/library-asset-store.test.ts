import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Asset, ImageAsset } from "@/lib/library-asset-contract";

const mocks = vi.hoisted(() => ({
    files: new Map<string, unknown>(),
    provider: "file" as "file" | "postgres",
    postgresQuery: vi.fn(),
    transaction: vi.fn(),
    registrations: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: vi.fn(),
    getDatabaseProvider: vi.fn(() => mocks.provider),
    postgresQuery: mocks.postgresQuery,
    withPostgresTransaction: mocks.transaction,
}));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistrations: mocks.registrations }));
vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(mocks.files.has(name) ? mocks.files.get(name) : fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => mocks.files.set(name, structuredClone(value))),
}));

import { createLibraryAsset, createLibraryAssetIfAbsent, deleteLibraryAsset, getLibraryAsset, listLibraryAssetPage, listLibraryAssets, updateLibraryAsset } from "./library-asset-store";

describe("library asset file provider", () => {
    beforeEach(() => {
        mocks.files.clear();
        mocks.provider = "file";
        mocks.postgresQuery.mockReset();
        mocks.transaction.mockReset();
        mocks.registrations.mockReset();
    });

    it("keeps server-backed assets isolated by user", async () => {
        await createLibraryAsset("user-one", textAsset("one", "素材一"));
        await createLibraryAsset("user-two", textAsset("two", "素材二"));

        expect(await listLibraryAssets("user-one")).toMatchObject([{ id: "one", title: "素材一" }]);
        expect(await updateLibraryAsset("user-one", textAsset("two", "越权修改"))).toBeNull();
        expect(await deleteLibraryAsset("user-one", "two")).toBe(false);
        expect(await deleteLibraryAsset("user-one", "one")).toBe(true);
        expect(await listLibraryAssets("user-two")).toHaveLength(1);
    });

    it("filters and paginates file-provider assets on the server", async () => {
        await createLibraryAsset("user-one", textAsset("one", "品牌脚本", "2026-07-20T00:00:00.000Z"));
        await createLibraryAsset("user-one", textAsset("two", "商品标题", "2026-07-21T00:00:00.000Z"));
        await createLibraryAsset("user-one", textAsset("three", "品牌口号", "2026-07-22T00:00:00.000Z"));

        await expect(listLibraryAssetPage("user-one", { page: 2, pageSize: 1, kind: "text", keyword: "品牌" })).resolves.toMatchObject({
            items: [{ id: "one" }],
            total: 2,
            page: 2,
            pageSize: 1,
        });
        await expect(getLibraryAsset("user-one", "two")).resolves.toMatchObject({ title: "商品标题" });
    });

    it("uses one bounded PostgreSQL query for a filtered page", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({ rows: [{ assets: [textAsset("one", "品牌脚本")], total: "12" }] });

        await expect(listLibraryAssetPage("user-one", { page: 2, pageSize: 5, kind: "text", keyword: "品牌" })).resolves.toMatchObject({ total: 12, items: [{ id: "one" }] });

        expect(mocks.postgresQuery).toHaveBeenCalledTimes(1);
        const [statement, params] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(statement).toContain("WITH filtered AS");
        expect(statement).toContain("WHERE user_id = $1");
        expect(statement).toContain("ORDER BY updated_at DESC, id ASC");
        expect(statement).toContain("LIMIT $5 OFFSET $6");
        expect(params).toEqual(["user-one", "text", "品牌", "%品牌%", 5, 5]);
    });

    it("prevents the unbounded asset reader from querying PostgreSQL", async () => {
        mocks.provider = "postgres";

        await expect(listLibraryAssets("user-one")).rejects.toThrow("paginated asset query");
        expect(mocks.postgresQuery).not.toHaveBeenCalled();
    });

    it("locks an active media registration in the same transaction before adding it to the library", async () => {
        mocks.provider = "postgres";
        const asset = imageAsset("image-one", "商品图");
        const executor = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ asset_json: asset }] }) };
        mocks.transaction.mockImplementation(async (handler: (client: typeof executor) => Promise<unknown>) => handler(executor));
        mocks.registrations.mockResolvedValue([{ storageKey: asset.data.storageKey, ownerUserId: "user-one", storageClass: "permanent", deletionStatus: "active" }]);

        await expect(createLibraryAssetIfAbsent("user-one", asset)).resolves.toEqual(asset);

        expect(mocks.registrations).toHaveBeenCalledWith([asset.data.storageKey], { ownerUserId: "user-one", executor, forUpdate: true });
        expect(executor.query).toHaveBeenCalledTimes(2);
        expect(mocks.postgresQuery).not.toHaveBeenCalled();
    });

    it("rejects a media asset after deletion has been claimed", async () => {
        mocks.provider = "postgres";
        const asset = imageAsset("image-one", "商品图");
        const executor = { query: vi.fn() };
        mocks.transaction.mockImplementation(async (handler: (client: typeof executor) => Promise<unknown>) => handler(executor));
        mocks.registrations.mockResolvedValue([{ storageKey: asset.data.storageKey, ownerUserId: "user-one", storageClass: "permanent", deletionStatus: "pending" }]);

        await expect(createLibraryAssetIfAbsent("user-one", asset)).rejects.toThrow("媒体正在删除或已不可用");
        expect(executor.query).not.toHaveBeenCalled();
    });
});

function textAsset(id: string, title: string, now = new Date().toISOString()): Asset {
    return { id, kind: "text", title, coverUrl: "", tags: [], data: { content: title }, createdAt: now, updatedAt: now };
}

function imageAsset(id: string, title: string, now = new Date().toISOString()): ImageAsset {
    return {
        id,
        kind: "image",
        title,
        coverUrl: "/api/reference-assets/permanent/image.png",
        tags: [],
        data: {
            storageKey: "permanent/image.png",
            serverUrl: "/api/reference-assets/permanent/image.png",
            dataUrl: "/api/reference-assets/permanent/image.png",
            bytes: 1024,
            mimeType: "image/png",
            width: 1024,
            height: 1024,
        },
        createdAt: now,
        updatedAt: now,
    };
}
