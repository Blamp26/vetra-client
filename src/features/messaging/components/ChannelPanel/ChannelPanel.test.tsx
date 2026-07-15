import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelPanel } from "./ChannelPanel";

const { useAppStoreMock, getChannelsMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  getChannelsMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));
vi.mock("@/api/servers", () => ({
  serversApi: { getChannels: getChannelsMock, createChannel: vi.fn() },
}));
vi.mock("@/api/rooms", () => ({ roomsApi: { delete: vi.fn() } }));
vi.mock("../ServerSettingsModal/ServerSettingsModal", () => ({ ServerSettingsModal: () => null }));
vi.mock("@/shared/components/ConfirmModal", () => ({ ConfirmModal: () => null }));

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
});
