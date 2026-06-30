import { render, screen, waitFor } from "@testing-library/react";
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
  UserSearch: () => <div data-testid="user-search" />,
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
    activeChat: null,
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
});
