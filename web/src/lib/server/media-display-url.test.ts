import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    config: vi.fn(),
    registrations: vi.fn(),
}));

vi.mock("@/lib/server/object-storage-config", () => ({ getObjectStorageRuntimeConfig: mocks.config }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistrations: mocks.registrations }));

import { resolveMediaDisplayUrls } from "./media-display-url";

const baseRegistration = {
    storageKey: "permanent/2026/08/25/images/result.png",
    scope: "generation" as const,
    storageClass: "permanent" as const,
    type: "image" as const,
    ownerUserId: "user-one",
    source: "image-workbench",
    mimeType: "image/png",
    bytes: 1024,
    createdAt: "2026-08-25T00:00:00.000Z",
};

describe("media display urls", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.config.mockResolvedValue({
            id: "default",
            enabled: true,
            endpoint: "https://account.r2.cloudflarestorage.com",
            region: "auto",
            bucket: "paisi-art",
            prefix: "paisi-art",
            publicBaseUrl: "https://img.paisi.art",
            imageDeliveryProvider: "cloudflare",
            accessKeyId: "access",
            secretAccessKey: "secret",
            forcePathStyle: false,
        });
    });

    it("returns Cloudflare 640/1280 image urls for registered permanent R2 media", async () => {
        mocks.registrations.mockResolvedValue([
            {
                ...baseRegistration,
                storageProvider: "object",
                externalStorageId: "default",
                externalObjectKey: "paisi-art/images/generation/permanent/2026/08/25/中文 result.png",
            },
        ]);

        const urls = await resolveMediaDisplayUrls([baseRegistration.storageKey], { thumbnailWidth: 500 });

        expect(urls.get(baseRegistration.storageKey)).toEqual({
            displayUrl: "https://img.paisi.art/cdn-cgi/image/width=1280,quality=82,format=auto,fit=scale-down,onerror=redirect/paisi-art/images/generation/permanent/2026/08/25/%E4%B8%AD%E6%96%87%20result.png",
            thumbnailUrl: "https://img.paisi.art/cdn-cgi/image/width=640,quality=82,format=auto,fit=scale-down,onerror=redirect/paisi-art/images/generation/permanent/2026/08/25/%E4%B8%AD%E6%96%87%20result.png",
        });
    });

    it("keeps local-provider media on the authenticated site route", async () => {
        mocks.registrations.mockResolvedValue([{ ...baseRegistration, storageProvider: "local" }]);

        const urls = await resolveMediaDisplayUrls([baseRegistration.storageKey], { thumbnailWidth: 640 });

        expect(urls.get(baseRegistration.storageKey)).toEqual({
            displayUrl: "/api/generation-log-assets/permanent/2026/08/25/images/result.png",
            thumbnailUrl: "/api/generation-log-assets/permanent/2026/08/25/images/result.png?format=webp&width=640",
        });
    });

    it("does not synthesize a display url when the media registration is missing", async () => {
        mocks.registrations.mockResolvedValue([]);

        const urls = await resolveMediaDisplayUrls([baseRegistration.storageKey]);

        expect(urls).toEqual(new Map());
    });

    it("keeps temporary references and non-Cloudflare delivery on the site route", async () => {
        mocks.registrations.mockResolvedValue([
            {
                ...baseRegistration,
                scope: "reference",
                storageClass: "temporary",
                storageProvider: "object",
                externalStorageId: "default",
                externalObjectKey: "paisi-art/images/reference/temporary/2026/08/25/result.png",
            },
        ]);

        const temporary = await resolveMediaDisplayUrls([baseRegistration.storageKey]);
        expect(temporary.get(baseRegistration.storageKey)?.displayUrl).toBe("/api/reference-assets/permanent/2026/08/25/images/result.png");

        mocks.config.mockResolvedValue({ ...(await mocks.config()), imageDeliveryProvider: "none" });
        mocks.registrations.mockResolvedValue([{ ...baseRegistration, storageProvider: "object", externalStorageId: "default", externalObjectKey: "paisi-art/images/generation/permanent/result.png" }]);
        const privateDelivery = await resolveMediaDisplayUrls([baseRegistration.storageKey]);
        expect(privateDelivery.get(baseRegistration.storageKey)?.displayUrl).toBe("/api/generation-log-assets/permanent/2026/08/25/images/result.png");
    });

    it("does not expose display urls for media pending deletion", async () => {
        mocks.registrations.mockResolvedValue([
            {
                ...baseRegistration,
                storageProvider: "object",
                externalStorageId: "default",
                externalObjectKey: "paisi-art/images/generation/permanent/result.png",
                deletionStatus: "pending",
                deletionRequestedAt: "2026-08-27T00:00:00.000Z",
                deletionAttempts: 1,
            },
        ]);

        await expect(resolveMediaDisplayUrls([baseRegistration.storageKey])).resolves.toEqual(new Map());
    });
});
