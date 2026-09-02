import { describe, expect, it } from "vitest";

import { readVideoProviderId } from "./video-provider-response";

describe("video provider response", () => {
    it("uses the configured task ID field instead of a top-level request trace ID", () => {
        const payload = {
            code: "Success",
            data: { task_id: "task-671ce5ca", status: "completed" },
            request_id: "request-0782accb",
        };

        expect(readVideoProviderId(payload, "data.task_id")).toBe("task-671ce5ca");
    });

    it("keeps automatic task ID discovery for existing channels", () => {
        expect(readVideoProviderId({ id: "legacy-task" })).toBe("legacy-task");
    });
});
