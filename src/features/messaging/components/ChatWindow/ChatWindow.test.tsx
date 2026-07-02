import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, useAppStoreMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

vi.mock("@/api/auth", () => ({
  authApi: {
    getUser,
  },
}));

vi.mock("@/features/messaging/hooks/useUnifiedMessages", () => ({
  useUnifiedMessages: () => ({
    messages: [
      {
        id: 100,
        content: "message visible during active call",
        user_id: 2,
        username: "alice",
        inserted_at: "2026-07-01T00:00:00Z",
      },
    ],
    isLoading: false,
    hasMore: false,
    loadMore: vi.fn(),
    sendMessage: vi.fn(),
  }),
}));

vi.mock("../MessageList/MessageList", () => ({
  MessageList: ({ messages }: { messages: Array<{ content?: string | null }> }) => (
    <div data-testid="message-list">
      {messages.map((message, index) => (
        <div key={index}>{message.content}</div>
      ))}
    </div>
  ),
}));

vi.mock("../MessageInput/MessageInput", () => ({
  MessageInput: () => (
    <textarea data-testid="message-input" aria-label="Message composer" />
  ),
}));

vi.mock("../MessageSearch/MessageSearch", () => ({
  MessageSearch: () => <div data-testid="message-search" />,
}));

import { ChatWindow } from "./ChatWindow";
import type { UseCallReturn } from "@/features/calling/hooks/useCall.types";

function makeState() {
  return {
    currentUser: { id: 1, username: "me", display_name: "Me" },
    socketManager: null,
    onlineUserIds: new Set<number>(),
    userStatuses: {} as Record<number, "online" | "away" | "dnd" | "offline">,
    lastSeenAt: {} as Record<number, string>,
    typingPartnerIds: new Set<number>(),
    roomPreviews: {},
    conversationPreviews: {},
    typingRoomMemberIds: new Set<number>(),
    typingRoomMemberInfo: {},
  };
}

function makeCall(overrides: Partial<UseCallReturn> = {}): UseCallReturn {
  return {
    status: "idle",
    remoteUserId: null,
    remoteUsername: null,
    callId: null,
    isMuted: false,
    isScreenSharing: false,
    isScreenShareUpdating: false,
    isRemoteScreenLoading: false,
    remoteStream: null,
    remoteScreenStream: null,
    localScreenStream: null,
    seconds: 0,
    diagnostics: {
      connectionState: "unknown",
      iceConnectionState: "unknown",
      iceGatheringState: "unknown",
      signalingState: "unknown",
      selectedLocalCandidateType: "unknown",
    },
    callIssue: null,
    isIncomingActionPending: false,
    startCall: vi.fn(),
    startScreenShare: vi.fn(),
    stopScreenShare: vi.fn(),
    acceptCall: vi.fn(),
    rejectCall: vi.fn(),
    hangUp: vi.fn(),
    toggleMute: vi.fn(),
    ...overrides,
  };
}

