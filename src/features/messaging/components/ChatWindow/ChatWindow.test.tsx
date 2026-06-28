import { render, screen, waitFor } from "@testing-library/react";
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
    messages: [],
    isLoading: false,
    hasMore: false,
    loadMore: vi.fn(),
    sendMessage: vi.fn(),
  }),
}));

vi.mock("../MessageList/MessageList", () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

vi.mock("../MessageInput/MessageInput", () => ({
  MessageInput: () => <div data-testid="message-input" />,
}));

vi.mock("../MessageSearch/MessageSearch", () => ({
  MessageSearch: () => <div data-testid="message-search" />,
}));

vi.mock("@/features/calling/components/CallButton", () => ({
  CallButton: () => <button type="button">Call</button>,
}));

import { ChatWindow } from "./ChatWindow";

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
        callStatus="idle"
        onStartCall={vi.fn()}
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
        callStatus="idle"
        onStartCall={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeInTheDocument();
    });

    expect(container.querySelector(".bg-online")).toBeTruthy();
    expect(container.querySelector(".bg-offline")).toBeFalsy();
  });
});
