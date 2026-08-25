import { expect, test } from "@playwright/test";

import type { GenerationHistoryItem } from "../src/lib/generation-history-contract";

import { expectNoHorizontalOverflow, expectVisibleControlsWithinViewport } from "./responsive-helpers";

const imageUrl = "/generation-smoke.webp";
const optimizedImagePrompt = "生成一张自然写实动物摄影风格的图片：一只精神饱满、身体结构准确的成年公鸡全身站立在简洁的乡野地面上，姿态自然生动，头部微微抬起；鸡冠呈健康鲜明的深红色，羽毛纹理清晰细腻。采用平视视角与方形构图，背景适度虚化，使用柔和清晨自然光。画面中只出现一只主要的鸡，不要身体畸形、多余肢体、文字、标识或水印。";

test("generation history filters, previews, details, material actions, and current-page deletion", async ({ page }, testInfo) => {
    const items = generationItems();
    await page.route(/\/api\/generation-history(?:\?.*)?$/, async (route) => {
        const request = route.request();
        if (request.method() === "POST") {
            const body = request.postDataJSON() as { resultId: string };
            const item = items.find((candidate) => candidate.id === body.resultId);
            if (item) item.addedToLibrary = true;
            return route.fulfill({ json: { code: 0, data: { asset: { id: "asset-one" } }, msg: "已添加到素材" } });
        }
        if (request.method() === "DELETE") {
            const body = request.postDataJSON() as { resultIds: string[] };
            for (const id of body.resultIds) {
                const index = items.findIndex((candidate) => candidate.id === id);
                if (index >= 0) items.splice(index, 1);
            }
            return route.fulfill({ json: { code: 0, data: { deleted: body.resultIds.length }, msg: "已删除" } });
        }
        const url = new URL(request.url());
        const kind = url.searchParams.get("kind");
        const status = url.searchParams.get("status");
        const keyword = url.searchParams.get("keyword")?.toLowerCase() || "";
        const filtered = items.filter((item) => (!kind || item.kind === kind) && (!status || item.status === status) && (!keyword || `${item.title} ${item.originalPrompt}`.toLowerCase().includes(keyword)));
        return route.fulfill({ json: { code: 0, data: { items: filtered, total: filtered.length, page: 1, pageSize: 24 }, msg: "OK" } });
    });

    await page.goto("/generations");
    await expect(page.getByRole("heading", { name: "生成记录" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(3);
    await expectNoHorizontalOverflow(page);
    await expectVisibleControlsWithinViewport(page);

    const viewportWidth = testInfo.project.use.viewport?.width || 1280;
    await expect(page.getByRole("combobox")).toHaveCount(viewportWidth >= 1024 ? 1 : 2);
    if (viewportWidth >= 1024) {
        const filters = page.getByPlaceholder("搜索原提示词或标题").locator("xpath=ancestor::section[1]");
        const filterTops = await Promise.all([filters.locator(".ant-segmented:visible"), filters.locator(".ant-input-affix-wrapper:visible"), filters.locator(".ant-select:visible"), filters.locator(".ant-picker:visible")].map(async (control) => (await control.boundingBox())?.y));
        expect(filterTops.every((value): value is number => value !== undefined)).toBe(true);
        expect(Math.max(...(filterTops as number[])) - Math.min(...(filterTops as number[]))).toBeLessThanOrEqual(2);
    }

    const cards = page.getByRole("article");
    await expect(cards.first()).not.toContainText("已完成");
    await expect(cards.nth(2)).not.toContainText("失败");
    const lefts = await cards.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().left)));
    const expectedColumns = viewportWidth < 768 ? 2 : viewportWidth < 1024 ? 3 : 4;
    expect(new Set(lefts).size).toBe(Math.min(expectedColumns, await cards.count()));
    await expect(cards.first()).not.toContainText("可公开优化提示词");
    await expect(cards.first()).toContainText("image-pro");
    await expect(cards.first().getByRole("button", { name: "更多操作" })).toHaveCount(0);
    const cardActions = cards.first().getByRole("toolbar", { name: "结果操作" }).getByRole("button");
    await expect(cardActions).toHaveCount(6);
    const actionRows = await cardActions.evaluateAll((buttons) => [...new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)))].length);
    expect(actionRows).toBe(viewportWidth < 640 ? 2 : 1);

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await cards.first().getByRole("button", { name: "复制提示词" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(optimizedImagePrompt);

    await cards.first().getByRole("img").click();
    const preview = page.getByRole("dialog", { name: "商品主图" });
    await expect(preview).toBeVisible();
    await preview.locator(".ant-image-preview-close").click();

    await cards.first().getByRole("button", { name: "查看详情" }).click();
    const details = page.getByRole("dialog", { name: "生成详情" });
    await expect(details.getByText(optimizedImagePrompt, { exact: true })).toBeVisible();
    await expect(details.getByText("2.5 积分", { exact: true })).toBeVisible();
    const sourceLabel = details.getByText("来源", { exact: true });
    await expect(sourceLabel).toBeVisible();
    expect(await sourceLabel.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
    })).toBe(true);
    await page.keyboard.press("Escape");
    await expect(details).toBeHidden();

    await cards.first().getByRole("button", { name: "添加到素材" }).click();
    await expect(cards.first().getByRole("button", { name: "已添加到素材" })).toBeVisible();

    await cards.nth(0).getByRole("checkbox").check();
    await cards.nth(1).getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "批量下载" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectVisibleControlsWithinViewport(page);
    await page.getByRole("button", { name: "批量删除" }).click();
    const confirmation = page.getByRole("dialog", { name: "删除选中的 2 条生成记录？" });
    await confirmation.getByRole("button", { name: /删\s*除/ }).click();
    await expect(page.getByRole("article")).toHaveCount(1);

    await page.getByPlaceholder("搜索原提示词或标题").fill("不存在");
    await expect(page.getByText("没有找到生成记录", { exact: true })).toBeVisible();
});

