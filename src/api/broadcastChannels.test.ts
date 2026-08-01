import { describe, expect, it, vi } from "vitest";
import { broadcastChannelsApi } from "./broadcastChannels";

vi.mock("@/api/base", () => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

import { get, post, put } from "@/api/base";

describe("broadcast channel API contracts", () => {
  it("requests a profile by immutable public ID", async () => {
    vi.mocked(get).mockResolvedValueOnce({ public_id: "a14e6268-ad65-452e-8cdf-80cb691458ac" });
    await broadcastChannelsApi.get("a14e6268-ad65-452e-8cdf-80cb691458ac");
    expect(get).toHaveBeenCalledWith("/broadcast-channels/a14e6268-ad65-452e-8cdf-80cb691458ac");
  });

  it("normalizes subscribed summary identifiers to public_id", async () => {
    vi.mocked(get).mockResolvedValueOnce([
      {
        channel_public_id: "a14e6268-ad65-452e-8cdf-80cb691458ac",
        display_name: "TestBroadcast",
        description: null,
        avatar_url: null,
        visibility: "public",
      },
    ]);

    await expect(broadcastChannelsApi.subscribed()).resolves.toEqual([
      {
        public_id: "a14e6268-ad65-452e-8cdf-80cb691458ac",
        display_name: "TestBroadcast",
        description: null,
        avatar_url: null,
        visibility: "public",
      },
    ]);
  });

  it("preserves full profiles that already use public_id", async () => {
    const profile = {
      public_id: "a14e6268-ad65-452e-8cdf-80cb691458ac",
      display_name: "TestBroadcast",
      description: null,
      avatar_url: null,
      visibility: "public" as const,
      status: "active" as const,
      subscriber_count: 1,
    };
    vi.mocked(get).mockResolvedValueOnce(profile);

    await expect(broadcastChannelsApi.get(profile.public_id)).resolves.toEqual(profile);
  });

  it("types pinned publications as an envelope", async () => {
    const page = {
      channel: { public_id: "a14e6268-ad65-452e-8cdf-80cb691458ac" },
      publications: [],
      next_cursor: null,
    };
    vi.mocked(get).mockResolvedValueOnce(page);

    await expect(broadcastChannelsApi.pinned("a14e6268-ad65-452e-8cdf-80cb691458ac")).resolves.toEqual(page);
    expect(get).toHaveBeenCalledWith("/broadcast-channels/a14e6268-ad65-452e-8cdf-80cb691458ac/publications/pinned");
  });

  it("uses immutable identifiers for audit and settings", async () => {
    vi.mocked(get).mockResolvedValueOnce({ events: [], next_cursor: null });
    await broadcastChannelsApi.audit("channel-public", "opaque-cursor");
    expect(get).toHaveBeenCalledWith("/broadcast-channels/channel-public/audit?cursor=opaque-cursor");
    vi.mocked(put).mockResolvedValueOnce({ public_id: "channel-public" });
    await broadcastChannelsApi.settings("channel-public", { visibility: "private" });
    expect(put).toHaveBeenCalledWith("/broadcast-channels/channel-public/settings", { visibility: "private" });
  });

  it("forwards only source and destination identifiers", async () => {
    vi.mocked(post).mockResolvedValueOnce({ ok: true });
    await broadcastChannelsApi.forward("channel-public", "publication-public", "group", "group-public");
    expect(post).toHaveBeenCalledWith("/broadcast-channels/channel-public/publications/publication-public/forward", { destination_type: "group", destination_public_id: "group-public" });
    expect(JSON.stringify(vi.mocked(post).mock.calls[0][1])).not.toMatch(/snapshot|content|author|media/);
  });
});
