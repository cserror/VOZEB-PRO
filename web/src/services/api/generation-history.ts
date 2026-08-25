import { GENERATION_HISTORY_PAGE_SIZE, type GenerationHistoryKind, type GenerationHistoryPage, type GenerationHistoryStatus } from "@/lib/generation-history-contract";
import type { Asset } from "@/lib/library-asset-contract";

export function listGenerationHistory(
    input: { page: number; kind?: GenerationHistoryKind; status?: GenerationHistoryStatus; keyword?: string; start?: Date; end?: Date },
    signal?: AbortSignal,
) {
    const query = new URLSearchParams({ page: String(input.page), pageSize: String(GENERATION_HISTORY_PAGE_SIZE) });
    if (input.kind) query.set("kind", input.kind);
    if (input.status) query.set("status", input.status);
    if (input.keyword?.trim()) query.set("keyword", input.keyword.trim());
    if (input.start) query.set("start", input.start.toISOString());
    if (input.end) query.set("end", input.end.toISOString());
    return request<GenerationHistoryPage>(`/api/generation-history?${query}`, { cache: "no-store", signal });
}

export function addGenerationHistoryResultToLibrary(resultId: string) {
    return request<{ asset: Asset }>("/api/generation-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-to-library", resultId }),
    }).then((data) => data.asset);
}

export function deleteGenerationHistoryResults(resultIds: string[]) {
    return request<{ deleted: number }>("/api/generation-history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultIds }),
    });
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: T; msg?: string };
    if (!response.ok || payload.code !== 0 || payload.data === undefined) throw new Error(payload.msg || "生成记录请求失败");
    return payload.data;
}
