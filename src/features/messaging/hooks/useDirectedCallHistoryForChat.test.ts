import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectedCallHistoryEntry } from "@/api/directedCallHistory";
import type { ActiveChat } from "@/shared/types";

const { useAppStoreMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));

import { useDirectedCallHistoryForChat } from "./useDirectedCallHistoryForChat";

const peerA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const peerB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const currentUserId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function entry(call_id: string, peer: string | null): DirectedCallHistoryEntry {
  return {
    call_id,
    status: "completed",
    peer: peer ? { user_id: peer, username: peer === peerA ? "alice" : "bob" } : null,
    created_at: "2026-07-26T12:00:00.000Z",
    ended_at: null,
    duration_ms: null,
  };
}

function makeState() {
  const entries = [entry("11111111-1111-1111-1111-111111111111", peerB), entry("22222222-2222-2222-2222-222222222222", peerA), entry("33333333-3333-3333-3333-333333333333", null)];
  return {
    currentUser: { id: 1, public_id: currentUserId },
    conversationPreviews: {
      2: { partner_id: 2, partner_public_id: peerA },
      3: { partner_id: 3, partner_public_id: peerB },
    },
    refreshDirectedCallHistory: vi.fn().mockResolvedValue(undefined),
    getDirectedCallHistoryEntries: vi.fn(() => entries.map((item) => ({
      ...item,
      peer: item.peer ? { ...item.peer } : null,
    }))),
    messageState: { messages: [{ id: 10 }], cursor: "message-cursor" },
  };
}

function render(activeChat: Parameters<typeof useDirectedCallHistoryForChat>[0], state = makeState()) {
  useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
  return { ...renderHook(() => useDirectedCallHistoryForChat(activeChat)), state };
}

describe("useDirectedCallHistoryForChat", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
  });

  it("refreshes once when entering a valid direct chat", async () => {
    const { state } = render({ type: "direct", partnerId: 2 });

    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
  });

  it("does not refresh again when the same direct chat rerenders", async () => {
    const { result, state } = render({ type: "direct", partnerId: 2 });
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));

    act(() => result.current);
    expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1);
  });

  it("switches to the new canonical peer context", async () => {
    const state = makeState();
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
    const { rerender } = renderHook(
      ({ partnerId }) => useDirectedCallHistoryForChat({ type: "direct", partnerId }),
      { initialProps: { partnerId: 2 } },
    );

    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
    rerender({ partnerId: 3 });
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(2));
  });

  it.each([
    { type: "room", roomId: 8 },
    { type: "server", serverId: 8 },
    { type: "channel", serverId: 8, channelId: 9 },
    { type: "settings" },
  ] as const)("does not refresh for non-direct conversation %#", (activeChat) => {
    const { state } = render(activeChat);
    expect(state.refreshDirectedCallHistory).not.toHaveBeenCalled();
  });

  it.each([
    { type: "direct", partnerId: 99 },
    { type: "direct", partnerId: 1 },
  ] as const)("does not refresh for invalid or self direct peer %#", (activeChat) => {
    const { state } = render(activeChat);
    expect(state.refreshDirectedCallHistory).not.toHaveBeenCalled();
  });

  it("exposes no peer-specific entries after leaving direct chat", async () => {
    const state = makeState();
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
    const { result, rerender } = renderHook(
      ({ activeChat }: { activeChat: ActiveChat }) => useDirectedCallHistoryForChat(activeChat),
      { initialProps: { activeChat: { type: "direct", partnerId: 2 } as ActiveChat } },
    );

    expect(result.current.entries).toEqual([entry("22222222-2222-2222-2222-222222222222", peerA)]);
    rerender({ activeChat: { type: "room", roomId: 8 } });
    expect(result.current.peerUserId).toBeNull();
    expect(result.current.entries).toEqual([]);
  });

  it("preserves order, filters other and null peers, and does not duplicate", () => {
    const { result, state } = render({ type: "direct", partnerId: 2 });
    expect(result.current.entries.map((item) => item.call_id)).toEqual([
      "22222222-2222-2222-2222-222222222222",
    ]);
    expect(state.getDirectedCallHistoryEntries).toHaveBeenCalled();
  });

  it("returns entries and peers isolated from store state", () => {
    const { result, state } = render({ type: "direct", partnerId: 2 });
    result.current.entries[0].status = "missed";
    result.current.entries[0].peer!.username = "changed";

    expect(state.getDirectedCallHistoryEntries().find((item) => item.peer?.user_id === peerA)).toEqual(
      entry("22222222-2222-2222-2222-222222222222", peerA),
    );
  });

  it("does not touch message state or message requests when history fails", async () => {
    const state = makeState();
    state.refreshDirectedCallHistory.mockRejectedValue(new Error("history failed"));
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    renderHook(() => useDirectedCallHistoryForChat({ type: "direct", partnerId: 2 }));
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
    expect(state.messageState).toEqual({ messages: [{ id: 10 }], cursor: "message-cursor" });
  });

  it("does not refresh when unrelated message state changes", async () => {
    const state = makeState();
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
    const { rerender } = renderHook(() => useDirectedCallHistoryForChat({ type: "direct", partnerId: 2 }));
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));

    state.messageState = { messages: [{ id: 11 }], cursor: "next-message-cursor" };
    rerender();
    expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1);
  });
});
