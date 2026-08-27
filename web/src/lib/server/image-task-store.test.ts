import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createStoredGenerationTask: vi.fn() }));

vi.mock("@/lib/server/generation-task-store", () => ({
    createStoredGenerationTask: mocks.createStoredGenerationTask,
}));

import { createImageTask } from "./image-task-store";

describe("image task store", () => {
    it("passes only managed reference storage keys into the task write guard", async () => {
        mocks.createStoredGenerationTask.mockImplementation(async (_type, task) => task);

        await createImageTask({
            userId: "user-one",
            username: "tester",
            displayName: "Tester",
            kind: "edit",
            source: "image-workbench",
            config: { baseUrl: "https://image.example.com", apiKey: "secret", apiFormat: "openai", model: "image" },
            prompt: "edit",
            references: [
                { dataUrl: "", serverUrl: "/api/reference-assets/permanent/2026/08/27/images/source.png" },
                { dataUrl: "https://provider.example.com/source.png", remoteUrl: "https://provider.example.com/source.png" },
            ],
            mask: { dataUrl: "", serverUrl: "/api/reference-assets/permanent/2026/08/27/images/mask.png" },
        });

        expect(mocks.createStoredGenerationTask).toHaveBeenCalledWith(
            "image",
            expect.any(Object),
            expect.any(Number),
            { referenceStorageKeys: ["permanent/2026/08/27/images/source.png", "permanent/2026/08/27/images/mask.png"] },
        );
    });
});
