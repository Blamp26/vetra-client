import { describe, expect, it, vi } from "vitest";
import { createUISlice } from "./uiSlice";

describe("createUISlice", () => {
  it("setActiveChat is idempotent for the already active server", () => {
    let state = {
      activeChat: { type: "server" as const, serverId: 5, serverRef: "srv-5" },
      activeModal: null,
      messageReactions: {},
      theme: "light",
    };

    const set = vi.fn((updater: any) => {
      state =
        typeof updater === "function"
          ? { ...state, ...updater(state) }
          : { ...state, ...updater };
    });

    const slice = createUISlice(set as any, () => state as any, {} as any);
    slice.setActiveChat({ type: "server", serverId: 5, serverRef: "srv-5" });

    expect(set).toHaveBeenCalledTimes(1);
    expect(state.activeChat).toEqual({
      type: "server",
      serverId: 5,
      serverRef: "srv-5",
    });
  });

  it("setActiveChat is idempotent for the already active channel", () => {
    let state = {
      activeChat: {
        type: "channel" as const,
        serverId: 5,
        channelId: 9,
        serverRef: "srv-5",
        channelRef: "chn-9",
      },
      activeModal: null,
      messageReactions: {},
      theme: "light",
    };

    const set = vi.fn((updater: any) => {
      state =
        typeof updater === "function"
          ? { ...state, ...updater(state) }
          : { ...state, ...updater };
    });

    const slice = createUISlice(set as any, () => state as any, {} as any);
    slice.setActiveChat({
      type: "channel",
      serverId: 5,
      channelId: 9,
      serverRef: "srv-5",
      channelRef: "chn-9",
    });

    expect(set).toHaveBeenCalledTimes(1);
    expect(state.activeChat).toEqual({
      type: "channel",
      serverId: 5,
      channelId: 9,
      serverRef: "srv-5",
      channelRef: "chn-9",
    });
  });
});
