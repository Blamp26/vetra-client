import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, getListMock, getChannelsMock, subscribedMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  getListMock: vi.fn(),
  getChannelsMock: vi.fn(),
  subscribedMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

vi.mock("@/api/servers", () => ({
  serversApi: {
    getList: getListMock,
    getChannels: getChannelsMock,
  },
}));

vi.mock("@/api/broadcastChannels", () => ({
  broadcastChannelsApi: { subscribed: subscribedMock },
}));

vi.mock("../UserSearch/UserSearch", () => ({
  UserSearch: () => <input data-testid="user-search" placeholder="Search..." />,
}));

vi.mock("../CreateRoomModal/CreateRoomModal", () => ({
  CreateRoomModal: () => null,
}));

vi.mock("../CreateServerModal/CreateServerModal", () => ({
  CreateServerModal: () => null,
}));

vi.mock("../CreatePickerModal/CreatePickerModal", () => ({
  CreatePickerModal: () => null,
}));

vi.mock("@/features/profile/components/ProfileModal/ProfileModal", () => ({
  ProfileModal: () => null,
}));

import { Sidebar } from "./Sidebar";
import { ChannelPanel } from "../ChannelPanel/ChannelPanel";

function makeState() {
  return {
    currentUser: { id: 1, username: "me", display_name: "Me" },
    activeChat: null as any,
    conversationPreviews: {
      2: {
        partner_id: 2,
        partner_public_id: "user-public-id",
        partner_username: "alice",
        partner_display_name: "Alice",
        unread_count: 1,
        last_message: {
          id: 11,
          content: null,
          preview: "Photo",
          inserted_at: "2026-06-30T10:00:00Z",
          sender_id: 2,
          sender_public_id: "user-public-id",
          status: "sent",
          media_file_id: "media-photo-1",
          media_mime_type: "image/jpeg",
          attachment: {
            id: "media-photo-1",
            url: "/api/v1/media/media-photo-1",
            mime_type: "image/jpeg",
            original_name: "photo.jpg",
            file_size: 2048,
            kind: "photo",
          },
        },
      },
    },
    roomPreviews: {
      7: {
        id: 7,
        public_id: "room-public-id",
        name: "general",
        created_by: 1,
        server_id: null,
        inserted_at: "2026-06-29T10:00:00Z",
        unread_count: 0,
        last_message_at: "2026-06-30T11:00:00Z",
        last_message: {
          id: 21,
          content: null,
          preview: "File: report.pdf",
          inserted_at: "2026-06-30T11:00:00Z",
          sender_id: 2,
          sender_public_id: "sender-public-id",
          status: "sent",
          media_file_id: null,
          media_mime_type: "application/pdf",
          attachment: null,
          attachment_kind: "file",
          attachment_name: "report.pdf",
          attachment_size: 5678,
          attachment_mime_type: "application/pdf",
        },
      },
    },
    onlineUserIds: new Set<number>(),
    userStatuses: {},
    lastSeenAt: {},
    servers: {},
    setServers: vi.fn(),
    setActiveChat: vi.fn(),
    broadcastChannels: {},
    setBroadcastSubscriptions: vi.fn(),
    serverChannels: {},
    channelsLoading: {},
    setServerChannels: vi.fn(),
    addServerChannel: vi.fn(),
    setChannelsLoading: vi.fn(),
    upsertRoomPreview: vi.fn(),
    socketManager: null,
    activeModal: null,
    openModal: vi.fn(),
    closeModal: vi.fn(),
  };
}

