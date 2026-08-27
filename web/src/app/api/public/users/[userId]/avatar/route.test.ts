import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    storageKey: vi.fn(),
    registration: vi.fn(),
    pendingDeletion: vi.fn(),
    rate: vi.fn(),
    stream: vi.fn(),
    head: vi.fn(),
    externalRead: vi.fn(),
    acquire: vi.fn(),
    wrap: vi.fn(),
    release: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getPublicAvatarStorageKey: mocks.storageKey }));
vi.mock("@/lib/server/data-dir", () => ({ getServerDataDir: vi.fn(() => "C:/data") }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.registration, isLocalMediaPendingDeletion: mocks.pendingDeletion }));
vi.mock("@/lib/server/local-media-response", () => ({ createLocalMediaResponse: mocks.stream, createMediaHeadResponse: mocks.head, mediaContentDisposition: vi.fn(() => "inline") }));
vi.mock("@/lib/server/media-concurrency", () => ({ acquireMediaConcurrency: mocks.acquire, withMediaConcurrency: mocks.wrap }));
vi.mock("@/lib/server/object-storage-service", () => ({ createExternalMediaReadUrl: mocks.externalRead }));
vi.mock("@/lib/server/reference-asset-store", () => ({ readReferenceAsset: vi.fn() }));
vi.mock("@/lib/server/security", () => ({ checkPublicMediaRateLimit: mocks.rate, rateLimitHeaders: vi.fn(() => ({})) }));

import { GET, HEAD } from "./route";

const context = { params: Promise.resolve({ userId: "user-one" }) };
const registration = {
    storageKey: "permanent/2026/08/27/images/avatar.webp",
    scope: "reference",
    storageClass: "permanent",
    type: "image",
    ownerUserId: "user-one",
    source: "profile-avatar",
    mimeType: "image/webp",
    bytes: 10,
    storageProvider: "object",
    externalObjectKey: "paisi-art/images/reference/permanent/avatar.webp",
    createdAt: "2026-08-27T00:00:00.000Z",
};

describe("public avatar route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.storageKey.mockResolvedValue(registration.storageKey);
        mocks.registration.mockResolvedValue(registration);
        mocks.pendingDeletion.mockImplementation((item) => item?.deletionStatus === "pending");
        mocks.rate.mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 });
        mocks.externalRead.mockResolvedValue("https://img.example.com/avatar.webp");
        mocks.acquire.mockReturnValue({ release: mocks.release });
        mocks.wrap.mockImplementation((response: Response) => response);
        mocks.head.mockReturnValue(new Response(null, { status: 200 }));
    });

    it("redirects an active object-backed avatar", async () => {
        const response = await GET(new Request("http://localhost/api/public/users/user-one/avatar"), context);

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://img.example.com/avatar.webp");
    });

    it("hides a pending deletion from GET and HEAD", async () => {
        mocks.registration.mockResolvedValue({ ...registration, deletionStatus: "pending" });

        expect((await GET(new Request("http://localhost/api/public/users/user-one/avatar"), context)).status).toBe(404);
        expect((await HEAD(new Request("http://localhost/api/public/users/user-one/avatar", { method: "HEAD" }), context)).status).toBe(404);
        expect(mocks.externalRead).not.toHaveBeenCalled();
        expect(mocks.head).not.toHaveBeenCalled();
    });
});