describe("ChatWindow presence rendering", () => {
  beforeEach(() => {
    getUser.mockReset();
    useAppStoreMock.mockReset();
  });

  it("shows a gray offline dot when the header says last seen", async () => {
    const state = makeState();
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );
    getUser.mockResolvedValue({
      id: 2,
      username: "alice",
      display_name: "Alice",
      bio: null,
      avatar_url: null,
      status: "online",
      last_seen_at: "2026-06-27T09:15:00Z",
    });

    const { container } = render(
      <ChatWindow
        activeChat={{ type: "direct", partnerId: 2 }}
        call={makeCall()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/last seen on|last seen at/i),
      ).toBeInTheDocument();
    });

    expect(container.querySelector(".bg-offline")).toBeTruthy();
    expect(container.querySelector(".bg-online")).toBeFalsy();
  });

  it("still shows a green dot for an online user", async () => {
    const state = makeState();
    state.onlineUserIds = new Set<number>([2]);
    state.userStatuses = { 2: "online" };

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );
    getUser.mockResolvedValue({
      id: 2,
      username: "alice",
      display_name: "Alice",
      bio: null,
      avatar_url: null,
      status: "online",
      last_seen_at: "2026-06-27T09:15:00Z",
    });

    const { container } = render(
      <ChatWindow
        activeChat={{ type: "direct", partnerId: 2 }}
        call={makeCall()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeInTheDocument();
    });

    expect(container.querySelector(".bg-online")).toBeTruthy();
    expect(container.querySelector(".bg-offline")).toBeFalsy();
  });

  it("renders an enabled direct-call button that invokes provider startCall once", async () => {
    const state = makeState();
    const startCall = vi.fn();
    state.conversationPreviews = {
      2: {
        partner_id: 2,
        partner_public_id: "alice-public-id",
        username: "alice",
        display_name: "Alice",
        avatar_url: null,
        last_message: null,
        last_message_at: null,
        unread_count: 0,
      },
    } as any;

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );
    getUser.mockResolvedValue({
      id: 2,
      public_id: "alice-api-public-id",
      username: "alice",
      display_name: "Alice",
      bio: null,
      avatar_url: null,
      status: "online",
      last_seen_at: null,
    });

    render(
      <ChatWindow
        activeChat={{ type: "direct", partnerId: 2, partnerRef: "alice-route-ref" }}
        call={makeCall({ startCall })}
      />,
    );

    const callButton = await screen.findByRole("button", { name: "Call Alice" });
    expect(callButton).not.toBeDisabled();

    fireEvent.click(callButton);

    expect(startCall).toHaveBeenCalledTimes(1);
    expect(startCall).toHaveBeenCalledWith("alice-api-public-id", "Alice");
  });

  it("shows a friendly issue instead of silently no-oping when call target is missing", async () => {
    const state = makeState();
    const startCall = vi.fn();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );
    getUser.mockResolvedValue({
      id: 2,
      public_id: "",
      username: "alice",
      display_name: "Alice",
      bio: null,
      avatar_url: null,
      status: "online",
      last_seen_at: null,
    });

    render(
      <ChatWindow
        activeChat={{ type: "direct", partnerId: 2, partnerRef: "" }}
        call={makeCall({ startCall })}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Call unavailable" }));

    expect(startCall).not.toHaveBeenCalled();
    expect(screen.getByTestId("call-start-issue")).toHaveTextContent(
      "Cannot start call because this user is missing call target information.",
    );
  });

  it("shows provider call failures while the call state is idle", async () => {
    const state = makeState();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );
    getUser.mockResolvedValue({
      id: 2,
      public_id: "alice-public-id",
      username: "alice",
      display_name: "Alice",
      bio: null,
      avatar_url: null,
      status: "online",
      last_seen_at: null,
    });

    render(
      <ChatWindow
        activeChat={{ type: "direct", partnerId: 2 }}
        call={makeCall({
          status: "idle",
          callIssue: {
            tone: "error",
            message: "Call service is still connecting. Try again in a moment.",
          },
        })}
      />,
    );

    expect(await screen.findByTestId("call-start-issue")).toHaveTextContent(
      "Call service is still connecting. Try again in a moment.",
    );
  });

  it("renders ActiveCallDock above messages without hiding history or composer", async () => {
    const state = makeState();
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );
    getUser.mockResolvedValue({
      id: 2,
      username: "alice",
      display_name: "Alice",
      bio: null,
      avatar_url: null,
      status: "online",
      last_seen_at: null,
    });

    render(
      <ChatWindow
        activeChat={{ type: "direct", partnerId: 2 }}
        call={makeCall({
          status: "active",
          remoteUserId: 2,
          remoteUsername: "Alice",
          seconds: 8,
          diagnostics: {
            connectionState: "connected",
            iceConnectionState: "connected",
            iceGatheringState: "complete",
            signalingState: "stable",
            selectedLocalCandidateType: "host",
          },
        })}
      />,
    );

    const dock = screen.getByTestId("active-call-dock");
    const messageRegion = screen.getByTestId("message-list-region");
    const composer = screen.getByRole("textbox", { name: "Message composer" });

    expect(dock).toBeInTheDocument();
    expect(messageRegion).toBeInTheDocument();
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
    expect(screen.getByText("message visible during active call")).toBeInTheDocument();
    expect(composer).toBeInTheDocument();
    composer.focus();
    expect(composer).toHaveFocus();
    expect(
      dock.compareDocumentPosition(messageRegion) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders ActiveCallDock when the active call remote id matches the conversation public id", async () => {
    const state = makeState();
    state.conversationPreviews = {
      2: {
        partner_id: 2,
        partner_public_id: "alice-public-id",
        username: "alice",
        display_name: "Alice",
        avatar_url: null,
        last_message: null,
        last_message_at: null,
        unread_count: 0,
      },
    } as any;
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );
    getUser.mockResolvedValue({
      id: 2,
      username: "alice",
      display_name: "Alice",
      bio: null,
      avatar_url: null,
      status: "online",
      last_seen_at: null,
    });

    render(
      <ChatWindow
        activeChat={{ type: "direct", partnerId: 2, partnerRef: 2 }}
        call={makeCall({
          status: "active",
          remoteUserId: "alice-public-id",
          remoteUsername: "Alice",
        })}
      />,
    );

    expect(await screen.findByTestId("active-call-dock")).toBeInTheDocument();
    expect(screen.getByText("message visible during active call")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message composer" })).toBeInTheDocument();
  });

  it("keeps messages visible when the active call belongs to another direct chat", async () => {
    const state = makeState();
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );
    getUser.mockResolvedValue({
      id: 2,
      username: "alice",
      display_name: "Alice",
      bio: null,
      avatar_url: null,
      status: "online",
      last_seen_at: null,
    });

    render(
      <ChatWindow
        activeChat={{ type: "direct", partnerId: 2 }}
        call={makeCall({
          status: "active",
          remoteUserId: 3,
          remoteUsername: "Bob",
        })}
      />,
    );

    expect(screen.queryByTestId("active-call-dock")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message composer" })).toBeInTheDocument();
  });
});
