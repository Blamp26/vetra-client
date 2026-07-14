import { beforeEach, describe, expect, it, vi } from "vitest";
import { giphyApi } from "./giphy";

describe("giphyApi", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "test-key");
    vi.restoreAllMocks();
  });

  it("normalizes search results and uses the messaging bundle", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "abc_123", title: "wave", images: { fixed_width_small: { mp4: "https://media.giphy.com/a.mp4", webp: "https://media.giphy.com/a.webp", url: "https://media.giphy.com/a.gif", width: "88", height: "64" }, original: { mp4: "https://media.giphy.com/original.mp4", webp: "https://media.giphy.com/original.webp", width: "480", height: "350" } }, analytics: { onload: "https://giphy-analytics.giphy.com/onload" } }], pagination: { count: 1, total_count: 1 }, meta: { response_id: "response" } }), { status: 200 }));
    const result = await giphyApi.search("fun cats");
    expect(result.results[0]).toMatchObject({ provider: "giphy", providerId: "abc_123", messageMp4Url: "https://media.giphy.com/original.mp4", previewMp4Url: "https://media.giphy.com/a.mp4" });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("bundle=messaging_non_clips");
    expect(url).toContain("q=fun+cats");
  });

  it("does not request without an API key", async () => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(giphyApi.search("cats")).rejects.toMatchObject({ kind: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
