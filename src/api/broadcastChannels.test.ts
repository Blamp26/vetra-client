import { describe, expect, it, vi } from "vitest";
import { broadcastChannelsApi } from "./broadcastChannels";

vi.mock("@/api/base", () => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

import { get, post, put } from "@/api/base";

describe("broadcast channel API contracts", () => {
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
