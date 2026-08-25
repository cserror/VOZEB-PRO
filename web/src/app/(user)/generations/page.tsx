"use client";

import type { Dayjs } from "dayjs";
import { App, Button, Checkbox, DatePicker, Descriptions, Input, Modal, Pagination, Segmented, Select, Spin, Tag, Tooltip } from "antd";
import { Download, History, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { downloadAgentMedia } from "@/components/agent/agent-media-download";
import { CompactEmptyState } from "@/components/compact-empty-state";
import { ResponsiveMasonryGrid } from "@/components/works/responsive-masonry-grid";
import { useCopyText } from "@/hooks/use-copy-text";
import { GENERATION_HISTORY_PAGE_SIZE, type GenerationHistoryItem, type GenerationHistoryKind, type GenerationHistoryStatus } from "@/lib/generation-history-contract";
import { addGenerationHistoryResultToLibrary, deleteGenerationHistoryResults, listGenerationHistory } from "@/services/api/generation-history";

import { GenerationHistoryCard } from "./generation-history-card";
import { downloadGenerationHistoryZip } from "./generation-history-download";

const { RangePicker } = DatePicker;
const masonryClassName = "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6";

export default function GenerationsPage() {
    const { message, modal } = App.useApp();
    const router = useRouter();
    const copyText = useCopyText();
    const requestIdRef = useRef(0);
    const listStartRef = useRef<HTMLDivElement>(null);
    const [items, setItems] = useState<GenerationHistoryItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [kind, setKind] = useState<GenerationHistoryKind | "all">("all");
    const [status, setStatus] = useState<GenerationHistoryStatus | "all">("all");
    const [keyword, setKeyword] = useState("");
    const [debouncedKeyword, setDebouncedKeyword] = useState("");
    const [dates, setDates] = useState<[Dayjs | null, Dayjs | null] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyAction, setBusyAction] = useState<{ id: string; action: "library" | "delete" }>();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchBusy, setBatchBusy] = useState(false);
    const [detailItem, setDetailItem] = useState<GenerationHistoryItem>();

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedKeyword(keyword.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [keyword]);

    const load = useCallback(async (signal?: AbortSignal) => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError("");
        try {
            const result = await listGenerationHistory(
                {
                    page,
                    kind: kind === "all" ? undefined : kind,
                    status: status === "all" ? undefined : status,
                    keyword: debouncedKeyword || undefined,
                    start: dates?.[0]?.startOf("day").toDate(),
                    end: dates?.[1]?.endOf("day").toDate(),
                },
                signal,
            );
            if (requestId !== requestIdRef.current) return;
            setItems(result.items);
            setTotal(result.total);
            setSelectedIds([]);
        } catch (loadError) {
            if (signal?.aborted || requestId !== requestIdRef.current) return;
            setItems([]);
            setTotal(0);
            setError(loadError instanceof Error ? loadError.message : "生成记录加载失败");
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [dates, debouncedKeyword, kind, page, status]);

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
    const selectableIds = useMemo(() => items.map((item) => item.id), [items]);
    const allSelected = Boolean(selectableIds.length) && selectableIds.every((id) => selectedIds.includes(id));
    const groups = useMemo(() => groupByDate(items), [items]);

    const updateFilter = (update: () => void) => {
        update();
        setPage(1);
    };

    const addToLibrary = async (item: GenerationHistoryItem) => {
        setBusyAction({ id: item.id, action: "library" });
        try {
            await addGenerationHistoryResultToLibrary(item.id);
            setItems((current) => current.map((candidate) => (candidate.id === item.id ? { ...candidate, addedToLibrary: true } : candidate)));
            message.success("已添加到素材");
        } catch (actionError) {
            message.error(actionError instanceof Error ? actionError.message : "添加素材失败");
        } finally {
            setBusyAction(undefined);
        }
    };

    const removeItems = (targets: GenerationHistoryItem[]) => {
        if (!targets.length) return;
        modal.confirm({
            title: targets.length === 1 ? "删除这条生成记录？" : `删除选中的 ${targets.length} 条生成记录？`,
            content: "只移除所选生成结果；已经加入素材、Canvas 或短剧项目的媒体引用不会被删除。此操作无法撤销。",
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                setBatchBusy(targets.length > 1);
                if (targets.length === 1) setBusyAction({ id: targets[0].id, action: "delete" });
                try {
                    await deleteGenerationHistoryResults(targets.map((item) => item.id));
                    message.success(`已删除 ${targets.length} 条生成记录`);
                    const remaining = Math.max(0, total - targets.length);
                    const lastPage = Math.max(1, Math.ceil(remaining / GENERATION_HISTORY_PAGE_SIZE));
                    if (page > lastPage) setPage(lastPage);
                    else await load();
                } catch (actionError) {
                    message.error(actionError instanceof Error ? actionError.message : "删除生成记录失败");
                    throw actionError;
                } finally {
                    setBusyAction(undefined);
                    setBatchBusy(false);
                }
            },
        });
    };

    const batchDownload = async () => {
        setBatchBusy(true);
        try {
            const result = await downloadGenerationHistoryZip(selectedItems);
            message.success(`已打包 ${result.files} 个文件`);
        } catch (downloadError) {
            message.error(downloadError instanceof Error ? downloadError.message : "批量下载失败");
        } finally {
            setBatchBusy(false);
        }
    };

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground">
            <div className="mx-auto w-full max-w-[1800px] px-3 py-3 sm:px-6 sm:py-6">
                <header className="border-b border-border pb-3 sm:pb-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="text-xl font-semibold sm:text-2xl">生成记录</h1>
                            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">自动收录图片和视频生成结果，共 {total} 条</p>
                        </div>
                        <Tooltip title="刷新生成记录">
                            <Button type="text" shape="circle" icon={<RefreshCw className="size-4" />} loading={loading} aria-label="刷新生成记录" onClick={() => void load()} />
                        </Tooltip>
                    </div>
                </header>

                <section className="grid min-w-0 gap-2 border-b border-border py-3 lg:grid-cols-[auto_minmax(220px,1fr)_140px_260px] lg:items-center">
                    <div className="hidden lg:block">
                        <Segmented
                            value={kind}
                            options={[
                                { label: "全部", value: "all" },
                                { label: "图片", value: "image" },
                                { label: "视频", value: "video" },
                            ]}
                            onChange={(value) => updateFilter(() => setKind(value as typeof kind))}
                        />
                    </div>
                    <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 lg:contents">
                        <div className="lg:hidden">
                            <Select
                                className="w-full"
                                value={kind}
                                options={[
                                    { label: "全部", value: "all" },
                                    { label: "图片", value: "image" },
                                    { label: "视频", value: "video" },
                                ]}
                                onChange={(value) => updateFilter(() => setKind(value))}
                            />
                        </div>
                        <Input
                            allowClear
                            prefix={<Search className="size-4 text-muted-foreground" />}
                            placeholder="搜索原提示词或标题"
                            value={keyword}
                            onChange={(event) => updateFilter(() => setKeyword(event.target.value))}
                        />
                    </div>
                    <Select
                        value={status}
                        options={[
                            { label: "全部状态", value: "all" },
                            { label: "已完成", value: "success" },
                            { label: "生成中", value: "pending" },
                            { label: "失败", value: "failed" },
                        ]}
                        onChange={(value) => updateFilter(() => setStatus(value))}
                    />
                    <RangePicker
                        className="w-full"
                        value={dates}
                        allowEmpty={[true, true]}
                        placeholder={["开始日期", "结束日期"]}
                        onChange={(value) => updateFilter(() => setDates(value as typeof dates))}
                    />
                </section>

                <div ref={listStartRef} className="scroll-mt-3">
                    {selectedIds.length ? (
                        <section className="sticky top-0 z-20 mt-2 flex min-w-0 items-center justify-between gap-2 border-y border-border bg-background/95 px-2 py-2 backdrop-blur sm:mt-3 sm:px-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <Checkbox
                                    checked={allSelected}
                                    indeterminate={!allSelected && selectedIds.length > 0}
                                    onChange={(event) => setSelectedIds(event.target.checked ? selectableIds : [])}
                                >
                                    <span className="text-xs sm:text-sm">已选 {selectedIds.length} 条</span>
                                </Checkbox>
                                <Button type="text" size="small" icon={<X className="size-3.5" />} onClick={() => setSelectedIds([])}>
                                    清除
                                </Button>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <Button size="small" icon={<Download className="size-3.5" />} loading={batchBusy} onClick={() => void batchDownload()}>
                                    批量下载
                                </Button>
                                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={selectedItems.some((item) => item.status === "pending")} onClick={() => removeItems(selectedItems)}>
                                    批量删除
                                </Button>
                            </div>
                        </section>
                    ) : null}

                    {error ? (
                        <section className="mt-4 flex min-h-44 flex-col items-center justify-center gap-3 border-y border-rose-200 text-center dark:border-rose-900/70">
                            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
                            <Button icon={<RefreshCw className="size-4" />} onClick={() => void load()}>
                                重新加载
                            </Button>
                        </section>
                    ) : loading && !items.length ? (
                        <section className="grid min-h-56 place-items-center">
                            <Spin />
                        </section>
                    ) : !items.length ? (
                        <CompactEmptyState className="mt-4 min-h-56" icon={<History className="size-4" />} title="没有找到生成记录" description="完成图片或视频生成后，结果会自动出现在这里。" />
                    ) : (
                        <div className="space-y-5 py-4 sm:space-y-7 sm:py-5">
                            {groups.map((group) => (
                                <section key={group.key} aria-labelledby={`generation-date-${group.key}`}>
                                    <div className="mb-2 flex items-center gap-2 sm:mb-3">
                                        <h2 id={`generation-date-${group.key}`} className="text-sm font-semibold">
                                            {group.label}
                                        </h2>
                                        <span className="text-xs text-muted-foreground">{group.items.length} 条</span>
                                    </div>
                                    <ResponsiveMasonryGrid className={masonryClassName} ariaLabel={`${group.label}的生成结果`}>
                                        {group.items.map((item) => (
                                            <GenerationHistoryCard
                                                key={item.id}
                                                item={item}
                                                selected={selectedIds.includes(item.id)}
                                                busyAction={busyAction?.id === item.id ? busyAction.action : undefined}
                                                onSelect={(checked) => setSelectedIds((current) => (checked ? [...current.filter((id) => id !== item.id), item.id] : current.filter((id) => id !== item.id)))}
                                                onCopy={() => copyText(item.optimizedPrompt || item.originalPrompt, "提示词已复制")}
                                                onContinue={() => item.continueHref && router.push(item.continueHref)}
                                                onDownload={() => item.asset && downloadAgentMedia([{ type: item.kind, url: item.asset.url, title: item.title, mimeType: item.asset.mimeType }])}
                                                onDetails={() => setDetailItem(item)}
                                                onAddToLibrary={() => void addToLibrary(item)}
                                                onDelete={() => removeItems([item])}
                                            />
                                        ))}
                                    </ResponsiveMasonryGrid>
                                </section>
                            ))}
                        </div>
                    )}
                </div>

                {total > GENERATION_HISTORY_PAGE_SIZE ? (
                    <Pagination
                        className="pb-6 pt-2"
                        current={page}
                        pageSize={GENERATION_HISTORY_PAGE_SIZE}
                        total={total}
                        showSizeChanger={false}
                        showLessItems
                        responsive
                        onChange={(value) => {
                            setPage(value);
                            requestAnimationFrame(() => listStartRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
                        }}
                    />
                ) : null}
            </div>

            <GenerationDetails item={detailItem} onClose={() => setDetailItem(undefined)} />
        </main>
    );
}

