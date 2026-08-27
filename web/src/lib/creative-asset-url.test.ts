import { describe, expect, it } from "vitest";

import { creativeAssetDisplayUrl, creativeAssetStableUrl, creativeAssetThumbnailUrl } from "./creative-asset-url";

describe("creative asset urls", () => {
    it("separates CDN display urls from the stable business url", () => {
        const asset = {
            displayUrl: "https://img-test.paisi.art/cdn-cgi/image/width=1280/result.png",
            thumbnailUrl: "https://img-test.paisi.art/cdn-cgi/image/width=640/result.png",
            serverUrl: "/api/generation-log-assets/permanent/result.png",
            remoteUrl: "https://provider.example/result.png",
        };

        expect(creativeAssetDisplayUrl(asset)).toBe(asset.displayUrl);
        expect(creativeAssetThumbnailUrl(asset)).toBe(asset.thumbnailUrl);
        expect(creativeAssetStableUrl(asset)).toBe(asset.serverUrl);
    });

    it("falls back to the existing server and remote urls", () => {
        expect(creativeAssetDisplayUrl({ serverUrl: "/api/reference-assets/local.png" })).toBe("/api/reference-assets/local.png");
        expect(creativeAssetThumbnailUrl({ remoteUrl: "https://provider.example/result.png" })).toBe("https://provider.example/result.png");
        expect(creativeAssetStableUrl({ remoteUrl: "https://provider.example/result.png" })).toBe("https://provider.example/result.png");
    });
});
