import { generationModelId } from "@/lib/server/generation-channel";
import { normalizeServerAssetUrl } from "@/lib/server/generation-log-repository";
import { recordGenerationTaskLogResult } from "@/lib/server/generation-log-task-service";
import type { ImageTask } from "@/lib/server/image-task-store";

import { resolveResultSize } from "./image-task-size";

export function stableMediaUrl(value?: string) {
    return value && !value.startsWith("data:") && !value.startsWith("blob:") ? value : "";
}

type ImageGenerationLogResult = { dataUrl?: string; remoteUrl?: string; serverUrl?: string; width?: number; height?: number; bytes?: number; mimeType?: string };

export async function writeImageGenerationLog(task: ImageTask, status: "success" | "failed", result: ImageGenerationLogResult[] | ImageGenerationLogResult | string, durationMs: number, error?: string) {
    const results = Array.isArray(result) ? result : [result];
    const targetSize = task.config.outputMode === "layers" ? undefined : resolveResultSize(task.config.quality, task.config.size || "auto");
    const assets = results.flatMap((item) => {
        const serverUrl = typeof item === "string" ? "" : normalizeServerAssetUrl(item.serverUrl || item.dataUrl);
        const resultUrl = typeof item === "string" ? item : serverUrl || item.remoteUrl || item.dataUrl || "";
        return resultUrl
            ? [
                  {
                      type: "image" as const,
                      url: resultUrl,
                      serverUrl: serverUrl || undefined,
                      remoteUrl: typeof item === "string" ? undefined : item.remoteUrl,
                      ...(typeof item === "string"
                          ? {}
                          : {
                                width: item.width,
                                height: item.height,
                                bytes: item.bytes,
                                mimeType: item.mimeType,
                            }),
                      ...(targetSize ? { targetSize } : {}),
                  },
              ]
            : [];
    });
    return recordGenerationTaskLogResult({
        logId: task.generationLogId,
        slotId: task.generationSlotId,
        clientRequestId: task.clientRequestId,
        taskId: task.id,
        userId: task.userId,
        username: task.username,
        displayName: task.displayName,
        kind: "image",
        source: task.source || "image-workbench",
        status,
        title: task.title || task.prompt.slice(0, 36) || "图片生成",
        prompt: task.prompt,
        model: generationModelId(task.config),
        summary: status === "success" ? (task.kind === "edit" ? "图生图调用完成" : "文生图调用完成") : "图片生成失败",
        durationMs,
        assets,
        error,
        canRetry: status === "failed" && task.retryable === true,
        taskKind: task.kind,
        createdAt: task.createdAt,
    });
}
