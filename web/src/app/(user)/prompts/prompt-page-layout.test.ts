import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("prompt center layout", () => {
    it("keeps the large view switch in the page body and switches only the content below it", async () => {
        const page = await readFile(resolve(process.cwd(), "src/app/(user)/prompts/page.tsx"), "utf8");

        expect(page).toContain('<main className="flex h-full');
        expect(page).toContain('view === "library" ? "提示词库" : "我的提示词"');
        expect(page).toContain('size="large"');
        expect(page).toContain('aria-label="提示词视图"');
        expect(page).toContain('view === "library" ? "h-full overflow-y-auto" : "hidden"');
        expect(page).toContain('view === "mine" ? "h-full overflow-y-auto" : "hidden"');
        expect(page).not.toContain("<header");
        expect(page).not.toContain("headerAction");
    });

    it("keeps personal prompt management inside the lower content view", async () => {
        const personal = await readFile(resolve(process.cwd(), "src/components/my-prompts/my-prompts-page.tsx"), "utf8");

        expect(personal).toContain('placeholder="搜索我的提示词"');
        expect(personal).toContain('aria-label="我的提示词分类"');
        expect(personal).toContain("编辑提示词");
        expect(personal).not.toContain("headerAction");
        expect(personal).not.toContain(">我的提示词</h1>");
    });
});
