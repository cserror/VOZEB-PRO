import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    cleanupExpiredAuthRecords: vi.fn(),
    cleanupExpiredStoredGenerationTasks: vi.fn(),
    cleanupExpiredLocalMediaAssets: vi.fn(),
    retryPendingLocalMediaDeletions: vi.fn(),
    getAuthSettings: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ cleanupExpiredAuthRecords: mocks.cleanupExpiredAuthRecords, getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/generation-task-store", () => ({ cleanupExpiredStoredGenerationTasks: mocks.cleanupExpiredStoredGenerationTasks }));
vi.mock("@/lib/server/local-media-storage", () => ({ cleanupExpiredLocalMediaAssets: mocks.cleanupExpiredLocalMediaAssets, retryPendingLocalMediaDeletions: mocks.retryPendingLocalMediaDeletions }));

import { runDataLifecycleMaintenance } from "./data-lifecycle-service";

describe("data lifecycle maintenance", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.cleanupExpiredAuthRecords.mockResolvedValue({ sessions: 2, emailCodes: 3 });
        mocks.cleanupExpiredStoredGenerationTasks.mockResolvedValue(4);
        mocks.cleanupExpiredLocalMediaAssets.mockResolvedValue({ deletedFiles: 5, deletedBytes: 60, blocked: [] });
        mocks.retryPendingLocalMediaDeletions.mockResolvedValue({ deletedFiles: 1, deletedBytes: 12, blocked: [], pending: [] });
    });

    it("runs one configured bounded batch across technical expiry stores", async () => {
        mocks.getAuthSettings.mockResolvedValue({
            dataLifecycle: {
                cleanupExpiredSessions: true,
                cleanupExpiredEmailCodes: true,
                cleanupExpiredGenerationTasks: true,
                cleanupExpiredTemporaryMedia: true,
                maintenanceBatchSize: 24,
            },
        });

        await expect(runDataLifecycleMaintenance()).resolves.toEqual({
            sessions: 2,
            emailCodes: 3,
            generationTasks: 4,
            temporaryMedia: { deletedFiles: 5, deletedBytes: 60, blocked: [] },
            pendingMediaDeletions: { deletedFiles: 1, deletedBytes: 12, blocked: [], pending: [] },
        });
        expect(mocks.cleanupExpiredAuthRecords).toHaveBeenCalledWith({ cleanupSessions: true, cleanupEmailCodes: true, limit: 24 });
        expect(mocks.cleanupExpiredStoredGenerationTasks).toHaveBeenCalledWith({ limit: 24 });
        expect(mocks.cleanupExpiredLocalMediaAssets).toHaveBeenCalledWith(24);
        expect(mocks.retryPendingLocalMediaDeletions).toHaveBeenCalledWith(24);
    });

    it("does not delete categories disabled by the administrator", async () => {
        mocks.getAuthSettings.mockResolvedValue({
            dataLifecycle: {
                cleanupExpiredSessions: false,
                cleanupExpiredEmailCodes: false,
                cleanupExpiredGenerationTasks: false,
                cleanupExpiredTemporaryMedia: false,
                maintenanceBatchSize: 50,
            },
        });

        await expect(runDataLifecycleMaintenance()).resolves.toEqual({
            sessions: 0,
            emailCodes: 0,
            generationTasks: 0,
            temporaryMedia: { deletedFiles: 0, deletedBytes: 0, blocked: [] },
            pendingMediaDeletions: { deletedFiles: 1, deletedBytes: 12, blocked: [], pending: [] },
        });
        expect(mocks.cleanupExpiredAuthRecords).not.toHaveBeenCalled();
        expect(mocks.cleanupExpiredStoredGenerationTasks).not.toHaveBeenCalled();
        expect(mocks.cleanupExpiredLocalMediaAssets).not.toHaveBeenCalled();
        expect(mocks.retryPendingLocalMediaDeletions).toHaveBeenCalledWith(50);
    });
});
