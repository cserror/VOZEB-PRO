import { mergeAttributes } from "@tiptap/react";
import { describe, expect, it } from "vitest";

describe("Tiptap attribute security", () => {
    it("does not turn an own __proto__ key into inherited DOM event attributes", () => {
        const untrusted = JSON.parse('{"__proto__":{"onerror":"fixture-only"},"class":"script"}');

        const attributes = mergeAttributes(untrusted);

        expect(attributes.onerror).toBeUndefined();
        expect(attributes.class).toBe("script");
    });

    it("preserves normal formatting and link attributes when merging", () => {
        const attributes = mergeAttributes({ class: "script", href: "https://example.com", rel: "noopener noreferrer" }, { class: "selected", target: "_blank" });

        expect(attributes).toEqual({ class: "script selected", href: "https://example.com", rel: "noopener noreferrer", target: "_blank" });
    });
});
