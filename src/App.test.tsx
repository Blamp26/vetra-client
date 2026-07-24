import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAppStoreMock,
  setActiveChatMock,
  useCallMock,
  audioMounts,
  audioUnmounts,
} = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  setActiveChatMock: vi.fn(),
  useCallMock: vi.fn(),
  audioMounts: { current: 0 },
  audioUnmounts: { current: 0 },
}));

function makeCallState(overrides = {}) {
  return {
    status: "idle",
    callServiceStatus: "ready",
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
    ...overrides,
  };
}

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
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
  SidebarFooter: ({
    callStatus,
    onOpenSettings,
    onReturnToCall,
  }: {
    callStatus: string;
    onOpenSettings: () => void;
    onReturnToCall?: () => void;
  }) => (
    <div>
      <button onClick={onOpenSettings}>open settings</button>
      {callStatus === "active" && (
        <button onClick={onReturnToCall}>return to call</button>
      )}
    </div>
  ),
}));

vi.mock("@/features/messaging/components/ChatWindow/ChatWindow", () => ({
  ChatWindow: ({
    activeChat,
    call,
  }: {
    activeChat: { type: string; partnerId?: number; partnerRef?: string | number };
    call: { status: string; remoteUserId: number | string | null } | null;
  }) => (
    <div>
      chat
      {call?.status === "active" &&
        activeChat.type === "direct" &&
        (String(activeChat.partnerId) === String(call.remoteUserId) ||
          String(activeChat.partnerRef) === String(call.remoteUserId)) && (
          <div data-testid="active-call-dock" />
        )}
    </div>
  ),
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
    selectedOutputDeviceId: "default",
    setOutputDevice: vi.fn(),
    openModal: vi.fn(),
  };
}

describe("App hash sync", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    setActiveChatMock.mockReset();
    window.location.hash = "#";
    window.localStorage.clear();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (name: string, _options: unknown, callback: (lock: { name: string }) => unknown) =>
          callback({ name }),
      },
    });
  });

  it("renders the conversation EmptyPane and opens the picker once", () => {
    const state = makeState();
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    render(<App />);

    const heading = screen.getByRole("heading", { name: "Pick a conversation" });
    const emptyPane = heading.closest('[data-density="workspace"]');
    expect(heading).toBeInTheDocument();
    expect(emptyPane).toBeInTheDocument();
    expect(emptyPane).not.toHaveClass("[&_.vt-empty-pane__title]:text-[1.625rem]");
    expect(emptyPane).not.toHaveClass("[&_.vt-empty-pane__title]:font-semibold");
    expect(emptyPane).not.toHaveClass("[&_.vt-empty-pane__title]:tracking-tight");
    expect(screen.getByText("Select a chat or start a new one.")).toBeInTheDocument();
    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start a new conversation" }));
    expect(state.openModal).toHaveBeenCalledOnce();
    expect(state.openModal).toHaveBeenCalledWith("CREATE_PICKER");
  });

  it("renders a channel-selection EmptyPane without the workspace kicker", () => {
    const state = makeState();
    state.activeChat = { type: "server", serverId: 1, serverRef: 1 };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    render(<App />);

    const heading = screen.getByRole("heading", { name: "Choose a channel" });
    const emptyPane = heading.closest('[data-density="workspace"]');
    expect(heading).toBeInTheDocument();
    expect(emptyPane).toBeInTheDocument();
    expect(emptyPane).not.toHaveClass("[&_.vt-empty-pane__title]:text-[1.625rem]");
    expect(emptyPane).not.toHaveClass("[&_.vt-empty-pane__title]:font-semibold");
    expect(emptyPane).not.toHaveClass("[&_.vt-empty-pane__title]:tracking-tight");
    expect(screen.getByText("Open any channel to start messaging.")).toBeInTheDocument();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a new conversation" })).not.toBeInTheDocument();
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

  it("uses the default persisted shell width token on first render", () => {
    const state = makeState();

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    expect(screen.getByTestId("app-shell").style.getPropertyValue("--vetra-left-pane-width")).toBe("408px");
    expect(screen.getByRole("separator", { name: "Resize sidebar" })).toHaveAttribute("aria-valuenow", "408");
  });

  it("restores a persisted sidebar width from localStorage", () => {
    const state = makeState();
    window.localStorage.setItem("vetra:left-pane-mode", "text");
    window.localStorage.setItem("vetra:left-pane-width", "512");

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    expect(screen.getByTestId("app-shell").style.getPropertyValue("--vetra-left-pane-width")).toBe("512px");
    expect(screen.getByRole("separator", { name: "Resize sidebar" })).toHaveAttribute("aria-valuenow", "512");
  });

  it("migrates a saved collapsed mode to the text minimum width", () => {
    const state = makeState();
    window.localStorage.setItem("vetra:left-pane-mode", "collapsed");
    window.localStorage.setItem("vetra:left-pane-width", "148");

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    expect(screen.getByTestId("app-shell").style.getPropertyValue("--vetra-left-pane-width")).toBe("333px");
    expect(screen.getByRole("separator", { name: "Resize sidebar" })).toHaveAttribute("aria-valuenow", "333");
  });

  it("migrates legacy collapsed widths to the text minimum width", () => {
    const state = makeState();
    window.localStorage.setItem("vetra:left-pane-width", "139");

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    expect(screen.getByTestId("app-shell").style.getPropertyValue("--vetra-left-pane-width")).toBe("333px");
    expect(screen.getByRole("separator", { name: "Resize sidebar" })).toHaveAttribute("aria-valuenow", "333");
  });

  it("stops at the text minimum when dragging left", () => {
    const state = makeState();

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    const shell = screen.getByTestId("app-shell");
    const divider = screen.getByRole("separator", { name: "Resize sidebar" });

    fireEvent.pointerDown(divider, { button: 0, clientX: 408, pointerId: 1 });
    expect(document.body.dataset.vtShellResizing).toBe("true");

    fireEvent.pointerMove(window, { clientX: 320, pointerId: 1 });
    expect(shell.style.getPropertyValue("--vetra-left-pane-width")).toBe("333px");
    expect(divider).toHaveAttribute("aria-valuenow", "333");

    fireEvent.pointerMove(window, { clientX: 200, pointerId: 1 });
    expect(shell.style.getPropertyValue("--vetra-left-pane-width")).toBe("333px");
    expect(divider).toHaveAttribute("aria-valuenow", "333");

    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(document.body.dataset.vtShellResizing).toBeUndefined();
    expect(window.localStorage.getItem("vetra:left-pane-width")).toBe("333");
  });

  it("continues expanding normally from the text minimum", () => {
    const state = makeState();
    window.localStorage.setItem("vetra:left-pane-width", "333");

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    const shell = screen.getByTestId("app-shell");
    const divider = screen.getByRole("separator", { name: "Resize sidebar" });

    fireEvent.pointerDown(divider, { button: 0, clientX: 333, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 200, pointerId: 1 });
    expect(shell.style.getPropertyValue("--vetra-left-pane-width")).toBe("333px");

    fireEvent.pointerMove(window, { clientX: 360, pointerId: 1 });
    expect(shell.style.getPropertyValue("--vetra-left-pane-width")).toBe("360px");

    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(window.localStorage.getItem("vetra:left-pane-width")).toBe("360");
  });

  it("clamps keyboard resizing between the text minimum and responsive max", () => {
    const state = makeState();
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1920,
    });

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    const shell = screen.getByTestId("app-shell");
    const divider = screen.getByRole("separator", { name: "Resize sidebar" });

    fireEvent.keyDown(divider, { key: "ArrowLeft" });
    expect(shell.style.getPropertyValue("--vetra-left-pane-width")).toBe("392px");
    expect(window.localStorage.getItem("vetra:left-pane-width")).toBe("392");

    for (let index = 0; index < 4; index += 1) {
      fireEvent.keyDown(divider, { key: "ArrowLeft" });
    }
    expect(shell.style.getPropertyValue("--vetra-left-pane-width")).toBe("333px");

    fireEvent.keyDown(divider, { key: "ArrowLeft" });
    expect(shell.style.getPropertyValue("--vetra-left-pane-width")).toBe("333px");
    expect(window.localStorage.getItem("vetra:left-pane-width")).toBe("333");

    fireEvent.keyDown(divider, { key: "ArrowRight" });
    expect(shell.style.getPropertyValue("--vetra-left-pane-width")).toBe("349px");

    fireEvent.keyDown(divider, { key: "Home" });
    expect(shell.style.getPropertyValue("--vetra-left-pane-width")).toBe("333px");

    fireEvent.keyDown(divider, { key: "End" });
    const responsiveMaxWidth = String(window.innerWidth - 380);
    expect(shell.style.getPropertyValue("--vetra-left-pane-width")).toBe(`${responsiveMaxWidth}px`);
    expect(divider).toHaveAttribute("aria-valuemax", responsiveMaxWidth);
    expect(window.localStorage.getItem("vetra:left-pane-width")).toBe(responsiveMaxWidth);

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
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

  it("lets an explicit active-chat switch win over the previous route", async () => {
    const state = makeState();
    state.activeChat = { type: "direct", partnerId: 2, partnerRef: "user-2" };
    state.conversationPreviews = {
      2: {
        partner_id: 2,
        partner_public_id: "user-2",
        partner_username: "user-2",
        partner_display_name: "User 2",
        unread_count: 0,
        last_message: null,
      },
      3: {
        partner_id: 3,
        partner_public_id: "user-3",
        partner_username: "user-3",
        partner_display_name: "User 3",
        unread_count: 0,
        last_message: null,
      },
    } as any;
    window.location.hash = "#/2";

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    const view = render(<App />);
    setActiveChatMock.mockReset();
    state.activeChat = { type: "direct", partnerId: 3, partnerRef: "user-3" };
    view.rerender(<App />);

    await waitFor(() => expect(window.location.hash).toBe("#/user-3"));
    expect(setActiveChatMock).not.toHaveBeenCalledWith(
      { type: "direct", partnerId: 2, partnerRef: "user-2" },
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

    await waitFor(() => expect(screen.getByRole("button", { name: "open settings" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "open settings" }));

    await waitFor(() => expect(window.location.hash).toBe("#/settings"));
    expect(screen.getByText("settings")).toBeTruthy();
  });

  it.skip("legacy provider-owned active call state is no longer application wiring", async () => {
    const remoteStream = { id: "remote-stream-1" } as MediaStream;
    const startCall = vi.fn();
    const state = makeState();
    state.activeChat = {
      type: "direct",
      partnerId: 2,
      partnerRef: "a0d2a839-4b37-441e-958e-6d4369e94de9",
    };
    window.location.hash = "#/a0d2a839-4b37-441e-958e-6d4369e94de9";

    useCallMock.mockReturnValue(
      makeCallState({
        status: "active",
        remoteStream,
        remoteUsername: "Partner",
        remoteUserId: 2,
        seconds: 42,
        startCall,
      }),
    );
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("call-audio-renderer")).toBeInTheDocument());
    expect(screen.getByTestId("call-audio-renderer").textContent).toBe("audio-active");
    expect(screen.getByTestId("active-call-dock")).toBeTruthy();
    await waitFor(() => expect(audioMounts.current).toBe(1));
    expect(useCallMock).toHaveBeenCalledTimes(1);
    expect(useCallMock).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "open settings" }));

    await waitFor(() => expect(window.location.hash).toBe("#/settings"));
    expect(screen.getByText("settings")).toBeTruthy();
    expect(screen.queryByTestId("active-call-dock")).toBeNull();
    expect(screen.getByTestId("call-audio-renderer").textContent).toBe("audio-active");
    await waitFor(() => expect(audioMounts.current).toBe(1));
    expect(audioUnmounts.current).toBe(0);
    expect(useCallMock).toHaveBeenCalledTimes(1);
    expect(startCall).not.toHaveBeenCalled();
    expect(setActiveChatMock).not.toHaveBeenCalled();
  });

  it.skip("legacy sidebar return-to-call behavior is no longer application wiring", async () => {
    const remoteStream = { id: "remote-stream-1" } as MediaStream;
    const state = makeState();
    state.activeChat = {
      type: "direct",
      partnerId: 3,
      partnerRef: 3,
    };
    window.location.hash = "#/settings";

    useCallMock.mockReturnValue(
      makeCallState({
        status: "active",
        remoteStream,
        remoteUsername: "Partner",
        remoteUserId: 2,
        seconds: 42,
      }),
    );
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    const view = render(<App />);

    expect(screen.getByText("settings")).toBeTruthy();
    expect(screen.queryByTestId("active-call-dock")).toBeNull();
    await waitFor(() => expect(audioMounts.current).toBe(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "return to call" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "return to call" }));

    await waitFor(() => expect(window.location.hash).toBe("#/2"));
    await waitFor(() =>
      expect(setActiveChatMock).toHaveBeenCalledWith({
        type: "direct",
        partnerId: 2,
        partnerRef: "2",
      }),
    );

    state.activeChat = { type: "direct", partnerId: 2, partnerRef: "2" };
    view.rerender(<App />);

    expect(screen.getByTestId("active-call-dock")).toBeTruthy();
    expect(audioMounts.current).toBe(1);
    expect(audioUnmounts.current).toBe(0);
    expect(useCallMock).toHaveBeenCalledWith(1);
  });

  it.skip("legacy direct-chat return-to-call behavior is no longer application wiring", async () => {
    const state = makeState();
    state.activeChat = {
      type: "direct",
      partnerId: 3,
      partnerRef: 3,
    };
    window.location.hash = "#/3";

    useCallMock.mockReturnValue(
      makeCallState({
        status: "active",
        remoteUsername: "Partner",
        remoteUserId: 2,
      }),
    );
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    expect(screen.queryByTestId("active-call-dock")).toBeNull();

    await waitFor(() => expect(screen.getByRole("button", { name: "return to call" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "return to call" }));

    await waitFor(() => expect(window.location.hash).toBe("#/2"));
    await waitFor(() =>
      expect(setActiveChatMock).toHaveBeenCalledWith({
        type: "direct",
        partnerId: 2,
        partnerRef: "2",
      }),
    );
  });

  it.skip("legacy remembered-call routing is no longer application wiring", async () => {
    const state = makeState();
    const callState = makeCallState({
      status: "calling",
      remoteUsername: "Partner",
      remoteUserId: "alice-public-id",
    });
    state.activeChat = {
      type: "direct",
      partnerId: 2,
      partnerRef: 2,
    };
    window.location.hash = "#/2";

    useCallMock.mockReturnValue(callState);
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    const view = render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "open settings" })).toBeInTheDocument());
    Object.assign(callState, {
      status: "active",
      remoteUserId: "alice-public-id",
    });
    state.activeChat = {
      type: "direct",
      partnerId: 3,
      partnerRef: 3,
    };
    view.rerender(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "open settings" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "open settings" }));
    await waitFor(() => expect(window.location.hash).toBe("#/settings"));
    expect(screen.getByText("settings")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "return to call" }));

    await waitFor(() => expect(window.location.hash).toBe("#/2"));
    expect(setActiveChatMock).toHaveBeenCalledWith({
      type: "direct",
      partnerId: 2,
      partnerRef: 2,
    });
  });

  it.skip("legacy active-call routing is no longer application wiring", async () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const state = makeState();
    state.activeChat = {
      type: "direct",
      partnerId: 2,
      partnerRef: 2,
    };
    window.location.hash = "#/2";

    useCallMock.mockReturnValue(
      makeCallState({
        status: "active",
        remoteUsername: "Partner",
        remoteUserId: 2,
      }),
    );
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("active-call-dock")).toBeInTheDocument());
    expect(screen.getByTestId("active-call-dock")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "return to call" }));

    expect(window.location.hash).toBe("#/2");
    expect(replaceStateSpy).not.toHaveBeenCalled();

    replaceStateSpy.mockRestore();
  });
});
