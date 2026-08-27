import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LazyMediaVideo } from "./lazy-media-video";

describe("LazyMediaVideo", () => {
    it("does not emit a media source before it approaches the viewport", () => {
        const markup = renderToStaticMarkup(<LazyMediaVideo src="/media/video.mp4" muted playsInline preload="metadata" />);

        expect(markup).not.toContain("/media/video.mp4");
        expect(markup).toContain('preload="none"');
    });
});
