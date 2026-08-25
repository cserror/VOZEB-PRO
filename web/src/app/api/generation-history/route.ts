import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import {
    addGenerationHistoryResultToLibrary,
    deleteGenerationHistoryResultsForUser,
    GenerationHistoryServiceError,
    listGenerationHistoryForUser,
} from "@/lib/server/generation-history-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const params = new URL(request.url).searchParams;
    const page = await listGenerationHistoryForUser(user.id, {
        page: params.get("page"),
        pageSize: params.get("pageSize"),
        kind: params.get("kind"),
        status: params.get("status"),
        keyword: params.get("keyword"),
        start: params.get("start"),
        end: params.get("end"),
    });
    return NextResponse.json({ code: 0, data: page, msg: "OK" });
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const parsed = await readJsonBodyResult<{ action?: unknown; resultId?: unknown }>(request);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
    if (parsed.data.action !== "add-to-library") return NextResponse.json({ code: 400, data: null, msg: "不支持的生成记录操作" }, { status: 400 });
    const resultId = typeof parsed.data.resultId === "string" ? parsed.data.resultId.trim() : "";
    if (!resultId) return NextResponse.json({ code: 400, data: null, msg: "请选择生成结果" }, { status: 400 });
    try {
        const asset = await addGenerationHistoryResultToLibrary(user.id, resultId);
        return NextResponse.json({ code: 0, data: { asset }, msg: "已添加到素材" });
    } catch (error) {
        return serviceError(error);
    }
}

export async function DELETE(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const parsed = await readJsonBodyResult<{ resultIds?: unknown }>(request);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
    const resultIds = Array.isArray(parsed.data.resultIds) ? parsed.data.resultIds.filter((item): item is string => typeof item === "string") : [];
    try {
        const result = await deleteGenerationHistoryResultsForUser(user.id, resultIds);
        return NextResponse.json({ code: 0, data: result, msg: result.deleted ? "已删除" : "没有可删除的记录" });
    } catch (error) {
        return serviceError(error);
    }
}

function unauthorized() {
    return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
}

function serviceError(error: unknown) {
    if (error instanceof GenerationHistoryServiceError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
    throw error;
}
