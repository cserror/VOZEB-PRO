import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    listPage: vi.fn(),
    displayUrls: vi.fn(),
    create: vi.fn(),
}));

vi.mock("@/lib/server/library-asset-store", () => ({
    createLibraryAsset: mocks.create,
    deleteLibraryAsset: vi.fn(),
    getLibraryAsset: vi.fn(),
    listLibraryAssetPage: mocks.listPage,
    updateLibraryAsset: vi.fn(),
}));
vi.mock("@/lib/server/media-display-url", () => ({ resolveMediaDisplayUrls: mocks.displayUrls }));
vi.mock("@/lib/server/user-media-deletion-service", () => ({ deleteUserMediaAssetsCascade: vi.fn() }));

import { createLibraryAssetForUser, LibraryAssetServiceError, listLibraryAssetPageForUser } from "./library-asset-service";
import { MediaReferenceWriteConflict } from "./media-reference-write-guard";

describe("library asset display delivery", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.create.mockImplementation(async (_userId: string, asset: unknown) => asset);
        mocks.listPage.mockResolvedValue({
            items: [
                {
                    id: "asset-one",
                    kind: "image",
                    title: "商品图",
                    coverUrl: "/api/generation-log-assets/permanent/image.png",
                    tags: [],
                    data: { dataUrl: "/api/generation-log-assets/permanent/image.png", storageKey: "permanent/image.png", width: 1024, height: 1024, bytes: 10, mimeType: "image/png" },
                    createdAt: "2026-08-25T00:00:00.000Z",
                    updatedAt: "2026-08-25T00:00:00.000Z",
                },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
        });
        mocks.displayUrls.mockResolvedValue(new Map([["permanent/image.png", { displayUrl: "https://img.example.com/cdn-cgi/image/width=1280/original.png", thumbnailUrl: "https://img.example.com/cdn-cgi/image/width=640/original.png" }]]));
    });

    it("adds display-only CDN urls while preserving the stored business media url", async () => {
        const page = await listLibraryAssetPageForUser("user-one", { page: 1, pageSize: 20 });

        expect(page.items[0]).toMatchObject({
            displayUrl: "https://img.example.com/cdn-cgi/image/width=1280/original.png",
            thumbnailUrl: "https://img.example.com/cdn-cgi/image/width=640/original.png",
            data: { dataUrl: "/api/generation-log-assets/permanent/image.png", storageKey: "permanent/image.png" },
        });
    });

    it("maps a deletion race to a stable 409 service error", async () => {
        mocks.create.mockRejectedValue(new MediaReferenceWriteConflict("媒体正在删除或已不可用"));

        const error = await createLibraryAssetForUser("user-one", {
                kind: "image",
                title: "商品图",
                data: { storageKey: "permanent/image.png", serverUrl: "/api/reference-assets/permanent/image.png", mimeType: "image/png" },
            }).catch((reason: unknown) => reason);

        expect(error).toBeInstanceOf(LibraryAssetServiceError);
        expect(error).toMatchObject({ message: "媒体正在删除或已不可用", status: 409 });
    });
});