function GenerationDetails({ item, onClose }: { item?: GenerationHistoryItem; onClose: () => void }) {
    const parameters = item ? Object.entries(item.parameters) : [];
    return (
        <Modal
            title="生成详情"
            open={Boolean(item)}
            footer={null}
            centered
            width="min(680px, calc(100vw - 24px))"
            styles={{ body: { maxHeight: "calc(100dvh - 112px)", overflowY: "auto" } }}
            onCancel={onClose}
            destroyOnHidden
        >
            {item ? (
                <Descriptions column={1} size="small" bordered styles={{ label: { whiteSpace: "nowrap", verticalAlign: "top" }, content: { minWidth: 0 } }}>
                    <Descriptions.Item label="原提示词">
                        <div className="max-h-16 overflow-y-auto whitespace-pre-wrap break-words pr-1" role="region" aria-label="原提示词完整内容" tabIndex={0}>
                            {item.originalPrompt || "未记录"}
                        </div>
                    </Descriptions.Item>
                    {item.optimizedPrompt ? (
                        <Descriptions.Item label="优化提示词">
                            <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words pr-1 sm:max-h-36" role="region" aria-label="优化提示词完整内容" tabIndex={0}>
                                {item.optimizedPrompt}
                            </div>
                        </Descriptions.Item>
                    ) : null}
                    <Descriptions.Item label="模型">{item.model || "未记录"}</Descriptions.Item>
                    {parameters.length ? (
                        <Descriptions.Item label="参数">
                            <div className="flex flex-wrap gap-1">
                                {parameters.map(([key, value]) => <Tag key={key}>{key}: {value}</Tag>)}
                            </div>
                        </Descriptions.Item>
                    ) : null}
                    <Descriptions.Item label="积分">{item.pointsCost === undefined ? "未记录" : `${item.pointsCost} 积分`}</Descriptions.Item>
                    <Descriptions.Item label="生成时间">{formatDateTime(item.completedAt || item.createdAt)}</Descriptions.Item>
                    <Descriptions.Item label={`${item.kind === "video" ? "视频" : "图片"}任务耗时`}>{item.durationMs > 0 ? `${(item.durationMs / 1000).toFixed(1)} 秒` : "未记录"}</Descriptions.Item>
                    <Descriptions.Item label="来源">{sourceLabel(item.source)}</Descriptions.Item>
                    {item.error ? <Descriptions.Item label="失败原因"><span className="break-words text-rose-600 dark:text-rose-300">{item.error}</span></Descriptions.Item> : null}
                </Descriptions>
            ) : null}
        </Modal>
    );
}

function groupByDate(items: GenerationHistoryItem[]) {
    const groups = new Map<string, GenerationHistoryItem[]>();
    for (const item of items) {
        const date = new Date(item.createdAt);
        const key = Number.isFinite(date.getTime()) ? [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, "0")).join("-") : "unknown";
        groups.set(key, [...(groups.get(key) || []), item]);
    }
    return Array.from(groups, ([key, values]) => ({ key, label: dateGroupLabel(key), items: values }));
}

function dateGroupLabel(key: string) {
    if (key === "unknown") return "时间未知";
    const today = new Date();
    const todayKey = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
    if (key === todayKey) return "今天";
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const yesterdayKey = [yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
    if (key === yesterdayKey) return "昨天";
    return new Date(`${key}T00:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(value: string) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "未记录";
}

function sourceLabel(source: GenerationHistoryItem["source"]) {
    return source === "agent" ? "Agent" : source === "canvas" ? "Canvas" : source === "drama" ? "短剧" : source === "image-workbench" ? "图片工作台" : source === "video-workbench" ? "视频工作台" : "其他入口";
}
