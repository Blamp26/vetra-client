import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, setActiveChatMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  setActiveChatMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

vi.mock("./features/calling/hooks/useCall", () => ({
  useCall: () => ({
    status: "idle",
    remoteStream: null,
    remoteScreenStream: null,
    localScreenStream: null,
    remoteUsername: null,
    remoteUserId: null,
    isMuted: false,
    isScreenSharing: false,
    isScreenShareUpdating: false,
    isRemoteScreenLoading: false,
    seconds: 0,
    diagnostics: null,
    callIssue: null,
    isIncomingActionPending: false,
    toggleMute: vi.fn(),
    hangUp: vi.fn(),
    acceptCall: vi.fn(),
    rejectCall: vi.fn(),
    startCall: vi.fn(),
    startScreenShare: vi.fn(),
    stopScreenShare: vi.fn(),
  }),
}));

vi.mock("@/shared/hooks/useAuthHydration", () => ({
  useAuthHydration: vi.fn(),
}));

vi.mock("@/features/messaging/hooks/useSocketEvents", () => ({
  useSocketEvents: vi.fn(),
}));

vi.mock("@/features/registration/AuthPage", () => ({
  AuthPage: () => <div>auth</div>,
}));

vi.mock("@/features/messaging/components/Sidebar", () => ({
  Sidebar: () => <div>sidebar</div>,
}));

vi.mock("@/features/messaging/components/Sidebar/SidebarFooter", () => ({
  SidebarFooter: ({ onOpenSettings }: { onOpenSettings: () => void }) => (
    <button onClick={onOpenSettings}>open settings</button>
  ),
}));

vi.mock("@/features/messaging/components/ChatWindow/ChatWindow", () => ({
  ChatWindow: () => <div>chat</div>,
}));

vi.mock("@/features/messaging/components/ChannelPanel/ChannelPanel", () => ({
  ChannelPanel: () => <div>channels</div>,
}));

vi.mock("@/features/settings/components/SettingsPage/SettingsPage", () => ({
  SettingsPage: () => <div>settings</div>,
}));

vi.mock("./features/calling/components/IncomingCallModal", () => ({
  IncomingCallModal: () => null,
}));

vi.mock("./features/calling/components/ActiveCallWindow", () => ({
  ActiveCallWindow: () => null,
}));

vi.mock("@/shared/components/ToastHost/ToastHost", () => ({
  ToastHost: () => null,
}));

import App from "./App";

function makeState() {
  return {
    currentUser: { id: 1, username: "tester" },
    activeChat: null as any,
    conversationPreviews: {},
    roomPreviews: {},
    servers: {
      1: {
        id: 1,
        name: "Alpha",
        created_by: 1,
        inserted_at: "2026-06-28T00:00:00Z",
      },
    },
    serverChannels: {},
    searchResults: { users: [], servers: [] },
    setActiveChat: setActiveChatMock,
    openModal: vi.fn(),
  };
}

describe("App hash sync", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    setActiveChatMock.mockReset();
    window.location.hash = "#";
  });

  it("resolves a channel hash to a channel active chat directly", async () => {
    const state = makeState();
    window.location.hash = "#/s/1/1";

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    await waitFor(() =>
      expect(setActiveChatMock).toHaveBeenCalledWith(
        {
          type: "channel",
          serverId: 1,
          channelId: 1,
          serverRef: "1",
          channelRef: "1",
        },
      ),
    );

    expect(setActiveChatMock).not.toHaveBeenCalledWith(
      { type: "server", serverId: 1, serverRef: "1" },
    );
  });

  it("does not restore the stale server hash after a channel is selected", async () => {
    const state = makeState();
    state.activeChat = { type: "server", serverId: 1, serverRef: 1 };
    window.location.hash = "#/s/1";

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    const view = render(<App />);

    expect(setActiveChatMock).not.toHaveBeenCalled();

    state.activeChat = {
      type: "channel",
      serverId: 1,
      channelId: 1,
      serverRef: 1,
      channelRef: 1,
    };

    view.rerender(<App />);

    await waitFor(() => expect(window.location.hash).toBe("#/s/1/1"));

    expect(setActiveChatMock).not.toHaveBeenCalledWith(
      { type: "server", serverId: 1, serverRef: "1" },
    );
  });

  it("keeps the explicit settings hash stable instead of restoring the active chat route", async () => {
    const state = makeState();
    state.activeChat = {
      type: "direct",
      partnerId: 2,
      partnerRef: "a0d2a839-4b37-441e-958e-6d4369e94de9",
    };
    window.location.hash = "#/settings";

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("settings")).toBeTruthy());
    expect(window.location.hash).toBe("#/settings");
    expect(setActiveChatMock).not.toHaveBeenCalled();
  });

  it("switches from a chat route to settings without bouncing back to chat", async () => {
    const state = makeState();
    state.activeChat = {
      type: "direct",
      partnerId: 2,
      partnerRef: "a0d2a839-4b37-441e-958e-6d4369e94de9",
    };
    window.location.hash = "#/a0d2a839-4b37-441e-958e-6d4369e94de9";

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "open settings" }));

    await waitFor(() => expect(window.location.hash).toBe("#/settings"));
    expect(screen.getByText("settings")).toBeTruthy();
  });
});
