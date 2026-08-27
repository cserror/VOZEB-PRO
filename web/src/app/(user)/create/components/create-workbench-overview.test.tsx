import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ overview: vi.fn() }));

vi.mock("../use-create-workbench-overview", () => ({ useCreateWorkbenchOverview: mocks.overview }));
vi.mock("@/components/agent/agent-media-preview", () => ({
    AgentMediaPreview: ({ url }: { url: string }) => <div data-testid="agent-media-preview" data-url={url} />,
}));
vi.mock("@/components/media/lazy-media-video", () => ({
    LazyMediaVideo: ({ src }: { src: string }) => <div data-testid="lazy-media-video" data-src={src} />,
}));

import { CreateWorkbenchOverview } from "./create-workbench-overview";

describe("create workbench overview media delivery", () => {
    beforeEach(() => {
        mocks.overview.mockReset().mockReturnValue({
            latestProject: undefined,
            runningTasks: [],
            recentAssets: [
                {
                    id: "video-one",
                    kind: "video",
                    title: "生成视频",
                    storageKey: "permanent/video.mp4",
                    displayUrl: "https://img.paisi.art/paisi-art/videos/generation/permanent/video.mp4",
                    createdAt: "2026-08-27T00:00:00.000Z",
                },
            ],
            loading: false,
            error: "",
            reload: vi.fn(),
        });
    });

    it("passes the managed CDN display url directly to the video preview", () => {
        const markup = renderToStaticMarkup(<CreateWorkbenchOverview onUseAsset={vi.fn()} />);

        expect(markup).toContain('data-url="https://img.paisi.art/paisi-art/videos/generation/permanent/video.mp4"');
        expect(markup).not.toContain("/api/media-proxy");
    });
});
