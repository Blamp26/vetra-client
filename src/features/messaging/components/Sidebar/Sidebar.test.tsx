import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, getListMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  getListMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

vi.mock("@/api/servers", () => ({
  serversApi: {
    getList: getListMock,
  },
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
    expect(directRow).toHaveClass("bg-accent");
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

  it("uses Telegram row, avatar, text, and search measurements", async () => {
    const state = makeState();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    render(<Sidebar />);

    const directRow = await screen.findByTestId("sidebar-item-direct-2");
    const search = screen.getByTestId("user-search");

    const searchRow = search.parentElement?.parentElement;
    const avatar = directRow.querySelector('[data-slot="avatar"]');
    const textColumn = directRow.querySelector(".absolute.inset-y-0.left-\\[71px\\]");

    expect(searchRow).toHaveClass("h-[54px]", "px-[11px]", "pt-[9px]");
    expect(searchRow).not.toHaveClass("border-b");
    expect(directRow).toHaveClass("h-[62px]", "pl-[10px]");
    expect(directRow).not.toHaveClass("border-b");
    expect(avatar).toHaveClass("left-[10px]", "top-[8px]", "h-[46px]", "w-[46px]");
    expect(textColumn).toHaveClass("left-[71px]", "right-[10px]");

    expect(directRow.querySelector(".top-\\[14px\\].truncate")).toHaveTextContent("Alice");
    expect(directRow.querySelector(".top-\\[14px\\].text-\\[11px\\]")).toBeInTheDocument();
    expect(directRow.querySelector(".top-\\[40px\\]")).toHaveTextContent("Photo");
  });
});
