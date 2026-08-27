"use client";

import { Button, Checkbox, Tooltip } from "antd";
import { Check, Copy, Download, FolderPlus, Image as ImageIcon, Info, Pencil, Trash2, Video } from "lucide-react";

import { AgentMediaPreview } from "@/components/agent/agent-media-preview";
import type { GenerationHistoryItem } from "@/lib/generation-history-contract";
import { cn } from "@/lib/utils";

export function GenerationHistoryCard({
    item,
    selected,
    busyAction,
    onSelect,
    onCopy,
    onContinue,
    onDownload,
    onDetails,
    onAddToLibrary,
    onDelete,
}: {
    item: GenerationHistoryItem;
    selected: boolean;
    busyAction?: "library" | "delete";
    onSelect: (selected: boolean) => void;
    onCopy: () => void;
    onContinue: () => void;
    onDownload: () => void;
    onDetails: () => void;
    onAddToLibrary: () => void;
    onDelete: () => void;
}) {
    const prompt = item.optimizedPrompt || item.originalPrompt;
    const assetUrl = item.asset?.displayUrl || "";
    const aspectRatio = item.asset?.width && item.asset?.height ? `${item.asset.width} / ${item.asset.height}` : item.kind === "video" ? "16 / 9" : "4 / 3";
    const busy = Boolean(busyAction);
    return (
        <article className={cn("group min-w-0 overflow-hidden rounded-lg border bg-card text-card-foreground transition", selected ? "border-primary ring-1 ring-primary/25" : "border-border hover:border-foreground/20 hover:shadow-sm")}>
            <div className="relative min-h-28 overflow-hidden bg-muted" style={{ aspectRatio }}>
                {assetUrl ? (
                    <AgentMediaPreview type={item.kind} url={assetUrl} thumbnailUrl={item.asset?.thumbnailUrl} previewUrl={assetUrl} title={item.title} className="size-full" defer />
                ) : (
                    <div className="grid size-full min-h-32 place-items-center text-muted-foreground">{item.kind === "video" ? <Video className="size-7" /> : <ImageIcon className="size-7" />}</div>
                )}
                <div className="absolute left-2 top-2 z-10" onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={selected} aria-label={`选择${item.title}`} onChange={(event) => onSelect(event.target.checked)} />
                </div>
            </div>

            <div className="min-w-0 p-2.5">
                <h2 className="truncate text-sm font-medium" title={item.title}>
                    {item.title || (item.kind === "video" ? "生成视频" : "生成图片")}
                </h2>
                <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="min-w-0 truncate" title={item.model || "未记录模型"}>
                        {item.model || "未记录模型"}
                    </span>
                    <time className="shrink-0">{formatTime(item.createdAt)}</time>
                </div>
                <div role="toolbar" aria-label="结果操作" className="mt-2 grid grid-cols-3 gap-0.5 border-t border-border pt-2 sm:grid-cols-6">
                    <Tooltip title={item.continueHref ? "继续修改" : "未关联原对话"}>
                        <Button type="text" size="small" className="!h-8 !w-full !p-0" icon={<Pencil className="size-3.5" />} disabled={busy || !item.continueHref} aria-label="继续修改" onClick={onContinue} />
                    </Tooltip>
                    <Tooltip title={prompt ? "复制提示词" : "暂无可复制提示词"}>
                        <Button type="text" size="small" className="!h-8 !w-full !p-0" icon={<Copy className="size-3.5" />} disabled={busy || !prompt} aria-label="复制提示词" onClick={onCopy} />
                    </Tooltip>
                    <Tooltip title={assetUrl ? "下载" : "暂无可下载结果"}>
                        <Button type="text" size="small" className="!h-8 !w-full !p-0" icon={<Download className="size-3.5" />} disabled={busy || !assetUrl} aria-label="下载生成结果" onClick={onDownload} />
                    </Tooltip>
                    <Tooltip title="查看详情">
                        <Button type="text" size="small" className="!h-8 !w-full !p-0" icon={<Info className="size-3.5" />} disabled={busy} aria-label="查看详情" onClick={onDetails} />
                    </Tooltip>
                    <Tooltip title={item.addedToLibrary ? "已添加到素材" : "添加到素材"}>
                        <Button
                            type="text"
                            size="small"
                            className="!h-8 !w-full !p-0"
                            icon={item.addedToLibrary ? <Check className="size-3.5" /> : <FolderPlus className="size-3.5" />}
                            loading={busyAction === "library"}
                            disabled={busy || item.addedToLibrary || item.status !== "success" || !item.asset?.storageKey}
                            aria-label={item.addedToLibrary ? "已添加到素材" : "添加到素材"}
                            onClick={onAddToLibrary}
                        />
                    </Tooltip>
                    <Tooltip title={item.status === "pending" ? "生成中暂不能删除" : "删除"}>
                        <Button
                            type="text"
                            size="small"
                            danger
                            className="!h-8 !w-full !p-0"
                            icon={<Trash2 className="size-3.5" />}
                            loading={busyAction === "delete"}
                            disabled={busy || item.status === "pending"}
                            aria-label="删除生成记录"
                            onClick={onDelete}
                        />
                    </Tooltip>
                </div>
            </div>
        </article>
    );
}

function formatTime(value: string) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "时间未知";
}
