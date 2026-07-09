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

  it("renders cleaned sidebar header controls without changing behavior", async () => {
    const state = makeState();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    render(<Sidebar />);

    await waitFor(() => {
      expect(getListMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByTestId("user-search")).toBeInTheDocument();

    const newButton = screen.getByRole("button", { name: "New" });
    expect(newButton).toHaveClass("rounded-md");
    fireEvent.click(newButton);
    expect(state.openModal).toHaveBeenCalledWith("CREATE_PICKER");
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
    expect(directRow).toHaveClass("rounded-[12px]");
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

  it("renders server section controls and preserves server navigation", async () => {
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

    expect(await screen.findByText("Servers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create server" }));
    expect(state.openModal).toHaveBeenCalledWith("CREATE_SERVER");

    fireEvent.click(screen.getByRole("button", { name: /Workspace/ }));
    expect(state.setActiveChat).toHaveBeenCalledWith({
      type: "server",
      serverId: 5,
      serverRef: 5,
    });
  });
});
