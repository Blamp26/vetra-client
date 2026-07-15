import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "@/shared/types";

const { useAppStoreMock, useServerMembersMock, useUserSearchMock, removeMemberApiMock, deleteServerMock, getListMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  useServerMembersMock: vi.fn(),
  useUserSearchMock: vi.fn(),
  removeMemberApiMock: vi.fn(),
  deleteServerMock: vi.fn(),
  getListMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
  getState: () => ({ activeChat: null }),
}));

vi.mock("@/features/messaging/hooks/useServerMembers", () => ({
  useServerMembers: (server: Server) => useServerMembersMock(server),
}));

vi.mock("@/features/messaging/hooks/useUserSearch", () => ({
  useUserSearch: () => useUserSearchMock(),
}));

vi.mock("@/api/servers", () => ({
  serversApi: {
    removeMember: removeMemberApiMock,
    getList: getListMock,
    delete: deleteServerMock,
  },
}));

vi.mock("@/shared/components/ConfirmModal", () => ({
  ConfirmModal: ({ title, confirmLabel, onConfirm, onCancel, isLoading }: {
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
  }) => (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="button" disabled={isLoading} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  ),
}));

vi.mock("@/shared/components/Avatar", () => ({
  Avatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

import { ServerSettingsModal } from "./ServerSettingsModal";

const server = {
  id: 7,
  name: "Vetra Team",
  created_by: 1,
} as Server;

describe("ServerSettingsModal tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({
      currentUser: { id: 1, username: "owner" },
      setActiveChat: vi.fn(),
      setServers: vi.fn(),
    }));
    useUserSearchMock.mockReturnValue({
      query: "",
      setQuery: vi.fn(),
      searchResults: { users: [] },
      isSearching: false,
      clearSearch: vi.fn(),
    });
    useServerMembersMock.mockReturnValue({
      members: [{ user_id: 2, username: "member", display_name: "Member", is_owner: false }],
      isLoading: false,
      error: null,
      addMember: vi.fn(),
      removeMember: vi.fn(),
    });
    removeMemberApiMock.mockResolvedValue(undefined);
    deleteServerMock.mockResolvedValue(undefined);
    getListMock.mockResolvedValue([]);
  });

  it("exposes horizontal Members and Danger Zone tabs with connected panels", () => {
    render(<ServerSettingsModal server={server} onClose={vi.fn()} />);

    expect(screen.getByRole("tablist", { name: "Server settings sections" })).toHaveAttribute("aria-orientation", "horizontal");
    const members = screen.getByRole("tab", { name: "Members" });
    const danger = screen.getByRole("tab", { name: "Danger Zone" });
    expect(members).toHaveAttribute("aria-selected", "true");
    expect(members).toHaveAttribute("aria-controls", expect.any(String));
    expect(document.getElementById(members.getAttribute("aria-controls")!)).toBeInTheDocument();
    expect(document.getElementById(danger.getAttribute("aria-controls")!)).toBeInTheDocument();
    expect(screen.queryByText("Server Members")).not.toBeInTheDocument();
    expect(screen.queryByText("Permanent deletion of all data.")).not.toBeInTheDocument();
  });

  it("uses a named dialog, focuses Members, and labels the close control", () => {
    render(<ServerSettingsModal server={server} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Vetra Team settings" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Vetra Team settings" })).toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Members" }));
    expect(screen.getByRole("button", { name: "Close server settings" })).toBeInTheDocument();
  });

  it("closes through the shared close control and Escape", () => {
    const onClose = vi.fn();
    render(<ServerSettingsModal server={server} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close server settings" }));
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Vetra Team settings" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("switches panels with arrows, Home, End, and click without invoking mutations", () => {
    const onClose = vi.fn();
    render(<ServerSettingsModal server={server} onClose={onClose} />);
    const members = screen.getByRole("tab", { name: "Members" });
    const danger = screen.getByRole("tab", { name: "Danger Zone" });

    fireEvent.keyDown(members, { key: "ArrowRight" });
    expect(danger).toHaveFocus();
    expect(danger).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Permanent deletion of all data.")).toBeInTheDocument();
    expect(screen.queryByText("Server Members")).not.toBeInTheDocument();

    fireEvent.keyDown(danger, { key: "Home" });
    expect(members).toHaveFocus();
    fireEvent.click(danger);
    fireEvent.keyDown(danger, { key: "End" });
    expect(danger).toHaveFocus();
    fireEvent.keyDown(danger, { key: "ArrowLeft" });
    expect(members).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses the invite-member combobox without closing the dialog on its first Escape", async () => {
    const addMember = vi.fn().mockResolvedValue(undefined);
    const invitedUser = { id: 12, public_id: "user-12", username: "alex", display_name: "Alex" };
    useUserSearchMock.mockReturnValue({
      query: "",
      setQuery: vi.fn(),
      searchResults: { users: [invitedUser] },
      isSearching: false,
      clearSearch: vi.fn(),
    });
    useServerMembersMock.mockReturnValue({
      members: [],
      isLoading: false,
      error: null,
      addMember,
      removeMember: vi.fn(),
    });

    const onClose = vi.fn();
    render(<ServerSettingsModal server={server} onClose={onClose} />);
    const input = screen.getByRole("combobox", { name: "Invite Member" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Alex/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Vetra Team settings" })).toBeInTheDocument();
    expect(addMember).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(addMember).toHaveBeenCalledWith("user-12"));
    expect(addMember).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps loading and member-load failure states distinct and accessible", () => {
    useServerMembersMock.mockReturnValue({
      members: undefined,
      isLoading: true,
      error: "Could not load members",
      addMember: vi.fn(),
      removeMember: vi.fn(),
    });

    render(<ServerSettingsModal server={server} onClose={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load members");
  });

  it("keeps Kick discoverable, permission-gated, and confirmation-backed", async () => {
    const removeMember = vi.fn().mockResolvedValue(undefined);
    useServerMembersMock.mockReturnValue({
      members: [
        { user_id: 1, username: "owner", display_name: "Owner", is_owner: true },
        { user_id: 2, username: "member", display_name: "Member", is_owner: false },
      ],
      isLoading: false,
      error: null,
      addMember: vi.fn(),
      removeMember,
    });

    render(<ServerSettingsModal server={server} onClose={vi.fn()} />);

    expect(screen.getAllByText("Owner").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("@member")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kick Member" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kick Owner" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Kick Member" }));
    expect(screen.getByRole("dialog", { name: "Kick Member" })).toBeInTheDocument();
    expect(removeMember).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Kick" }));
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith(2));
  });

  it("shows the owner Delete flow without a repeated Danger Zone heading", async () => {
    const onClose = vi.fn();
    render(<ServerSettingsModal server={server} onClose={onClose} />);
    fireEvent.click(screen.getByRole("tab", { name: "Danger Zone" }));

    expect(screen.getAllByText("Danger Zone")).toHaveLength(1);
    expect(screen.getByText("Delete Server")).toBeInTheDocument();
    expect(screen.getByText("Permanent deletion of all data.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirmation = screen.getByRole("dialog", { name: "Delete Server" });
    expect(confirmation).toBeInTheDocument();

    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteServerMock).toHaveBeenCalledWith(7));
    expect(getListMock).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the non-owner Leave flow and preserves its server mutation", async () => {
    const onClose = vi.fn();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({
      currentUser: { id: 2, username: "member" },
      setActiveChat: vi.fn(),
      setServers: vi.fn(),
    }));
    render(<ServerSettingsModal server={server} onClose={onClose} />);
    fireEvent.click(screen.getByRole("tab", { name: "Danger Zone" }));

    expect(screen.getByText("Leave Server")).toBeInTheDocument();
    expect(screen.getByText("Lose access to all channels.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    const confirmation = screen.getByRole("dialog", { name: "Leave Server" });
    expect(confirmation).toBeInTheDocument();

    fireEvent.click(within(confirmation).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(removeMemberApiMock).toHaveBeenCalledWith(7, 2));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
