import { create } from "zustand";
import { describe, expect, it } from "vitest";
import { createBroadcastChannelsSlice, type BroadcastChannelsSlice } from "./broadcastChannelsSlice";

describe("broadcast channel store", () => {
  it("stores normalized subscribed summaries under immutable public IDs", () => {
    const store = create<BroadcastChannelsSlice>()(createBroadcastChannelsSlice);
    const channel = {
      public_id: "a14e6268-ad65-452e-8cdf-80cb691458ac",
      display_name: "TestBroadcast",
      description: null,
      avatar_url: null,
      visibility: "public" as const,
    };

    store.getState().setBroadcastSubscriptions([channel]);

    expect(store.getState().broadcastChannels).toEqual({ [channel.public_id]: channel });
    expect(store.getState().broadcastSubscriptions).toEqual({
      [channel.public_id]: { status: "active", muted: false },
    });
  });
});
