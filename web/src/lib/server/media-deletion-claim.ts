import { getDatabaseProvider, withPostgresTransaction, type QueryExecutor } from "@/lib/server/database";
import { countLocalMediaReferences } from "@/lib/server/local-media-references";
import { getLocalMediaRegistrations, markLocalMediaDeletionPending, type LocalMediaRegistration } from "@/lib/server/local-media-registry";
import { withFileMediaLifecycleLock } from "@/lib/server/media-reference-write-guard";

export async function claimLocalMediaDeletions(registrations: LocalMediaRegistration[]) {
    const unique = Array.from(new Map(registrations.map((item) => [item.storageKey, item])).values());
    if (!unique.length) return { deletable: [], blocked: [] };
    if (getDatabaseProvider() !== "postgres") return withFileMediaLifecycleLock(() => classifyAndMark(unique));

    return withPostgresTransaction(async (executor) => {
        const locked = await getLocalMediaRegistrations(
            unique.map((item) => item.storageKey),
            { executor, forUpdate: true },
        );
        return classifyAndMark(locked, executor);
    });
}

async function classifyAndMark(registrations: LocalMediaRegistration[], executor?: QueryExecutor) {
    const references = await countLocalMediaReferences(
        registrations.map((item) => item.storageKey),
        executor ? { executor } : undefined,
    );
    const blocked: Array<{ id: string; storageKey: string; referenceCount: number }> = [];
    const deletable: LocalMediaRegistration[] = [];
    for (const registration of registrations) {
        const referenceCount = references.get(registration.storageKey) || 0;
        if (referenceCount) {
            blocked.push({ id: mediaRegistrationId(registration), storageKey: registration.storageKey, referenceCount });
            continue;
        }
        deletable.push(registration);
    }
    await markLocalMediaDeletionPending(
        deletable.map((item) => item.storageKey),
        executor ? { executor } : undefined,
    );
    return { deletable, blocked };
}

function mediaRegistrationId(registration: LocalMediaRegistration) {
    return Buffer.from(JSON.stringify({ scope: registration.scope, relativePath: registration.storageKey }), "utf8").toString("base64url");
}
