import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectedCallHistoryEntry } from "@/api/directedCallHistory";
import type { ActiveChat } from "@/shared/types";
import { PersistentCallProvider } from "@/features/calling/context/PersistentCallContext";

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
    resetDirectedCallHistory: vi.fn(),
    disposeDirectedCallHistory: vi.fn(),
    getDirectedCallHistoryEntries: vi.fn(() => entries.map((item) => ({
      ...item,
      peer: item.peer ? { ...item.peer } : null,
    }))),
    messageState: { messages: [{ id: 10 }], cursor: "message-cursor" },
  };
}

function StrictModeWrapper({ children }: { children: ReactNode }) {
  return createElement(StrictMode, null, children);
}

function render(
  activeChat: Parameters<typeof useDirectedCallHistoryForChat>[0],
  state = makeState(),
  strict = false,
) {
  useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
  return {
    ...renderHook(() => useDirectedCallHistoryForChat(activeChat), {
      wrapper: strict ? StrictModeWrapper : undefined,
    }),
    state,
  };
}

function makePersistentRuntime({
  callId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  peerUserId = peerA,
  state = "active",
  stateVersion = 7,
}: {
  callId?: string;
  peerUserId?: string | null;
  state?: string;
  stateVersion?: number;
} = {}) {
  let presentation = {
    disposed: false,
    phase: state === "active" ? "active" : "terminal",
    callId,
    participantRole: "initiator",
    peerPublicId: peerUserId,
    peerUsername: "alice",
    canonicalState: state,
    stateVersion,
    timestamps: null,
    terminalState: state === "active" ? null : state,
    pendingAction: null,
    recoverableError: null,
    statusLabel: "",
    terminalLabel: null,
    callIssue: null,
    canCancel: false,
    canHangup: state === "active",
    mediaControlsAvailable: false,
    incomingModal: {
      visible: false,
      callerDisplayName: "alice",
      isPending: false,
      presentationKey: null,
      onPresented: undefined,
      onAccept: vi.fn(),
      onDecline: vi.fn(),
    },
  };
  const listeners = new Set<(next: typeof presentation) => void>();
  const runtime = {
    presentation: {
      getSnapshot: () => presentation,
      subscribe: (listener: (next: typeof presentation) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    media: {
      getSnapshot: () => ({
        projection: null,
        isMuted: false,
        canToggleMute: false,
        isLocalScreenShareActive: false,
        localScreenShareStream: null,
        remoteScreenShareStream: null,
      }),
      subscribe: () => () => undefined,
    },
  } as any;

  return {
    runtime,
    emit(next: Partial<typeof presentation>) {
      act(() => {
        presentation = { ...presentation, ...next };
        listeners.forEach((listener) => listener(presentation));
      });
    },
  };
}

function renderWithPersistentRuntime(
  activeChat: Parameters<typeof useDirectedCallHistoryForChat>[0],
  state = makeState(),
  persistentRuntime = makePersistentRuntime(),
  strict = false,
) {
  useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
  const Wrapper = ({ children }: { children: ReactNode }) => createElement(
    PersistentCallProvider,
    { runtime: persistentRuntime.runtime, children },
  );
  const StrictWrapper = ({ children }: { children: ReactNode }) => createElement(
    StrictMode,
    null,
    createElement(Wrapper, null, children),
  );
  return {
    ...renderHook(() => useDirectedCallHistoryForChat(activeChat), {
      wrapper: strict ? StrictWrapper : Wrapper,
    }),
    state,
    persistentRuntime,
  };
}

describe("useDirectedCallHistoryForChat", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
  });

  it("refreshes once when entering a valid direct chat", async () => {
    const { state } = render({ type: "direct", partnerId: 2 }, makeState(), true);

    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
  });

  it("does not refresh twice during Strict Mode setup-cleanup-setup replay", async () => {
    const { state } = render({ type: "direct", partnerId: 2 }, makeState(), true);

    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
    expect(state.resetDirectedCallHistory).not.toHaveBeenCalled();
    expect(state.disposeDirectedCallHistory).not.toHaveBeenCalled();
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
      { initialProps: { partnerId: 2 }, wrapper: StrictModeWrapper },
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
      {
        initialProps: { activeChat: { type: "direct", partnerId: 2 } as ActiveChat },
        wrapper: StrictModeWrapper,
      },
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

  it("refreshes again after leaving and returning to the same peer", async () => {
    const state = makeState();
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
    const { rerender } = renderHook(
      ({ activeChat }: { activeChat: ActiveChat }) => useDirectedCallHistoryForChat(activeChat),
      {
        initialProps: { activeChat: { type: "direct", partnerId: 2 } as ActiveChat },
        wrapper: StrictModeWrapper,
      },
    );

    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
    await act(async () => {
      rerender({ activeChat: { type: "room", roomId: 8 } });
    });
    await Promise.resolve();
    rerender({ activeChat: { type: "direct", partnerId: 2 } });

    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(2));
  });

  it("refreshes again after a real unmount and later remount", async () => {
    const state = makeState();
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
    const first = renderHook(
      () => useDirectedCallHistoryForChat({ type: "direct", partnerId: 2 }),
      { wrapper: StrictModeWrapper },
    );
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
    first.unmount();

    renderHook(
      () => useDirectedCallHistoryForChat({ type: "direct", partnerId: 2 }),
      { wrapper: StrictModeWrapper },
    );
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(2));
  });

  it("refreshes when a missing preview becomes valid", async () => {
    const state = makeState();
    delete (state.conversationPreviews as Record<number, unknown>)[2];
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
    const { rerender } = renderHook(
      () => useDirectedCallHistoryForChat({ type: "direct", partnerId: 2 }),
      { wrapper: StrictModeWrapper },
    );

    expect(state.refreshDirectedCallHistory).not.toHaveBeenCalled();
    state.conversationPreviews[2] = { partner_id: 2, partner_public_id: peerA };
    rerender();
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
  });

  it("refreshes once when the matching authoritative call reaches ended", async () => {
    const persistentRuntime = makePersistentRuntime();
    const { state } = renderWithPersistentRuntime({ type: "direct", partnerId: 2 }, makeState(), persistentRuntime);

    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
    persistentRuntime.emit({ canonicalState: "ended", terminalState: "ended", phase: "terminal", stateVersion: 8 });
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(2));
    persistentRuntime.emit({ canonicalState: "ended", terminalState: "ended", phase: "terminal", stateVersion: 8 });
    persistentRuntime.emit({ canonicalState: "ended", terminalState: "ended", phase: "terminal", stateVersion: 9 });
    expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(2);
  });

  it.each([
    "unavailable",
    "undelivered",
    "busy",
    "declined",
    "cancelled",
    "no_answer",
    "connection_failed",
    "ended",
  ])("uses the same terminal refresh for %s", async (terminalState) => {
    const persistentRuntime = makePersistentRuntime();
    const { state } = renderWithPersistentRuntime({ type: "direct", partnerId: 2 }, makeState(), persistentRuntime);

    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
    persistentRuntime.emit({ canonicalState: terminalState, terminalState, phase: "terminal", stateVersion: 8 });
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(2));
  });

  it("refreshes distinct terminal call IDs independently", async () => {
    const persistentRuntime = makePersistentRuntime();
    const { state } = renderWithPersistentRuntime({ type: "direct", partnerId: 2 }, makeState(), persistentRuntime);

    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
    persistentRuntime.emit({ canonicalState: "ended", terminalState: "ended", stateVersion: 8 });
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(2));
    persistentRuntime.emit({
      callId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      canonicalState: "active",
      terminalState: null,
      phase: "active",
      stateVersion: 3,
    });
    persistentRuntime.emit({
      callId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      canonicalState: "ended",
      terminalState: "ended",
      phase: "terminal",
      stateVersion: 4,
    });
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(3));
  });

  it("does not refresh for nonterminal, unrelated, invalid, self, group, or absent chats", async () => {
    const cases: Array<{ chat: Parameters<typeof useDirectedCallHistoryForChat>[0]; peerUserId?: string | null }> = [
      { chat: { type: "direct", partnerId: 2 }, peerUserId: peerB },
      { chat: { type: "direct", partnerId: 1 } },
      { chat: { type: "direct", partnerId: 99 } },
      { chat: { type: "room", roomId: 8 } },
      { chat: null },
    ];

    for (const testCase of cases) {
      const persistentRuntime = makePersistentRuntime({ peerUserId: testCase.peerUserId });
      const { state } = renderWithPersistentRuntime(testCase.chat, makeState(), persistentRuntime);
      state.refreshDirectedCallHistory.mockClear();
      persistentRuntime.emit({ canonicalState: "connecting", terminalState: null, phase: "connecting", stateVersion: 7 });
      persistentRuntime.emit({ canonicalState: "ended", terminalState: "ended", phase: "terminal", stateVersion: 8 });
      await Promise.resolve();
      expect(state.refreshDirectedCallHistory).not.toHaveBeenCalled();
    }
  });

  it("does not post-refresh when entering after the terminal transition; activation refresh remains responsible", async () => {
    const persistentRuntime = makePersistentRuntime();
    const state = makeState();
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
    const Wrapper = ({ children }: { children: ReactNode }) => createElement(
      PersistentCallProvider,
      { runtime: persistentRuntime.runtime, children },
    );
    const { rerender } = renderHook(
      ({ activeChat }: { activeChat: ActiveChat | null }) => useDirectedCallHistoryForChat(activeChat),
      { initialProps: { activeChat: null as ActiveChat | null }, wrapper: Wrapper },
    );

    persistentRuntime.emit({ canonicalState: "ended", terminalState: "ended", phase: "terminal", stateVersion: 8 });
    await Promise.resolve();
    rerender({ activeChat: { type: "direct", partnerId: 2 } });
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
  });

  it("keeps terminal refresh deduplicated under Strict Mode, rerenders, and cleanup", async () => {
    const persistentRuntime = makePersistentRuntime();
    const { result, unmount, state } = renderWithPersistentRuntime(
      { type: "direct", partnerId: 2 },
      makeState(),
      persistentRuntime,
      true,
    );

    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(1));
    persistentRuntime.emit({ canonicalState: "ended", terminalState: "ended", phase: "terminal", stateVersion: 8 });
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(2));
    act(() => result.current);
    persistentRuntime.emit({ canonicalState: "ended", terminalState: "ended", phase: "terminal", stateVersion: 8 });
    unmount();
    expect(state.refreshDirectedCallHistory).toHaveBeenCalledTimes(2);
  });

  it("leaves message state unchanged when the terminal history refresh fails", async () => {
    const persistentRuntime = makePersistentRuntime();
    const state = makeState();
    state.refreshDirectedCallHistory.mockRejectedValue(new Error("history failed"));
    const { persistentRuntime: mountedRuntime } = renderWithPersistentRuntime(
      { type: "direct", partnerId: 2 },
      state,
      persistentRuntime,
    );

    mountedRuntime.emit({ canonicalState: "ended", terminalState: "ended", phase: "terminal", stateVersion: 8 });
    await waitFor(() => expect(state.refreshDirectedCallHistory).toHaveBeenCalled());
    expect(state.messageState).toEqual({ messages: [{ id: 10 }], cursor: "message-cursor" });
  });
});
