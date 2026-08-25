import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock("@/lib/server/generation-log-task-service", () => ({ recordGenerationTaskLogResult: mocks.record }));

import { emptyAdvancedConfig } from "@/lib/channel-protocol-registry";
import { writeVideoGenerationLog } from "./video-task-log";
import type { VideoTask } from "./video-task-store";

describe("writeVideoGenerationLog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.record.mockResolvedValue({});
    });

    it("passes public Agent context and video parameters to the shared log", async () => {
        await writeVideoGenerationLog(videoTask(), "success");

        expect(mocks.record.mock.calls[0][0]).toMatchObject({
            conversationId: "conversation-one",
            runId: "run-one",
            userPrompt: "让画面自然动起来",
            parameters: { size: "16:9", quality: "1080", resolution: "1080", seconds: "8", generateAudio: "true", watermark: "false" },
        });
    });
});

function videoTask(): VideoTask {
    return {
        id: "video-one",
        userId: "user-one",
        username: "user",
        displayName: "User",
        status: "success",
        createdAt: 1,
        updatedAt: 2,
        conversationId: "conversation-one",
        runId: "run-one",
        userPrompt: "让画面自然动起来",
        source: "agent",
        prompt: "不得公开的内部视频执行提示词",
        config: {
            apiSource: "system",
            baseUrl: "/api/ai/system/video-channel",
            apiKey: "system",
            apiFormat: "openai",
            model: "video-model",
            advancedConfig: { ...emptyAdvancedConfig(), protocol: "openai" },
        },
        upstream: { id: "upstream-one", provider: "generation", model: "video-model" },
        requestedDurationSeconds: 8,
        generationLogParameters: { size: "16:9", quality: "1080", resolution: "1080", seconds: "8", generateAudio: "true", watermark: "false" },
        result: { url: "/api/generation-log-assets/video.mp4", mimeType: "video/mp4" },
    };
}
