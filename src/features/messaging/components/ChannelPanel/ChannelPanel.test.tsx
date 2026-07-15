import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelPanel } from "./ChannelPanel";

const { useAppStoreMock, getChannelsMock, createChannelMock, deleteRoomMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  getChannelsMock: vi.fn(),
  createChannelMock: vi.fn(),
  deleteRoomMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));
vi.mock("@/api/servers", () => ({
  serversApi: { getChannels: getChannelsMock, createChannel: createChannelMock },
}));
vi.mock("@/api/rooms", () => ({ roomsApi: { delete: deleteRoomMock } }));
vi.mock("../ServerSettingsModal/ServerSettingsModal", () => ({
  ServerSettingsModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Server settings">
      <button type="button" onClick={onClose}>Close server settings</button>
    </div>
  ),
}));
vi.mock("@/shared/components/ConfirmModal", () => ({
  ConfirmModal: ({ title, message, onConfirm, onCancel, isLoading }: {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
  }) => (
    <div role="dialog" aria-label={title}>
      <p>{message}</p>
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="button" onClick={onConfirm} disabled={isLoading}>Confirm</button>
    </div>
  ),
}));

function makeState() {
  return {
    servers: { 1: { id: 1, public_id: "server-1", name: "Vetra", created_by: 1 } },
    serverChannels: {},
    channelsLoading: {},
    setServerChannels: vi.fn(),
    addServerChannel: vi.fn(),
    setChannelsLoading: vi.fn(),
    setActiveChat: vi.fn(),
    activeChat: null,
    upsertRoomPreview: vi.fn(),
    socketManager: null,
    currentUser: { id: 1 },
    channelUnread: {},
    resetChannelUnread: vi.fn(),
  };
}

describe("ChannelPanel states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelsMock.mockResolvedValue([]);
  });

  it("distinguishes loading failure from an empty channel list and retries", async () => {
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: (channels: unknown[]) => void;
    getChannelsMock
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const state = makeState();
    state.channelsLoading = { 1: true };
    state.setChannelsLoading = vi.fn((id: number, loading: boolean) => {
      (state.channelsLoading as Record<number, boolean>)[id] = loading;
    });
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    const view = render(<ChannelPanel serverId={1} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    expect(screen.getByRole("status").parentElement).toHaveAttribute("aria-busy", "true");

    rejectFirst(new Error("offline"));
    view.rerender(<ChannelPanel serverId={1} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load channels.");
    expect(screen.queryByRole("heading", { name: "No channels." })).not.toBeInTheDocument();
    expect(state.setServerChannels).not.toHaveBeenCalledWith(1, []);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(getChannelsMock).toHaveBeenCalledTimes(2);
    view.rerender(<ChannelPanel serverId={1} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    resolveSecond([]);
    await waitFor(() => expect(state.setServerChannels).toHaveBeenCalledWith(1, []));
  });

  it("fills the parent width and exposes the server header controls", () => {
    const state = makeState();
    state.serverChannels = { 1: [] };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    render(<ChannelPanel serverId={1} />);

    const panel = screen.getByTestId("channel-panel");
    expect(panel).toHaveClass("w-full", "min-w-0");
    expect(panel).not.toHaveClass("w-[320px]");
    expect(screen.getByText("Vetra")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open server settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Channels" })).toBeInTheDocument();
  });

  it("opens Server Settings from the shared IconButton", () => {
    const state = makeState();
    state.serverChannels = { 1: [] };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    render(<ChannelPanel serverId={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Open server settings" }));

    expect(screen.getByRole("dialog", { name: "Server settings" })).toBeInTheDocument();
  });

  it("keeps inline channel creation compact and keyboard-cancellable", () => {
    const state = makeState();
    state.serverChannels = { 1: [] };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    render(<ChannelPanel serverId={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Create channel" }));

    const input = screen.getByRole("textbox", { name: "Channel name" });
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: /^Create$/ })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Channel name" })).not.toBeInTheDocument();
  });

  it("connects required and maximum-length validation to the channel input", () => {
    const state = makeState();
    state.serverChannels = { 1: [] };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    render(<ChannelPanel serverId={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Create channel" }));
    const input = screen.getByRole("textbox", { name: "Channel name" });

    fireEvent.keyDown(input, { key: "Enter" });
    const requiredError = screen.getByRole("alert");
    expect(requiredError).toHaveTextContent("Channel name is required.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", requiredError.id);

    fireEvent.change(input, { target: { value: "a".repeat(101) } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent("Max 100 characters.");
  });

  it("keeps Create labelled while loading", () => {
    createChannelMock.mockReturnValue(new Promise(() => {}));
    const state = makeState();
    state.serverChannels = { 1: [] };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    render(<ChannelPanel serverId={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Create channel" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Channel name" }), { target: { value: "general" } });
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));

    const createButton = screen.getByRole("button", { name: /^Create$/ });
    expect(createButton).toBeDisabled();
    expect(createButton).toHaveAttribute("aria-busy", "true");
  });

  it("preserves channel selection, unread reset and stable active state", () => {
    const channel = { id: 8, public_id: "channel-8", name: "general", created_by: 1, server_id: 1 };
    const state = makeState();
    state.serverChannels = { 1: [channel] };
    state.channelUnread = { 8: 2 };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    const view = render(<ChannelPanel serverId={1} />);
    const row = screen.getByRole("button", { name: /#general/ });
    expect(row).toHaveAttribute("data-state", "inactive");
    expect(row.querySelector(".h-1\\.5.w-1\\.5")).toBeInTheDocument();
    fireEvent.click(row);

    expect(state.resetChannelUnread).toHaveBeenCalledWith(8);
    expect(state.setActiveChat).toHaveBeenCalled();
    (state as any).activeChat = { type: "channel", channelId: 8, serverId: 1 };
    view.rerender(<ChannelPanel serverId={1} />);
    expect(screen.getByRole("button", { name: /#general/ })).toHaveAttribute("data-state", "active");
  });

  it("makes owner deletion keyboard-discoverable without selecting the channel", async () => {
    deleteRoomMock.mockResolvedValue(undefined);
    const channel = { id: 8, public_id: "channel-8", name: "general", created_by: 1, server_id: 1 };
    const state = makeState();
    state.serverChannels = { 1: [channel] };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    render(<ChannelPanel serverId={1} />);
    const deleteButton = screen.getByRole("button", { name: "Delete channel general" });
    fireEvent.click(deleteButton);

    expect(state.setActiveChat).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete Channel" })).toHaveTextContent('Delete "#general"?');
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(deleteRoomMock).toHaveBeenCalledWith("channel-8"));
  });

  it("does not expose channel deletion to non-owners", () => {
    const channel = { id: 8, public_id: "channel-8", name: "general", created_by: 1, server_id: 1 };
    const state = makeState();
    state.currentUser = { id: 2 };
    state.serverChannels = { 1: [channel] };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));

    render(<ChannelPanel serverId={1} />);

    expect(screen.queryByRole("button", { name: "Delete channel general" })).not.toBeInTheDocument();
  });
});
