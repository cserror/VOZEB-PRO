import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getById: vi.fn(),
    update: vi.fn(),
    getPublicDetails: vi.fn(),
    mediaReferenceWrite: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: vi.fn(() => ({ users: { getById: mocks.getById, update: mocks.update, getPublicDetails: mocks.getPublicDetails } })),
    isPostgresDatabaseEnabled: vi.fn(() => true),
}));
vi.mock("@/lib/server/media-reference-write-guard", () => ({
    withActiveMediaReferenceWrite: mocks.mediaReferenceWrite,
}));

import { updateOwnAvatarStorageKey } from "./store-profile";

describe("profile avatar storage reference", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const user = {
            id: "user-one",
            accountId: "0001",
            username: "tester",
            displayName: "Tester",
            bio: "",
            role: "user",
            adminPermissions: [],
            status: "active",
            planId: "free",
            pointsBalance: 0,
            passwordHash: "hash",
            createdAt: "2026-08-27T00:00:00.000Z",
            updatedAt: "2026-08-27T00:00:00.000Z",
            avatarStorageKey: undefined,
        };
        mocks.getById.mockResolvedValue(user);
        mocks.update.mockResolvedValue(undefined);
        mocks.getPublicDetails.mockResolvedValue([{ user, planId: "free", planName: "免费版", permanentPoints: 0, dailyPoints: 0 }]);
    });

    it("updates the user with the executor that already locked the active media row", async () => {
        const executor = { query: vi.fn() };
        mocks.mediaReferenceWrite.mockImplementationOnce(async (_keys, _options, write) => write(executor));
        const storageKey = "permanent/2026/08/27/images/avatar.webp";

        await updateOwnAvatarStorageKey("user-one", storageKey);

        expect(mocks.mediaReferenceWrite).toHaveBeenCalledWith([storageKey], { ownerUserId: "user-one" }, expect.any(Function));
        const { createPostgresRepositories } = await import("@/lib/server/database");
        expect(createPostgresRepositories).toHaveBeenCalledWith(executor);
        expect(mocks.update).toHaveBeenCalledWith("user-one", { avatarStorageKey: storageKey });
    });
});
