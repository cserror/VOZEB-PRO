"use client";

import { FolderPlus, RotateCcw, Search } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { App, Button, Input, Pagination, Segmented, Select, Spin } from "antd";
import { useRouter, useSearchParams } from "next/navigation";

import { MyPromptsPage } from "@/components/my-prompts/my-prompts-page";
import { PromptCard } from "@/components/prompts/prompt-card";
import { CompactEmptyState } from "@/components/compact-empty-state";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { usePromptPage } from "@/components/prompts/use-prompt-list";
import { useCopyText } from "@/hooks/use-copy-text";
import { useAssetStore } from "@/stores/use-asset-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

const PAGE_SIZE = 16;
type PromptView = "library" | "mine";

const PROMPT_VIEW_OPTIONS: Array<{ label: string; value: PromptView }> = [
    { label: "提示词库", value: "library" },
    { label: "我的提示词", value: "mine" },
];

export default function PromptsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const view: PromptView = searchParams.get("view") === "mine" ? "mine" : "library";
    const [visitedViews, setVisitedViews] = useState<Record<PromptView, boolean>>(() => ({ library: view === "library", mine: view === "mine" }));

    useEffect(() => {
        setVisitedViews((current) => (current[view] ? current : { ...current, [view]: true }));
    }, [view]);

    const switchView = (value: string | number) => {
        const nextView: PromptView = value === "mine" ? "mine" : "library";
        setVisitedViews((current) => (current[nextView] ? current : { ...current, [nextView]: true }));
        router.replace(nextView === "mine" ? "/prompts?view=mine" : "/prompts", { scroll: false });
    };

    return (
        <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
            <div className="shrink-0 border-b border-border bg-background px-3 pb-3 pt-3 sm:px-6 sm:pb-4 sm:pt-6">
                <div className="mx-auto max-w-7xl">
                    <h1 className="text-xl font-semibold text-stone-950 sm:text-2xl dark:text-stone-100">{view === "library" ? "提示词库" : "我的提示词"}</h1>
                    <p className="mt-1.5 text-xs leading-5 text-stone-500 sm:mt-2 sm:text-sm dark:text-stone-400">
                        {view === "library" ? "浏览公共提示词，复制使用或保存到我的素材。" : "管理自己保存的提示词，随时编辑、复制或加入素材。"}
                    </p>
                    <Segmented
                        aria-label="提示词视图"
                        className="mt-3 w-full sm:mt-4 sm:w-fit [&_.ant-segmented-item-label]:!min-w-28 [&_.ant-segmented-item-label]:!px-4"
                        size="large"
                        block
                        value={view}
                        options={PROMPT_VIEW_OPTIONS}
                        onChange={switchView}
                    />
                </div>
            </div>
            <div className="min-h-0 flex-1">
                {visitedViews.library || view === "library" ? (
                    <section className={view === "library" ? "h-full overflow-y-auto" : "hidden"} aria-hidden={view !== "library"}>
                        <PromptLibraryPage />
                    </section>
                ) : null}
                {visitedViews.mine || view === "mine" ? (
                    <section className={view === "mine" ? "h-full overflow-y-auto" : "hidden"} aria-hidden={view !== "mine"}>
                        <MyPromptsPage />
                    </section>
                ) : null}
            </div>
        </main>
    );
}

