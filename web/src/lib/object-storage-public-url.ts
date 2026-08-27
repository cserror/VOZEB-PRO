import { normalizeImagePreviewWidth } from "@/lib/media-image-variant";

export const CLOUDFLARE_IMAGE_WIDTHS = [640, 1280] as const;

export function imageVariantObjectKey(objectKey: string, width: unknown) {
    return `${objectKey}.vozeb-preview/webp-${normalizeImagePreviewWidth(width)}.webp`;
}

export function normalizeCloudflareImageWidth(width: unknown): (typeof CLOUDFLARE_IMAGE_WIDTHS)[number] {
    const parsed = typeof width === "number" ? width : Number(width);
    return Number.isFinite(parsed) && parsed > 640 ? 1280 : 640;
}

export function publicObjectUrl(publicBaseUrl: string, objectKey: string) {
    const encodedKey = objectKey
        .replace(/\\/g, "/")
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return new URL(encodedKey, `${publicBaseUrl.replace(/\/+$/, "")}/`).toString();
}

export function cloudflareImageUrl(publicBaseUrl: string, objectKey: string, width: unknown) {
    const normalizedWidth = normalizeCloudflareImageWidth(width);
    const transformations = `width=${normalizedWidth},quality=82,format=auto,fit=scale-down,onerror=redirect`;
    const objectUrl = publicObjectUrl(publicBaseUrl, objectKey);
    const baseUrl = `${publicBaseUrl.replace(/\/+$/, "")}/`;
    return `${baseUrl}cdn-cgi/image/${transformations}/${objectUrl.slice(baseUrl.length)}`;
}
