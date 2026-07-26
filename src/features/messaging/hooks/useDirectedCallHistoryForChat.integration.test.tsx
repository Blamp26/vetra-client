import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createElement, StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersistentCallProvider } from "@/features/calling/context/PersistentCallContext";
import { MessageList } from "@/features/messaging/components/MessageList/MessageList";
import { useDirectedCallHistoryForChat } from "./useDirectedCallHistoryForChat";
import { getState, useAppStore } from "@/store";
import { DEFAULT_CONV, type ActiveChat, type Message, type User } from "@/shared/types";

const peerPublicId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const currentUserPublicId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const currentUser: User = {
  id: 1,
  public_id: currentUserPublicId,
  username: "viewer",
  display_name: "Viewer",
  bio: null,
  avatar_url: null,
  status: "online",
  last_seen_at: null,
};

function message(id: number, content: string, insertedAt: string): Message {
  return {
    id,
    content,
    sender_id: 2,
    sender_public_id: peerPublicId,
    recipient_id: 1,
    recipient_public_id: currentUserPublicId,
    room_id: null,
    status: "sent",
    inserted_at: insertedAt,
    sender_username: "alice",
    sender_display_name: "Alice",
    media_file_id: null,
    media_mime_type: null,
    reactions: [],
  } as Message;
}

function historyEntry(callId: string, createdAt: string, endedAt: string, durationMs: number) {
  return {
    call_id: callId,
    status: "completed",
    peer: { user_id: peerPublicId, username: "alice" },
    created_at: createdAt,
    ended_at: endedAt,
    duration_ms: durationMs,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makePersistentRuntime(callId: string, state: string = "active", stateVersion = 7) {
  let presentation: any = {
    disposed: false,
    phase: state === "active" ? "active" : "terminal",
    callId,
    participantRole: "initiator",
    peerPublicId,
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
  const listeners = new Set<(next: any) => void>();
  const runtime = {
    presentation: {
      getSnapshot: () => presentation,
      subscribe: (listener: (next: any) => void) => {
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

function IntegrationHarness({ activeChat }: { activeChat: Extract<ActiveChat, { type: "direct" }> }) {
  const conversation = useAppStore((state) =>
    state.conversations[2] ?? DEFAULT_CONV,
  );
  const { entries } = useDirectedCallHistoryForChat(activeChat);

  return (
    <MessageList
      messages={conversation.messages}
      currentUserId={1}
      isLoading={conversation.isLoading}
      initialHistoryLoaded
      hasMore={conversation.hasMore}
      onLoadMore={vi.fn()}
      chatContext={activeChat}
      onReply={vi.fn()}
      directedCallHistoryEntries={entries}
    />
  );
}

function renderIntegration(runtime: ReturnType<typeof makePersistentRuntime>, strict = true) {
  const activeChat = { type: "direct" as const, partnerId: 2 };
  const content = createElement(
    PersistentCallProvider,
    { runtime: runtime.runtime, children: createElement(IntegrationHarness, { activeChat }) },
  );
  return render(strict ? createElement(StrictMode, null, content) : content);
}

function prepareStore(messages: Message[]) {
  const store = getState();
  store.resetDirectedCallHistory();
  store.setActiveChat(null);
  store.setCurrentUser(currentUser);
  store.setPreviews([{ partner_id: 2, partner_public_id: peerPublicId } as any]);
  store.initConversation(2);
  store.setConversationMessages(2, messages);
}

beforeEach(() => {
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
  prepareStore([
    message(1, "BEFORE CALL", "2026-07-26T12:00:00.000Z"),
    message(2, "AFTER CALL", "2026-07-26T12:10:00.000Z"),
  ]);
});

describe("directed call history terminal refresh integration", () => {
  it("updates the mounted real timeline after an ended call without chat switching", async () => {
    const firstCall = "11111111-1111-1111-1111-111111111111";
    const secondCall = "22222222-2222-2222-2222-222222222222";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse([historyEntry(firstCall, "2026-07-26T12:04:00.000Z", "2026-07-26T12:05:00.000Z", 28000)]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          historyEntry(firstCall, "2026-07-26T12:04:00.000Z", "2026-07-26T12:05:00.000Z", 28000),
          historyEntry(secondCall, "2026-07-26T12:06:00.000Z", "2026-07-26T12:07:00.000Z", 3000),
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const runtime = makePersistentRuntime("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001");
    renderIntegration(runtime);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Completed call")).not.toBeInTheDocument();

    act(() => runtime.emit({ canonicalState: "ended", terminalState: "ended", stateVersion: 8 }));
    await waitFor(() => expect(screen.getByText("Completed call")).toBeInTheDocument());

    const row = screen.getByTestId("directed-call-history-row");
    expect(row).toHaveAccessibleName(expect.stringContaining("0:28"));
    const before = screen.getByText("BEFORE CALL");
    const after = screen.getByText("AFTER CALL");
    expect(Boolean(before.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(row.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(getState().directedCallHistoryEntriesByCallId[firstCall]).toBeDefined();
    expect(getState().conversations[2].messages.map(({ id }) => id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => runtime.emit({ callId: null, canonicalState: "idle", terminalState: null, stateVersion: null }));
    act(() => runtime.emit({ callId: secondCall, canonicalState: "active", terminalState: null, stateVersion: 10 }));
    act(() => runtime.emit({ canonicalState: "ended", terminalState: "ended", stateVersion: 11 }));
    await waitFor(() => expect(getState().directedCallHistoryEntriesByCallId[secondCall]).toBeDefined());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getAllByTestId("directed-call-history-row")).toHaveLength(2);
  });

  it("preserves messages and existing history when the terminal refresh fails", async () => {
    const existingCall = "33333333-3333-3333-3333-333333333333";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([historyEntry(existingCall, "2026-07-26T11:00:00.000Z", "2026-07-26T11:01:00.000Z", 1000)]))
      .mockResolvedValueOnce(jsonResponse({ error: "history unavailable" }, 503));
    vi.stubGlobal("fetch", fetchMock);
    const runtime = makePersistentRuntime("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002");
    renderIntegration(runtime);

    await waitFor(() => expect(screen.getByText("Completed call")).toBeInTheDocument());
    const messageIds = getState().conversations[2].messages.map(({ id }) => id);
    act(() => runtime.emit({ canonicalState: "ended", terminalState: "ended", stateVersion: 8 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("BEFORE CALL")).toBeInTheDocument();
    expect(screen.getByText("AFTER CALL")).toBeInTheDocument();
    expect(getState().conversations[2].messages.map(({ id }) => id)).toEqual(messageIds);
    expect(getState().directedCallHistoryEntriesByCallId[existingCall]).toBeDefined();
    expect(getState().directedCallHistoryError).toBe("history unavailable");
    expect(screen.getAllByTestId("directed-call-history-row")).toHaveLength(1);
  });
});
