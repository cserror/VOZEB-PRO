import { cleanupExpiredAuthRecords, getAuthSettings } from "@/lib/auth/store";
import { cleanupExpiredStoredGenerationTasks } from "@/lib/server/generation-task-store";
import { cleanupExpiredLocalMediaAssets, retryPendingLocalMediaDeletions } from "@/lib/server/local-media-storage";

export type DataLifecycleMaintenanceResult = {
    sessions: number;
    emailCodes: number;
    generationTasks: number;
    temporaryMedia: {
        deletedFiles: number;
        deletedBytes: number;
        blocked: Array<{ id: string; storageKey: string; referenceCount: number }>;
    };
    pendingMediaDeletions: Awaited<ReturnType<typeof retryPendingLocalMediaDeletions>>;
};

export async function runDataLifecycleMaintenance(): Promise<DataLifecycleMaintenanceResult> {
    const { dataLifecycle } = await getAuthSettings();
    const emptyMedia = { deletedFiles: 0, deletedBytes: 0, blocked: [] };
    const [auth, generationTasks, temporaryMedia, pendingMediaDeletions] = await Promise.all([
        dataLifecycle.cleanupExpiredSessions || dataLifecycle.cleanupExpiredEmailCodes
            ? cleanupExpiredAuthRecords({
                  cleanupSessions: dataLifecycle.cleanupExpiredSessions,
                  cleanupEmailCodes: dataLifecycle.cleanupExpiredEmailCodes,
                  limit: dataLifecycle.maintenanceBatchSize,
              })
            : Promise.resolve({ sessions: 0, emailCodes: 0 }),
        dataLifecycle.cleanupExpiredGenerationTasks ? cleanupExpiredStoredGenerationTasks({ limit: dataLifecycle.maintenanceBatchSize }) : Promise.resolve(0),
        dataLifecycle.cleanupExpiredTemporaryMedia ? cleanupExpiredLocalMediaAssets(dataLifecycle.maintenanceBatchSize) : Promise.resolve(emptyMedia),
        retryPendingLocalMediaDeletions(dataLifecycle.maintenanceBatchSize),
    ]);
    return { sessions: auth.sessions, emailCodes: auth.emailCodes, generationTasks, temporaryMedia, pendingMediaDeletions };
}
