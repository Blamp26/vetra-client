import { describe, expect, it, vi } from "vitest";
import { createUISlice } from "./uiSlice";

describe("createUISlice", () => {
  it("starts with a conversations rail and bounded empty memories", () => {
    let state: any = {};
    const set = vi.fn((updater: any) => {
      state = {
        ...state,
        ...(typeof updater === "function" ? updater(state) : updater),
      };
    });
    state = createUISlice(set as any, () => state, {} as any);

    expect(state.railContext).toEqual({ type: "conversations" });
    expect(state.lastConversationChat).toBeNull();
    expect(state.lastServerContext).toBeNull();
    expect(state.lastChannelIdByServer).toEqual({});
  });

  it("synchronizes active chats and restores valid selection memory", () => {
    let state: any = {
      servers: { 7: { id: 7, name: "Seven", public_id: "seven" } },
      serverChannels: {
        7: [{ id: 70, public_id: "general", name: "general" }],
      },
      conversationPreviews: { 2: { partner_id: 2 } },
      roomPreviews: {},
    };
    const set = vi.fn((updater: any) => {
      state = {
        ...state,
        ...(typeof updater === "function" ? updater(state) : updater),
      };
    });
    Object.assign(
      state,
      createUISlice(set as any, () => state, {} as any),
    );

    state.setActiveChat({ type: "direct", partnerId: 2 });
    expect(state.railContext).toEqual({ type: "conversations" });
    state.setActiveChat({ type: "channel", serverId: 7, channelId: 70 });
    expect(state.railContext).toEqual({ type: "server", serverId: 7 });
    expect(state.lastChannelIdByServer[7]).toBe(70);
    state.selectConversations();
    expect(state.activeChat).toEqual({ type: "direct", partnerId: 2 });
    state.selectServer(7);
    expect(state.activeChat.type).toBe("channel");
  });

  it("clears invalid channel memory and falls back to the server", () => {
    let state: any = {
      railContext: { type: "server", serverId: 7 },
      activeChat: { type: "channel", serverId: 7, channelId: 70 },
      servers: { 7: { id: 7 } },
      serverChannels: { 7: [] },
      lastChannelIdByServer: { 7: 70 },
    };
    const set = vi.fn((updater: any) => {
      state = {
        ...state,
        ...(typeof updater === "function" ? updater(state) : updater),
      };
    });
    const slice = createUISlice(set as any, () => state, {} as any);
    slice.setActiveChat(null);
    expect(state.activeChat).toEqual({ type: "server", serverId: 7 });
    expect(state.lastChannelIdByServer).toEqual({});
  });

  it("ignores stale reaction revisions while accepting duplicate-safe updates", () => {
    let state: any = { messageReactions: {}, messageReactionVersions: {} };
    const set = vi.fn((updater: any) => {
      const next = typeof updater === "function" ? updater(state) : updater;
      state = { ...state, ...next };
    });
    const slice = createUISlice(set as any, () => state, {} as any);

    slice.setMessageReactions(
      9,
      [{ reaction: "👍", count: 2, chosen: true }],
      "2026-07-13T00:00:02Z",
    );
    slice.setMessageReactions(
      9,
      [{ reaction: "👍", count: 1, chosen: false }],
      "2026-07-13T00:00:01Z",
    );
    slice.setMessageReactions(
      9,
      [{ reaction: "👍", count: 2, chosen: true }],
      "2026-07-13T00:00:02Z",
    );

    expect(state.messageReactions[9]).toEqual([
      { reaction: "👍", count: 2, chosen: true },
    ]);
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
