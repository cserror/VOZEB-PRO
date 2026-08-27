import { describe, expect, it } from "vitest";

import { cloudflareImageUrl, normalizeCloudflareImageWidth } from "./object-storage-public-url";

describe("Cloudflare image delivery urls", () => {
    it.each([
        [0, 640],
        [500, 640],
        [640, 640],
        [800, 1280],
        [960, 1280],
        [1200, 1280],
        [1600, 1280],
        [2048, 1280],
    ])("maps requested width %s to %s", (requested, expected) => {
        expect(normalizeCloudflareImageWidth(requested)).toBe(expected);
    });

    it("keeps the transformation syntax intact and encodes object path segments", () => {
        expect(cloudflareImageUrl("https://img.paisi.art", "paisi-art/images/中文 result.png", 800)).toBe(
            "https://img.paisi.art/cdn-cgi/image/width=1280,quality=82,format=auto,fit=scale-down,onerror=redirect/paisi-art/images/%E4%B8%AD%E6%96%87%20result.png",
        );
    });
});
