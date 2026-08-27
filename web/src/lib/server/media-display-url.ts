import { normalizeImagePreviewWidth } from "@/lib/media-image-variant";
import { mediaRouteUrl } from "@/lib/media-route-url";
import { cloudflareImageUrl, publicObjectUrl } from "@/lib/object-storage-public-url";
import { getLocalMediaRegistrations, type LocalMediaRegistration } from "@/lib/server/local-media-registry";
import { getObjectStorageRuntimeConfig, type ObjectStorageRuntimeConfig } from "@/lib/server/object-storage-config";

export type MediaDisplayUrls = {
    displayUrl: string;
    thumbnailUrl?: string;
};

export async function resolveMediaDisplayUrls(storageKeys: string[], options: { thumbnailWidth?: number } = {}) {
    const keys = Array.from(new Set(storageKeys.map((key) => key.trim()).filter(Boolean)));
    const resolved = new Map<string, MediaDisplayUrls>();
    if (!keys.length) return resolved;

    const registrations = await getLocalMediaRegistrations(keys);
    const objectRegistrations = registrations.filter((registration) => registration.storageProvider === "object");
    const config = objectRegistrations.length ? await getObjectStorageRuntimeConfig() : undefined;

    for (const registration of registrations) {
        const urls = mediaDisplayUrls(registration, config, options.thumbnailWidth);
        if (urls) resolved.set(registration.storageKey, urls);
    }
    return resolved;
}

export function mediaDisplayUrls(registration: LocalMediaRegistration, config?: ObjectStorageRuntimeConfig, thumbnailWidth = 640): MediaDisplayUrls | null {
    if (registration.deletionStatus === "pending") return null;
    if (registration.expiresAt && Date.parse(registration.expiresAt) <= Date.now()) return null;
    const siteUrls = siteMediaDisplayUrls(registration.scope, registration.storageKey, registration.type, thumbnailWidth);
    if (registration.storageProvider === "object") {
        if (!registration.externalObjectKey || config?.imageDeliveryProvider !== "cloudflare" || !config.publicBaseUrl || registration.storageClass === "temporary" || (registration.externalStorageId && registration.externalStorageId !== config.id))
            return siteUrls;
        const displayUrl = registration.type === "image" ? cloudflareImageUrl(config.publicBaseUrl, registration.externalObjectKey, 1280) : publicObjectUrl(config.publicBaseUrl, registration.externalObjectKey);
        return {
            displayUrl,
            ...(registration.type === "image" ? { thumbnailUrl: cloudflareImageUrl(config.publicBaseUrl, registration.externalObjectKey, thumbnailWidth) } : {}),
        };
    }
    return siteUrls;
}

function siteMediaDisplayUrls(scope: "generation" | "reference", storageKey: string, type: LocalMediaRegistration["type"], thumbnailWidth = 640): MediaDisplayUrls {
    const displayUrl = mediaRouteUrl(scope, storageKey);
    return { displayUrl, ...(type === "image" ? { thumbnailUrl: `${displayUrl}?format=webp&width=${normalizeImagePreviewWidth(thumbnailWidth)}` } : {}) };
}
