import { saveAs } from "file-saver";

import { agentMediaDownloadName, type AgentMediaDownload } from "@/components/agent/agent-media-download";
import { browserReadableMediaUrl } from "@/lib/browser-media-url";
import { GENERATION_HISTORY_ZIP_LIMIT_BYTES, type GenerationHistoryItem } from "@/lib/generation-history-contract";
import { originalImageDownloadUrl, originalMediaDownloadUrl } from "@/lib/media-image-url";
import { createZip } from "@/lib/zip";

export async function downloadGenerationHistoryZip(items: GenerationHistoryItem[], signal?: AbortSignal) {
    const downloadable = items.filter((item): item is GenerationHistoryItem & { asset: NonNullable<GenerationHistoryItem["asset"]> } => item.status === "success" && Boolean(item.asset?.url));
    if (!downloadable.length) throw new Error("所选记录中没有可下载的结果");
    let totalBytes = 0;
    const files = async function* () {
        for (const [index, item] of downloadable.entries()) {
            const source = item.kind === "image" ? originalImageDownloadUrl(item.asset.url) : originalMediaDownloadUrl(item.asset.url);
            const response = await fetch(browserReadableMediaUrl(source), { signal });
            if (!response.ok) throw new Error(`下载“${item.title}”失败`);
            const blob = await response.blob();
            totalBytes += blob.size;
            if (totalBytes > GENERATION_HISTORY_ZIP_LIMIT_BYTES) throw new Error("所选文件超过 256 MiB，请减少选择后重试");
            const media: AgentMediaDownload = { type: item.kind, url: item.asset.url, title: item.title, mimeType: item.asset.mimeType };
            yield { name: agentMediaDownloadName(media.type, `${media.title}-${index + 1}`, media.url, media.mimeType), data: blob };
        }
    };
    const zip = await createZip(files(), signal);
    saveAs(zip, `生成记录-${dateToken(new Date())}.zip`);
    return { files: downloadable.length, bytes: totalBytes };
}

function dateToken(value: Date) {
    const parts = [value.getFullYear(), value.getMonth() + 1, value.getDate()].map((part) => String(part).padStart(2, "0"));
    return parts.join("");
}