function PromptLibraryPage() {
    const { message } = App.useApp();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTag, setSelectedTag] = useState(ALL_PROMPTS_OPTION);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [page, setPage] = useState(1);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const [selectedPromptPreviewUrl, setSelectedPromptPreviewUrl] = useState("");
    const listStartRef = useRef<HTMLDivElement | null>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const deferredKeyword = useDeferredValue(titleKeyword.trim());
    const {
        query,
        items: promptItems,
        tags: promptTags,
        categories: promptCategoryOptions,
        total: totalPrompts,
    } = usePromptPage({
        keyword: deferredKeyword,
        tag: selectedTag,
        category: selectedCategory,
        page,
        pageSize: PAGE_SIZE,
    });
    const hasFilters = Boolean(titleKeyword.trim()) || selectedTag !== ALL_PROMPTS_OPTION || selectedCategory !== ALL_PROMPTS_OPTION;

    useEffect(() => {
        if (query.isError) {
            message.error(query.error instanceof Error ? query.error.message : "获取提示词失败");
        }
    }, [message, query.error, query.isError]);

    const updateCategory = (value: string) => {
        setSelectedCategory(value);
        setPage(1);
    };

    const updateTag = (value: string) => {
        setSelectedTag(value);
        setPage(1);
    };

    const clearFilters = () => {
        setTitleKeyword("");
        setSelectedCategory(ALL_PROMPTS_OPTION);
        setSelectedTag(ALL_PROMPTS_OPTION);
        setPage(1);
    };

    const changePage = (value: number) => {
        setPage(value);
        requestAnimationFrame(() => listStartRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    };

    const savePromptAsset = async (item: Prompt) => {
        try {
            await addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl || "" } });
            message.success("已加入我的素材");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材保存失败");
        }
    };

    return (
        <div className="bg-background px-3 py-3 text-stone-800 sm:px-6 sm:py-5 dark:text-stone-100">
            <div className="mx-auto max-w-7xl">
                <section className="rounded-xl border border-border bg-card p-2 sm:p-3.5">
                    <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-[minmax(240px,1fr)_160px_180px_auto] sm:items-center sm:gap-2">
                        <div className="col-span-2 min-w-0 sm:col-span-1">
                            <Input
                                allowClear
                                className="!h-9 w-full"
                                prefix={<Search className="size-4 text-stone-400" />}
                                value={titleKeyword}
                                placeholder="搜索标题或提示词"
                                onChange={(event) => {
                                    setTitleKeyword(event.target.value);
                                    setPage(1);
                                }}
                            />
                        </div>
                        <div className="min-w-0">
                            <Select aria-label="提示词分类" className="w-full" value={selectedCategory} options={promptCategoryOptions.map((category) => ({ label: category, value: category }))} onChange={updateCategory} />
                        </div>
                        <div className="min-w-0">
                            <Select showSearch aria-label="提示词标签" className="w-full" optionFilterProp="label" value={selectedTag} options={promptTags.map((tag) => ({ label: tag, value: tag }))} onChange={updateTag} />
                        </div>
                        <div className="col-span-2 flex min-h-8 items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">共 {totalPrompts} 条</span>
                            <Button aria-label="清除提示词筛选" icon={<RotateCcw className="size-3.5" />} disabled={!hasFilters} onClick={clearFilters}>
                                清除
                            </Button>
                        </div>
                    </div>
                </section>

                <div ref={listStartRef} className="scroll-mt-4 pt-3 sm:pt-5">
                    {query.isLoading ? (
                        <div className="flex h-32 items-center justify-center">
                            <Spin />
                        </div>
                    ) : null}
                    {!query.isLoading ? (
                        <div className="grid gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
                            {promptItems.map((item) => (
                                <PromptCard
                                    key={item.id}
                                    item={item}
                                    onOpen={(previewUrl) => {
                                        setSelectedPrompt(item);
                                        setSelectedPromptPreviewUrl(previewUrl || "");
                                    }}
                                    onCopy={() => copyText(item.prompt, "提示词已复制")}
                                    extraAction={
                                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>
                                            加入我的素材
                                        </Button>
                                    }
                                />
                            ))}
                        </div>
                    ) : null}
                    {!query.isLoading && promptItems.length === 0 ? <CompactEmptyState title="没有找到匹配的提示词" description="尝试清除搜索词，或切换分类和标签。" /> : null}
                    {totalPrompts > PAGE_SIZE ? (
                        <div className="flex justify-center py-5 sm:py-8">
                            <Pagination current={page} pageSize={PAGE_SIZE} total={totalPrompts} showSizeChanger={false} showLessItems responsive onChange={changePage} />
                        </div>
                    ) : null}
                </div>
            </div>

            <PromptDetailDialog
                prompt={selectedPrompt}
                previewUrl={selectedPromptPreviewUrl}
                onClose={() => {
                    setSelectedPrompt(null);
                    setSelectedPromptPreviewUrl("");
                }}
                onCopy={(prompt) => copyText(prompt, "提示词已复制")}
                onSaveAsset={savePromptAsset}
            />
        </div>
    );
}
