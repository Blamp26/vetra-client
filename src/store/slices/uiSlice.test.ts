import { describe, expect, it, vi } from "vitest";
import { createUISlice } from "./uiSlice";

describe("createUISlice", () => {
  it("uses one group surface state for profile and both settings origins", () => {
    let state: any = { groupSurface: null };
    const set = vi.fn((updater: any) => {
      const next = typeof updater === "function" ? updater(state) : updater;
      state = { ...state, ...next };
    });
    const slice = createUISlice(set as any, () => state, {} as any);

    slice.openGroupProfile(7);
    expect(state.groupSurface).toEqual({ roomId: 7, view: "profile" });
    slice.openGroupSettings(7, { settingsOrigin: "profile" });
    expect(state.groupSurface).toEqual({
      roomId: 7,
      view: "settings",
      settingsOrigin: "profile",
    });
    slice.backToGroupProfile();
    expect(state.groupSurface).toEqual({
      roomId: 7,
      view: "profile",
      settingsOrigin: undefined,
    });

    slice.openGroupSettings(7);
    expect(state.groupSurface.settingsOrigin).toBe("sidebar");
    slice.backToGroupProfile();
    expect(state.groupSurface.view).toBe("settings");
    slice.closeGroupSurface();
    expect(state.groupSurface).toBeNull();
  });

  it("ignores stale reaction revisions while accepting duplicate-safe updates", () => {
    let state: any = { messageReactions: {}, messageReactionVersions: {} };
    const set = vi.fn((updater: any) => {
      const next = typeof updater === "function" ? updater(state) : updater;
      state = { ...state, ...next };
    });
    const slice = createUISlice(set as any, () => state, {} as any);

    slice.setMessageReactions(9, [{ reaction: "👍", count: 2, chosen: true }], "2026-07-13T00:00:02Z");
    slice.setMessageReactions(9, [{ reaction: "👍", count: 1, chosen: false }], "2026-07-13T00:00:01Z");
    slice.setMessageReactions(9, [{ reaction: "👍", count: 2, chosen: true }], "2026-07-13T00:00:02Z");

    expect(state.messageReactions[9]).toEqual([{ reaction: "👍", count: 2, chosen: true }]);
  });

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

  it("setActiveChat is idempotent for the same server with numeric/public ref variants", () => {
    let state = {
      activeChat: { type: "server" as const, serverId: 5, serverRef: 5 },
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
      serverRef: 5,
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

  it("setActiveChat is idempotent for the same channel with numeric/public ref variants", () => {
    let state = {
      activeChat: {
        type: "channel" as const,
        serverId: 5,
        channelId: 9,
        serverRef: 5,
        channelRef: 9,
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
      serverRef: 5,
      channelRef: 9,
    });
  });
});
