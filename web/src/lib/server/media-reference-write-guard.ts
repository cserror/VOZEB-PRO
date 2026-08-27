import { ensurePostgresSchema, getDatabaseProvider, withPostgresTransaction, type QueryExecutor } from "@/lib/server/database";
import { getLocalMediaRegistrations } from "@/lib/server/local-media-registry";

export class MediaReferenceWriteConflict extends Error {
    readonly status = 409;
}

let fileMediaLifecycleQueue = Promise.resolve();

export async function withActiveMediaReferenceWrite<T>(storageKeys: string[], options: { ownerUserId?: string }, write: (executor?: QueryExecutor) => Promise<T>) {
    const keys = normalizeKeys(storageKeys);
    if (!keys.length) return write();
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return withPostgresTransaction<T>(async (executor) => {
            await assertActiveMediaReferences(keys, { ...options, executor });
            return write(executor);
        });
    }
    return withFileMediaLifecycleLock<T>(async () => {
        await assertActiveMediaReferences(keys, options);
        return write();
    });
}

export async function assertActiveMediaReferences(storageKeys: string[], options: { ownerUserId?: string; executor?: QueryExecutor } = {}) {
    const keys = normalizeKeys(storageKeys);
    if (!keys.length) return;
    const registrations = await getLocalMediaRegistrations(keys, { ...options, forUpdate: Boolean(options.executor) });
    const registrationByKey = new Map(registrations.map((registration) => [registration.storageKey, registration]));
    const invalid = keys.some((key) => {
        const registration = registrationByKey.get(key);
        return !registration || registration.deletionStatus === "pending" || (registration.storageClass === "temporary" && Boolean(registration.expiresAt) && Date.parse(registration.expiresAt || "") <= Date.now());
    });
    if (invalid) throw new MediaReferenceWriteConflict("媒体正在删除或已不可用");
}

export function withFileMediaLifecycleLock<T>(operation: () => Promise<T>) {
    const run = fileMediaLifecycleQueue.then(operation, operation);
    fileMediaLifecycleQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

function normalizeKeys(storageKeys: string[]) {
    return Array.from(new Set(storageKeys.map((key) => key.trim().replace(/\\/g, "/").replace(/^\/+/, "")).filter(Boolean)));
}
