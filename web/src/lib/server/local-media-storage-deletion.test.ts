import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getDatabaseProvider: vi.fn(),
    transaction: vi.fn(),
    countReferences: vi.fn(),
    getRegistrations: vi.fn(),
    deleteRegistrations: vi.fn(),
    listPending: vi.fn(),
    markPending: vi.fn(),
    recordFailure: vi.fn(),
    deleteExternal: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    getDatabaseProvider: mocks.getDatabaseProvider,
    withPostgresTransaction: mocks.transaction,
}));
vi.mock("@/lib/server/local-media-references", () => ({ countLocalMediaReferences: mocks.countReferences }));
vi.mock("@/lib/server/local-media-registry", () => ({
    deleteLocalMediaRegistrations: mocks.deleteRegistrations,
    getLocalMediaRegistration: vi.fn(),
    getLocalMediaRegistrations: mocks.getRegistrations,
    getLocalMediaRegistrationSummary: vi.fn(),
    listPendingLocalMediaDeletions: mocks.listPending,
    listExpiredLocalMediaRegistrations: vi.fn(),
    listFileLocalMediaRegistrations: vi.fn(),
    listLocalMediaRegistrationPage: vi.fn(),
    markLocalMediaDeletionPending: mocks.markPending,
    recordLocalMediaDeletionFailure: mocks.recordFailure,
}));
vi.mock("@/lib/server/object-storage-service", () => ({ deleteExternalMediaObject: mocks.deleteExternal }));

import { deleteRegisteredLocalMediaSnapshots } from "./local-media-storage";

const registration = {
    storageKey: "permanent/one.png",
    scope: "reference" as const,
    storageClass: "permanent" as const,
    type: "image" as const,
    ownerUserId: "user-one",
    source: "user-upload",
    mimeType: "image/png",
    bytes: 4,
    storageProvider: "object" as const,
    externalStorageId: "default",
    externalObjectKey: "vozeb-pro/images/reference/permanent/one.png",
    createdAt: "2026-08-27T00:00:00.000Z",
};

describe("registered media deletion", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.countReferences.mockResolvedValue(new Map([[registration.storageKey, 0]]));
        mocks.getRegistrations.mockResolvedValue([registration]);
        mocks.markPending.mockResolvedValue([registration]);
        mocks.deleteExternal.mockResolvedValue(true);
        mocks.deleteRegistrations.mockResolvedValue(1);
        mocks.recordFailure.mockResolvedValue({ ...registration, deletionStatus: "pending", deletionAttempts: 1 });
    });

    it("locks registrations, rechecks references, and marks pending in one PostgreSQL transaction", async () => {
        const executor = { query: vi.fn() };
        mocks.getDatabaseProvider.mockReturnValue("postgres");
        mocks.transaction.mockImplementation(async (handler) => handler(executor));

        await expect(deleteRegisteredLocalMediaSnapshots([registration])).resolves.toMatchObject({ deletedFiles: 1, blocked: [], pending: [] });

        expect(mocks.getRegistrations).toHaveBeenCalledWith([registration.storageKey], { executor, forUpdate: true });
        expect(mocks.countReferences).toHaveBeenCalledWith([registration.storageKey], { executor });
        expect(mocks.markPending).toHaveBeenCalledWith([registration.storageKey], { executor });
    });

    it("keeps failure evidence when physical deletion succeeds but registry cleanup fails", async () => {
        mocks.getDatabaseProvider.mockReturnValue("file");
        mocks.deleteRegistrations.mockRejectedValueOnce(new Error("database unavailable"));

        await expect(deleteRegisteredLocalMediaSnapshots([registration])).resolves.toEqual({
            deletedFiles: 0,
            deletedBytes: 0,
            blocked: [],
            pending: [{ id: expect.any(String), storageKey: registration.storageKey }],
        });
        expect(mocks.deleteExternal).toHaveBeenCalledWith(registration);
        expect(mocks.recordFailure).toHaveBeenCalledWith(registration.storageKey, expect.objectContaining({ message: "database unavailable" }));
    });
});
