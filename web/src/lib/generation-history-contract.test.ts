import { describe, expect, it } from "vitest";

import { generationHistoryResultId, parseGenerationHistoryResultId } from "./generation-history-contract";

describe("generation history result identity", () => {
    it("round-trips slot, legacy asset, and log identities without exposing ambiguous separators", () => {
        const slot = { logId: "log:one / 二", slotId: "slot:1/output", assetIndex: 2 };
        const asset = { logId: "legacy:one", assetIndex: 3 };
        const log = { logId: "failed:one" };

        expect(parseGenerationHistoryResultId(generationHistoryResultId(slot))).toEqual(slot);
        expect(parseGenerationHistoryResultId(generationHistoryResultId(asset))).toEqual(asset);
        expect(parseGenerationHistoryResultId(generationHistoryResultId(log))).toEqual(log);
    });

    it("rejects malformed result identities", () => {
        expect(parseGenerationHistoryResultId("slot:broken")).toBeNull();
        expect(parseGenerationHistoryResultId("asset:log:not-a-number")).toBeNull();
        expect(parseGenerationHistoryResultId("unknown:log")).toBeNull();
    });
});
