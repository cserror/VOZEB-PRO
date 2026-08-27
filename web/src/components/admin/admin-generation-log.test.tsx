import { App } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StoredGenerationLog } from "@/lib/server/generation-log-store";

import { GenerationLogAssetPreview, GenerationLogDetail } from "./admin-generation-log";

const imageLog: StoredGenerationLog = {
    id: "log-1",
    userId: "user-1",
    username: "tester",
    displayName: "测试用户",
    kind: "image",
    source: "agent",
    status: "success",
    title: "生成图片",
    prompt: "生成一张测试图片",
    model: "gpt-image-2",
    summary: "生成完成",
    durationMs: 1_200,
    count: 1,
    successCount: 1,
    failCount: 0,
    assets: [
        {
            type: "image",
            storageKey: "permanent/test.png",
            displayUrl: "https://img.example.com/cdn-cgi/image/width=1280/test.png",
            thumbnailUrl: "https://img.example.com/cdn-cgi/image/width=640/test.png",
        },
    ],
    createdAt: "2026-08-27T10:00:00.000Z",
    updatedAt: "2026-08-27T10:00:01.200Z",
};

describe("admin generation log media preview", () => {
    it("renders a compact clickable image preview in the table result cell", () => {
        const html = renderToStaticMarkup(
            <App>
                <GenerationLogAssetPreview log={imageLog} />
            </App>,
        );

        expect(html).toContain('data-preview-overlay="icon"');
        expect(html).toContain('data-media-deferred="true"');
        expect(html).not.toContain('src="https://img.example.com/cdn-cgi/image/width=1280/test.png"');
    });

    it("keeps the full result image zoomable in the detail view", () => {
        const html = renderToStaticMarkup(
            <App>
                <GenerationLogDetail log={imageLog} />
            </App>,
        );

        expect(html).toContain('data-preview-overlay="label"');
        expect(html).toContain("查看大图");
        expect(html).toContain('src="https://img.example.com/cdn-cgi/image/width=640/test.png"');
        expect(html).toContain('alt="生成图片 1"');
        expect(html).toContain("cursor-zoom-in");
    });
});
