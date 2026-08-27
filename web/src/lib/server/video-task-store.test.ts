import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createStoredGenerationTask: vi.fn() }));

vi.mock("@/lib/server/generation-task-store", () => ({
    createStoredGenerationTask: mocks.createStoredGenerationTask,
}));

import { createVideoTask } from "./video-task-store";

describe("video task store", () => {
    it("passes managed frame identities to the media reference write guard", async () => {
        mocks.createStoredGenerationTask.mockImplementation(async (_type, task) => task);

        await createVideoTask(
            {
                userId: "user-one",
                config: { apiSource: "system", baseUrl: "/api/ai/system/channel", apiKey: "system", apiFormat: "openai", model: "video", channelId: "channel" },
                upstream: { id: "", provider: "generation", model: "video" },
            },
            {
                referenceStorageKeys: ["permanent/2026/08/27/images/first.png", "permanent/2026/08/27/images/last.png"],
            },
        );

        expect(mocks.createStoredGenerationTask).toHaveBeenCalledWith(
            "video",
            expect.objectContaining({ referenceStorageKeys: ["permanent/2026/08/27/images/first.png", "permanent/2026/08/27/images/last.png"] }),
            expect.any(Number),
            { referenceStorageKeys: ["permanent/2026/08/27/images/first.png", "permanent/2026/08/27/images/last.png"] },
        );
    });
});
