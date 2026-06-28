import { describe, expect, it, vi } from "vitest";
import { createChannelsSlice } from "./channelsSlice";

describe("createChannelsSlice", () => {
  it("resetChannelUnread is idempotent when a channel has no unread entry", () => {
    let state = { channelUnread: {} as Record<number, number> };

    const set = vi.fn((updater: any) => {
      state =
        typeof updater === "function"
          ? { ...state, ...updater(state) }
          : { ...state, ...updater };
    });

    const slice = createChannelsSlice(
      set as any,
      () => state as any,
      {} as any,
    );
    slice.resetChannelUnread(42);

    expect(set).toHaveBeenCalledTimes(1);
    expect(state.channelUnread).toEqual({});
  });
});
