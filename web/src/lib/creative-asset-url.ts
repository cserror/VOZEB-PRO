import type { CreativeAsset } from "@/lib/creative-runtime-contract";

type CreativeAssetLocation = Pick<CreativeAsset, "displayUrl" | "thumbnailUrl" | "serverUrl" | "remoteUrl">;

export function creativeAssetDisplayUrl(asset: CreativeAssetLocation) {
    return asset.displayUrl || asset.serverUrl || asset.remoteUrl || "";
}

export function creativeAssetThumbnailUrl(asset: CreativeAssetLocation) {
    return asset.thumbnailUrl || creativeAssetDisplayUrl(asset);
}

export function creativeAssetStableUrl(asset: CreativeAssetLocation) {
    return asset.serverUrl || asset.remoteUrl || "";
}