test("prompt library and personal prompts share one route", async ({ page }) => {
    await page.route(/\/api\/prompts(?:\?.*)?$/, (route) => route.fulfill({ json: { items: [], tags: ["全部"], categories: ["全部"], total: 0 } }));
    await page.route(/\/api\/my-prompts(?:\?.*)?$/, (route) => route.fulfill({ json: { items: [], tags: [], categories: [], total: 0 } }));

    await page.goto("/prompts");
    await expect(page.getByRole("heading", { name: "提示词库", exact: true })).toBeVisible();
    await expect(page.getByRole("main").locator(".ant-segmented")).toBeVisible();
    await expect(page.locator("header").locator(".ant-segmented")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectVisibleControlsWithinViewport(page);
    await page.getByRole("main").getByText("我的提示词", { exact: true }).click();
    await expect(page).toHaveURL(/\/prompts\?view=mine$/);
    await expect(page.getByRole("heading", { name: "我的提示词", exact: true })).toBeVisible();
    await expect(page.getByRole("main").locator(".ant-segmented")).toBeVisible();
    await expect(page.getByRole("button", { name: "添加提示词" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectVisibleControlsWithinViewport(page);

    await page.goto("/my-prompts");
    await expect(page).toHaveURL(/\/prompts\?view=mine$/);
});

function generationItems(): GenerationHistoryItem[] {
    const createdAt = new Date().toISOString();
    return [
        {
            id: "slot:log-one:slot-one:0",
            logId: "log-one",
            slotId: "slot-one",
            assetIndex: 0,
            kind: "image",
            source: "agent",
            status: "success",
            title: "商品主图",
            originalPrompt: "生成一张白底商品主图",
            optimizedPrompt: optimizedImagePrompt,
            model: "image-pro",
            parameters: { size: "1:1", quality: "high" },
            pointsCost: 2.5,
            conversationId: "conversation-one",
            continueHref: "/create?conversationId=conversation-one",
            asset: { type: "image", url: imageUrl, serverUrl: imageUrl, storageKey: "permanent/one.webp", mimeType: "image/webp", width: 1200, height: 800, bytes: 1024 },
            durationMs: 2000,
            createdAt,
            completedAt: createdAt,
            addedToLibrary: false,
        },
        {
            id: "slot:log-one:slot-two:1",
            logId: "log-one",
            slotId: "slot-two",
            assetIndex: 1,
            kind: "image",
            source: "agent",
            status: "success",
            title: "竖版海报",
            originalPrompt: "生成竖版海报",
            model: "image-pro",
            parameters: { size: "9:16" },
            asset: { type: "image", url: imageUrl, serverUrl: imageUrl, storageKey: "permanent/two.webp", mimeType: "image/webp", width: 720, height: 1280, bytes: 1024 },
            durationMs: 3000,
            createdAt,
            completedAt: createdAt,
            addedToLibrary: false,
        },
        {
            id: "slot:log-video:slot-video:",
            logId: "log-video",
            slotId: "slot-video",
            kind: "video",
            source: "drama",
            status: "failed",
            title: "镜头视频",
            originalPrompt: "人物向前走",
            model: "video-pro",
            parameters: { size: "16:9", seconds: "5" },
            error: "上游生成失败",
            durationMs: 0,
            createdAt,
            completedAt: createdAt,
            addedToLibrary: false,
        },
    ];
}
