import { resolveMediaDisplayUrls } from "@/lib/server/media-display-url";
import type { StoredGenerationLog } from "@/lib/server/generation-log-types";

export async function hydrateGenerationLogMedia<T extends StoredGenerationLog>(logs: T[]): Promise<T[]> {
    const urls = await resolveMediaDisplayUrls(
        logs.flatMap((log) => (log.assets || []).map((asset) => asset.storageKey)),
        { thumbnailWidth: 640 },
    );
    return logs.map((log) => ({
        ...log,
        assets: (log.assets || []).map((asset) => ({ ...asset, ...urls.get(asset.storageKey) })),
    }));
}