describe("Sidebar attachment previews", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    getListMock.mockReset();
    getListMock.mockResolvedValue([]);
    getChannelsMock.mockReset();
    getChannelsMock.mockResolvedValue([]);
    subscribedMock.mockReset();
    subscribedMock.mockResolvedValue([]);
  });

  it("renders the no-conversations state as a semantic empty pane", () => {
    const state = makeState();
    state.conversationPreviews = {} as typeof state.conversationPreviews;
    state.roomPreviews = {} as typeof state.roomPreviews;
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    render(<Sidebar />);

    expect(screen.getByRole("heading", { name: "No conversations" })).toBeInTheDocument();
    expect(screen.getByText("Start a direct chat or create a room to begin messaging.")).toBeInTheDocument();
    expect(screen.queryByText("No conversations", { selector: ".vt-kicker" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start a new/i })).not.toBeInTheDocument();
  });

  it("navigates a subscribed broadcast by public ID, not its display name or username", async () => {
    const state = makeState();
    state.broadcastChannels = {
      "channel-public-id": {
        public_id: "channel-public-id",
        display_name: "TestBroadcast",
        username: "testbroadcast",
        visibility: "public",
        status: "active",
        subscriber_count: 1,
      },
    } as any;
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    const navigateToHash = vi.fn();
    render(<Sidebar onNavigateToHash={navigateToHash} />);

    const row = await screen.findByTestId("sidebar-item-broadcast-channel-public-id");
    fireEvent.click(row);

    expect(navigateToHash).toHaveBeenCalledWith("#/broadcast/channel-public-id");
  });

  it("renders distinct stable keys and navigates exact production subscribed summaries", async () => {
    const state = makeState();
    state.broadcastChannels = {
      "a14e6268-ad65-452e-8cdf-80cb691458ac": {
        public_id: "a14e6268-ad65-452e-8cdf-80cb691458ac",
        display_name: "TestBroadcast",
        description: null,
        avatar_url: null,
        visibility: "public",
      },
      "b25f7379-be76-563f-9ef1-91dc792569bd": {
        public_id: "b25f7379-be76-563f-9ef1-91dc792569bd",
        display_name: "SecondBroadcast",
        description: null,
        avatar_url: null,
        visibility: "public",
      },
    } as any;
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    const navigateToHash = vi.fn();
    render(<Sidebar onNavigateToHash={navigateToHash} />);

    const first = await screen.findByTestId("sidebar-item-broadcast-a14e6268-ad65-452e-8cdf-80cb691458ac");
    const second = await screen.findByTestId("sidebar-item-broadcast-b25f7379-be76-563f-9ef1-91dc792569bd");
    expect(first).toHaveTextContent("TestBroadcast");
    expect(second).toHaveTextContent("SecondBroadcast");

    fireEvent.click(first);
    expect(navigateToHash).toHaveBeenCalledWith("#/broadcast/a14e6268-ad65-452e-8cdf-80cb691458ac");
    expect(navigateToHash).not.toHaveBeenCalledWith(expect.stringContaining("undefined"));
  });

  it("uses server-provided preview text for direct and room items", async () => {
    const state = makeState();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    render(<Sidebar />);

    await waitFor(() => {
      expect(getListMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Photo")).toBeInTheDocument();
    expect(screen.getByText("File: report.pdf")).toBeInTheDocument();
  });

  it("renders Telegram-like sidebar chrome without inbox header or hamburger menu", async () => {
    const state = makeState();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    render(<Sidebar />);

    await waitFor(() => {
      expect(getListMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId("user-search")).toBeInTheDocument();
    expect(screen.queryByText("Messages")).not.toBeInTheDocument();
    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open sidebar menu" })).not.toBeInTheDocument();
  });

  it("keeps DM rows selectable with selected and unread indicators", async () => {
    const state = makeState();
    state.activeChat = { type: "direct", partnerId: 2, partnerRef: "user-public-id" };
    state.onlineUserIds = new Set<number>([2]);
    state.userStatuses = { 2: "online" };

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    render(<Sidebar />);

    const directRow = await screen.findByTestId("sidebar-item-direct-2");
    expect(directRow).toHaveClass("h-[62px]");
    expect(directRow).toHaveClass("bg-accent/70");
    expect(directRow).toHaveAttribute("data-state", "active");
    expect(directRow).toHaveAttribute("data-presence-status", "online");
    expect(directRow).toHaveAttribute("title", "Online");
    expect(screen.getByText("1")).toBeInTheDocument();

    fireEvent.click(directRow);

    expect(state.setActiveChat).toHaveBeenCalledWith({
      type: "direct",
      partnerId: 2,
      partnerRef: "user-public-id",
    });
  });

  it("selects the active broadcast and suppresses stale ordinary selection", async () => {
    const state = makeState();
    state.activeChat = { type: "room", roomId: 7 };
    state.broadcastChannels = {
      "channel-public-id": {
        public_id: "channel-public-id",
        display_name: "TestBroadcast",
        username: "testbroadcast",
        visibility: "public",
        status: "active",
        subscriber_count: 1,
      },
    } as any;
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    render(<Sidebar activeBroadcastChannelPublicId="channel-public-id" />);

    const broadcastRow = await screen.findByTestId("sidebar-item-broadcast-channel-public-id");
    const roomRow = await screen.findByTestId("sidebar-item-room-7");
    expect(broadcastRow).toHaveAttribute("data-state", "active");
    expect(roomRow).toHaveAttribute("data-state", "inactive");
  });

  it("navigates a cached ordinary room explicitly through the App callback", async () => {
    const state = makeState();
    state.activeChat = { type: "room", roomId: 7, roomRef: "room-public-id" };
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );
    const navigateToHash = vi.fn();

    render(<Sidebar onNavigateToHash={navigateToHash} />);
    fireEvent.click(await screen.findByTestId("sidebar-item-room-7"));

    expect(navigateToHash).toHaveBeenCalledTimes(1);
    expect(navigateToHash).toHaveBeenCalledWith("#/r/room-public-id");
    expect(state.setActiveChat).toHaveBeenCalledWith({
      type: "room",
      roomId: 7,
      roomRef: "room-public-id",
    });
  });

  it("renders servers as chat-like rows and preserves server navigation", async () => {
    const state = makeState();
    state.servers = {
      5: {
        id: 5,
        name: "Workspace",
        created_by: 1,
        inserted_at: "2026-06-30T10:00:00Z",
      },
    };

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    render(<Sidebar />);

    expect(screen.queryByText("Servers")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create server" })).not.toBeInTheDocument();

    const serverRow = await screen.findByTestId("sidebar-item-server-5");
    expect(serverRow).toHaveClass("h-[62px]");
    expect(serverRow).not.toHaveTextContent("No messages");

    fireEvent.click(serverRow);
    expect(state.setActiveChat).toHaveBeenCalledWith({
      type: "server",
      serverId: 5,
      serverRef: 5,
    });
  });

  it("uses the compact Telegram-like search row and avatar sizing", async () => {
    const state = makeState();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    render(<Sidebar />);

    const directRow = await screen.findByTestId("sidebar-item-direct-2");
    const search = screen.getByTestId("user-search");

    expect(search.parentElement).toHaveClass("h-[54px]", "px-[11px]", "pt-[9px]");
    expect(search.parentElement).not.toHaveClass("border-b");
    expect(directRow).toHaveClass("px-[10px]", "gap-[11px]");
    expect(directRow).toHaveAttribute("data-state", "inactive");
    expect(directRow.querySelector('[data-slot="avatar"]')).toHaveClass("h-[46px]", "w-[46px]");
  });

  it("keeps search mounted while server mode covers only the text column", async () => {
    const state = makeState();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    const { rerender } = render(<Sidebar isCollapsed />);
    expect(screen.queryByTestId("user-search")).not.toBeInTheDocument();

    rerender(<Sidebar isServerMode />);
    expect(screen.getByTestId("user-search")).toBeInTheDocument();
  });

  it("preserves canonical avatar nodes and list scroll when the overlay opens", () => {
    const state = makeState();
    state.servers = {
      5: { id: 5, name: "Workspace", created_by: 1, inserted_at: "2026-06-30T10:00:00Z" },
    };
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    const panel = <div data-testid="stable-server-panel" />;
    const { rerender } = render(<Sidebar serverPanel={panel} />);
    const list = screen.getByTestId("sidebar-item-direct-2").closest("div.overflow-y-auto") as HTMLDivElement;
    const search = screen.getByTestId("user-search");
    const overlay = document.querySelector<HTMLElement>(".vt-channel-panel-overlay");
    list.scrollTop = 37;
    const avatars = Array.from(document.querySelectorAll('[data-slot="avatar"]'));

    rerender(<Sidebar isServerMode serverPanel={panel} />);

    const afterAvatars = Array.from(document.querySelectorAll('[data-slot="avatar"]'));
    expect(afterAvatars).toHaveLength(avatars.length);
    afterAvatars.forEach((avatar, index) => expect(avatar).toBe(avatars[index]));
    expect(document.querySelector("div.overflow-y-auto")).toBe(list);
    expect(screen.getByTestId("user-search")).toBe(search);
    expect(document.querySelector(".vt-channel-panel-overlay")).toBe(overlay);
    expect(list.scrollTop).toBe(37);
    expect(screen.getByTestId("stable-server-panel")).toBeInTheDocument();
    expect(document.querySelector(".vt-channel-panel-overlay")).toHaveAttribute("data-state", "open");
  });

  it("restores focus before hiding the server overlay", () => {
    const state = makeState();
    state.servers = {
      5: { id: 5, name: "Workspace", created_by: 1, inserted_at: "2026-06-30T10:00:00Z" },
    };
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    const { rerender } = render(
      <Sidebar serverPanel={<button type="button" data-testid="panel-control">Panel control</button>} />,
    );
    const serverRow = screen.getByTestId("sidebar-item-server-5");
    fireEvent.click(serverRow);
    rerender(
      <Sidebar isServerMode serverPanel={<button type="button" data-testid="panel-control">Panel control</button>} />,
    );
    screen.getByTestId("panel-control").focus();

    rerender(
      <Sidebar serverPanel={<button type="button" data-testid="panel-control">Panel control</button>} />,
    );

    const overlay = document.querySelector<HTMLElement>(".vt-channel-panel-overlay");
    expect(document.activeElement).toBe(serverRow);
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveAttribute("inert", "");
    expect(overlay?.contains(document.activeElement)).toBe(false);
  });

  it("keeps one open overlay shell while switching server content", () => {
    const state = makeState();
    state.servers = {
      5: { id: 5, name: "First", created_by: 1, inserted_at: "2026-06-30T10:00:00Z" },
      6: { id: 6, name: "Second", created_by: 1, inserted_at: "2026-06-30T10:00:00Z" },
    };
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    const { rerender } = render(
      <Sidebar isServerMode serverPanel={<div data-testid="panel-shell"><span data-testid="server-content">First</span></div>} />,
    );
    const overlay = document.querySelector(".vt-channel-panel-overlay");
    const panel = screen.getByTestId("panel-shell");

    rerender(
      <Sidebar isServerMode serverPanel={<div data-testid="panel-shell"><span data-testid="server-content">Second</span></div>} />,
    );

    expect(document.querySelector(".vt-channel-panel-overlay")).toBe(overlay);
    expect(screen.getByTestId("panel-shell")).toBe(panel);
    expect(screen.getByTestId("server-content")).toHaveTextContent("Second");
    expect(overlay).toHaveAttribute("data-state", "open");
  });

  it("opens a normal chat directly from the visible avatar column while server mode is open", () => {
    const state = makeState();
    state.servers = {
      5: { id: 5, name: "Workspace", created_by: 1, inserted_at: "2026-06-30T10:00:00Z" },
    };
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    const panel = <div data-testid="stable-server-panel" />;
    const { rerender } = render(<Sidebar serverPanel={panel} />);
    const serverRow = screen.getByTestId("sidebar-item-server-5");
    const list = screen.getByTestId("sidebar-item-direct-2").closest("div.overflow-y-auto");
    const search = screen.getByTestId("user-search");
    const avatar = screen.getByTestId("sidebar-item-direct-2").querySelector('[data-slot="avatar"]');

    fireEvent.click(serverRow);
    expect(state.setActiveChat).toHaveBeenCalledWith({
      type: "server",
      serverId: 5,
      serverRef: 5,
    });
    rerender(<Sidebar isServerMode serverPanel={panel} />);
    expect(document.querySelector(".vt-channel-panel-overlay")).toHaveAttribute("data-state", "open");

    fireEvent.click(avatar!);
    expect(state.setActiveChat).toHaveBeenCalledWith({
      type: "direct",
      partnerId: 2,
      partnerRef: "user-public-id",
    });

    rerender(<Sidebar serverPanel={panel} />);
    expect(document.querySelector(".vt-channel-panel-overlay")).toHaveAttribute("data-state", "closed");
    expect(document.querySelector("div.overflow-y-auto")).toBe(list);
    expect(screen.getByTestId("user-search")).toBe(search);
    expect(screen.getByTestId("sidebar-item-direct-2").querySelector('[data-slot="avatar"]')).toBe(avatar);
  });

  it("moves focus before applying hidden or inert overlay attributes", async () => {
    const state = makeState();
    state.servers = {
      5: { id: 5, name: "Workspace", created_by: 1, inserted_at: "2026-06-30T10:00:00Z" },
    };
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    const { rerender } = render(
      <Sidebar serverPanel={<button type="button" data-testid="panel-control">Panel control</button>} />,
    );
    const serverRow = screen.getByTestId("sidebar-item-server-5");
    rerender(
      <Sidebar isServerMode serverPanel={<button type="button" data-testid="panel-control">Panel control</button>} />,
    );
    const overlay = document.querySelector<HTMLElement>(".vt-channel-panel-overlay")!;
    screen.getByTestId("panel-control").focus();

    const invalidMutations: string[] = [];
    const hiddenMutations: string[] = [];
    const originalSetAttribute = HTMLElement.prototype.setAttribute;
    const setAttributeSpy = vi.spyOn(HTMLElement.prototype, "setAttribute").mockImplementation(function (this: HTMLElement, name, value) {
      if (this === overlay && ((name === "aria-hidden" && value === "true") || name === "inert")) {
        hiddenMutations.push(name);
        if (overlay.contains(document.activeElement)) invalidMutations.push(name);
      }
      originalSetAttribute.call(this, name, value);
    });

    try {
      rerender(
        <Sidebar serverPanel={<button type="button" data-testid="panel-control">Panel control</button>} />,
      );
      await act(async () => {
        await Promise.resolve();
      });
    } finally {
      setAttributeSpy.mockRestore();
    }

    expect(hiddenMutations).toHaveLength(2);
    expect(hiddenMutations).toEqual(expect.arrayContaining(["aria-hidden", "inert"]));
    expect(invalidMutations).toEqual([]);
    expect(document.activeElement).toBe(serverRow);
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveAttribute("inert", "");
  });

  it("switches between real ChannelPanel instances without closing the overlay", async () => {
    const state = makeState();
    state.servers = {
      5: { id: 5, name: "First", created_by: 1, inserted_at: "2026-06-30T10:00:00Z" },
      6: { id: 6, name: "Second", created_by: 1, inserted_at: "2026-06-30T10:00:00Z" },
    };
    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    const { rerender } = render(
      <Sidebar
        isServerMode
        serverPanel={<ChannelPanel serverId={5} />}
      />,
    );
    const list = screen.getByTestId("sidebar-item-direct-2").closest("div.overflow-y-auto");
    const search = screen.getByTestId("user-search");
    const avatar = screen.getByTestId("sidebar-item-server-5").querySelector('[data-slot="avatar"]');
    const overlay = document.querySelector<HTMLElement>(".vt-channel-panel-overlay")!;
    const panel = screen.getByTestId("channel-panel");
    const mutations: Array<{ state: string | null; hidden: string | null; inert: boolean }> = [];
    const observer = new MutationObserver(() => {
      mutations.push({
        state: overlay.getAttribute("data-state"),
        hidden: overlay.getAttribute("aria-hidden"),
        inert: overlay.hasAttribute("inert"),
      });
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ["data-state", "aria-hidden", "inert"] });

    try {
      await act(async () => {
        rerender(
          <Sidebar
            isServerMode
            serverPanel={<ChannelPanel serverId={6} />}
          />,
        );
        await Promise.resolve();
      });
    } finally {
      observer.disconnect();
    }

    expect(document.querySelector(".vt-channel-panel-overlay")).toBe(overlay);
    expect(screen.getByTestId("channel-panel")).toBe(panel);
    expect(panel).toHaveTextContent("Second");
    expect(mutations.every(({ state, hidden, inert }) => state !== "closed" && hidden !== "true" && !inert)).toBe(true);
    expect(document.querySelector("div.overflow-y-auto")).toBe(list);
    expect(screen.getByTestId("user-search")).toBe(search);
    expect(screen.getByTestId("sidebar-item-server-5").querySelector('[data-slot="avatar"]')).toBe(avatar);
  });

  it("keeps unread badges compact and visible in collapsed and server modes", async () => {
    const state = makeState();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) => selector(state),
    );

    const { rerender } = render(<Sidebar isCollapsed />);
    const collapsedBadge = screen.getByText("1");
    expect(collapsedBadge).toHaveClass("min-w-5", "rounded-full");

    rerender(<Sidebar isServerMode />);
    const serverBadge = screen.getByText("1");
    expect(serverBadge).toHaveClass("min-w-5", "rounded-full");
  });

  it("uses measured geometry for regular conversation content", async () => {
    const state = makeState();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    render(<Sidebar />);

    const directRow = await screen.findByTestId("sidebar-item-direct-2");
    const textColumn = directRow.querySelector(".relative.h-full.min-w-0.flex-1");

    expect(directRow).toHaveClass("h-[62px]", "gap-[11px]", "px-[10px]");
    expect(directRow).not.toHaveClass("absolute");
    expect(directRow.querySelector('[data-slot="avatar"]')).toHaveClass("h-[46px]", "w-[46px]");
    expect(textColumn).toBeInTheDocument();
    expect(textColumn).toHaveClass("relative", "h-full", "min-w-0", "flex-1");
    expect(textColumn?.querySelector(".top-\\[14px\\].truncate"))
      .toHaveClass("left-0", "right-12");
    expect(textColumn?.querySelector(".top-\\[14px\\].text-\\[11px\\]"))
      .toHaveClass("right-[10px]");
    expect(textColumn?.querySelector(".top-\\[34px\\]"))
      .toHaveClass("left-0", "right-[10px]", "h-[18px]");
  });
});
