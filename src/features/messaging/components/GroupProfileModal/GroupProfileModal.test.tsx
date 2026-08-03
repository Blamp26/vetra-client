import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupProfileModal } from "./GroupProfileModal";

const { governanceMembers, governance, addMember, searchUsers, governanceHandler, socketManager } = vi.hoisted(() => {
  const handler = { current: null as null | ((event: { room_id: number }) => void) };
  return {
    governanceMembers: vi.fn(),
    governance: vi.fn(),
    addMember: vi.fn(),
    searchUsers: vi.fn(),
    governanceHandler: handler,
    socketManager: {
      onGroupGovernanceChanged: (next: (event: { room_id: number }) => void) => {
        handler.current = next;
        return () => { handler.current = null; };
      },
    },
  };
});

vi.mock("@/api/rooms", () => ({
  roomsApi: { governanceMembers, governance, addMember },
}));

vi.mock("@/api/auth", () => ({ authApi: { searchUsers } }));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector({ socketManager }),
}));

const room = {
  id: 7,
  public_id: "room-seven",
  name: "Project Seven",
  created_by: 1,
  server_id: null,
  inserted_at: "2026-07-01T00:00:00Z",
  unread_count: 0,
  last_message_at: null,
  last_message: null,
  members: [],
};

const members = [
  { id: 1, username: "owner", display_name: "Ada Owner", role: "owner", admin_permissions: [], allow_permissions: [], deny_permissions: [] },
  { id: 2, username: "bob", display_name: "Bob Builder", role: "member", admin_permissions: [], allow_permissions: [], deny_permissions: [] },
  { id: 3, username: "carol", display_name: null, role: "admin", admin_permissions: [], allow_permissions: [], deny_permissions: [] },
] as const;

describe("GroupProfileModal", () => {
  beforeEach(() => {
    governanceMembers.mockReset();
    governance.mockReset();
    addMember.mockReset();
    searchUsers.mockReset();
    governanceHandler.current = null;
    governanceMembers.mockResolvedValue([...members]);
    governance.mockResolvedValue({ role: "member", capabilities: [], defaults: [], members: [...members] });
    addMember.mockResolvedValue(undefined);
    searchUsers.mockResolvedValue({ users: [], servers: [] });
  });

  it("renders real identity, member count, roles, and only the supported search action", async () => {
    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    const profileHeader = screen.getByTestId("group-profile-header");
    expect(screen.getByRole("dialog", { name: "Project Seven" })).toBeInTheDocument();
    expect(profileHeader.className).toContain("pt-6");
    expect(profileHeader.className).toContain("pb-4");
    expect(screen.getByTestId("group-profile-section-separator")).toHaveClass("h-2");
    expect(screen.getByText("Project Seven")).toBeInTheDocument();
    expect(await screen.findByText("3 members")).toBeInTheDocument();
    expect(screen.getByText("Ada Owner")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    const actions = screen.getByRole("group", { name: "Group actions" });
    expect(actions).toHaveClass("gap-[10px]");
    expect(actions).not.toHaveClass("gap-2");
    expect(screen.getByRole("button", { name: "Search" })).toHaveClass("h-[52px]", "flex-1");
    expect(screen.getByTestId("group-management-frame")).toHaveAttribute("data-group-management-frame", "profile");
    expect(screen.getByTestId("group-profile-member-list")).toHaveClass("overflow-y-auto", "min-h-0");
    expect(screen.getByText("Ada Owner").closest("li")).toHaveClass("min-h-[62px]", "px-5");
    expect(screen.getByText("Ada Owner").closest("li")?.querySelector('[data-slot="avatar"]')).toHaveClass("h-11", "w-11");
    expect(screen.queryByRole("button", { name: /mute|leave|media/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/description|photos|videos|media/i)).not.toBeInTheDocument();
  });

  it("shows member tags and administrator titles without replacing identity or role", async () => {
    governanceMembers.mockResolvedValue([
      members[0],
      { ...members[1], member_tag: "Helper" },
      { ...members[2], admin_title: "Lead moderator" },
    ]);
    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    expect(await screen.findByText(/@bob · Helper/)).toBeInTheDocument();
    expect(screen.getByText(/@carol · Lead moderator/)).toBeInTheDocument();
    expect(screen.getByText("Bob Builder")).toBeInTheDocument();
    expect(screen.getByLabelText("admin role")).toBeInTheDocument();
  });

  it("filters members case-insensitively, clears, and reports no results", async () => {
    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    const input = await screen.findByRole("textbox", { name: "Search group members" });
    await screen.findByText("Bob Builder");
    fireEvent.change(input, { target: { value: "  BUILDER " } });
    expect(screen.getByText("Bob Builder")).toBeInTheDocument();
    expect(screen.queryByText("Ada Owner")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "missing" } });
    expect(screen.getByRole("status")).toHaveTextContent("No members match");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Ada Owner")).toBeInTheDocument();
  });

  it("supports loading, recoverable error, retry, and ignores stale requests", async () => {
    let resolveFirst!: (value: typeof members) => void;
    governanceMembers.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    governanceMembers.mockRejectedValueOnce(new Error("temporary failure"));
    const { unmount } = render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading members");
    unmount();
    resolveFirst([...members]);
    await waitFor(() => expect(governanceMembers).toHaveBeenCalledTimes(1));

    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("temporary failure");
    governanceMembers.mockResolvedValueOnce([...members]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Bob Builder")).toBeInTheDocument();
  });

  it("closes from the close button and action callback", async () => {
    const onClose = vi.fn();
    const onSearchMessages = vi.fn();
    render(<GroupProfileModal room={room} onClose={onClose} onSearchMessages={onSearchMessages} />);
    await screen.findByText("Bob Builder");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSearchMessages).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Close group profile" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("inherits Escape and backdrop dismissal from the shared dialog", async () => {
    const onClose = vi.fn();
    render(<GroupProfileModal room={room} onClose={onClose} onSearchMessages={vi.fn()} />);
    await screen.findByText("Bob Builder");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.mouseDown(screen.getByTestId("dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows owner controls only after governance resolves and uses role badges", async () => {
    governance.mockResolvedValue({ role: "owner", capabilities: [], action_capabilities: { add_users: true, manage_member_permissions: true }, defaults: [], members: [...members] });
    const onManage = vi.fn();
    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} onManage={onManage} />);
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Manage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add member" })).toBeInTheDocument();
    expect(screen.getByLabelText("owner role")).toBeInTheDocument();
    expect(screen.getByLabelText("admin role")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Group actions" }).className).toContain("gap-[10px]");
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(onManage).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Mute|Call/ })).not.toBeInTheDocument();
  });

  it("uses effective admin capabilities and keeps ordinary members restrained", async () => {
    governance.mockResolvedValue({ role: "admin", capabilities: ["invite_members"], action_capabilities: { add_users: true, manage_member_permissions: false }, defaults: [], members: [...members] });
    const { rerender } = render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Add member" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    governance.mockResolvedValue({ role: "member", capabilities: [], defaults: [], members: [...members] });
    rerender(<GroupProfileModal room={{ ...room, id: 8 }} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
  });

  it("removes member-add access immediately after authoritative governance reconciliation", async () => {
    governance
      .mockResolvedValueOnce({ role: "admin", capabilities: [], action_capabilities: { add_users: true }, defaults: [], members: [...members] })
      .mockResolvedValueOnce({ role: "admin", capabilities: [], action_capabilities: { add_users: false }, defaults: [], members: [...members] });
    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Add member" })).toBeInTheDocument();

    act(() => governanceHandler.current?.({ room_id: room.id }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument());
  });

  it("opens the nested multi-select picker, keeps the profile mounted and inert, then refreshes after explicit Add", async () => {
    searchUsers.mockResolvedValue({ users: [{ id: 9, username: "new-user", display_name: "New User", avatar_url: null, bio: null, status: "offline", last_seen_at: null }], servers: [] });
    governance.mockResolvedValue({ role: "owner", capabilities: [], action_capabilities: { add_users: true, manage_member_permissions: true }, defaults: [], members: [...members] });
    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add member" }));
    const dialogs = screen.getAllByRole("dialog", { hidden: true });
    expect(dialogs).toHaveLength(2);
    expect(dialogs.find((dialog) => dialog.getAttribute("aria-hidden") === "true")).toHaveStyle({ pointerEvents: "none" });
    expect(screen.getByRole("dialog", { name: "Add members" })).not.toHaveAttribute("aria-hidden");
    fireEvent.change(screen.getByRole("textbox", { name: "Search users to add" }), { target: { value: "new" } });
    fireEvent.click(await screen.findByRole("button", { name: /New User/ }));
    expect(addMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(addMember).toHaveBeenCalledWith("room-seven", 9));
    expect(governanceMembers.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("cancels the nested picker without membership mutation and restores focus to Add member", async () => {
    governance.mockResolvedValue({ role: "owner", capabilities: [], action_capabilities: { add_users: true, manage_member_permissions: true }, defaults: [], members: [...members] });
    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    const opener = await screen.findByRole("button", { name: "Add member" });
    fireEvent.click(opener);
    expect(screen.getByRole("textbox", { name: "Search users to add" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(addMember).not.toHaveBeenCalled();
  });

  it("delegates Manage without mounting a second dialog owner", async () => {
    governance.mockResolvedValue({ role: "owner", capabilities: [], action_capabilities: { add_users: true, manage_member_permissions: true }, defaults: [], members: [...members] });
    const onManage = vi.fn();
    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} onManage={onManage} />);
    const manage = await screen.findByRole("button", { name: "Manage" });
    fireEvent.click(manage);
    expect(onManage).toHaveBeenCalledOnce();
    expect(screen.getAllByTestId("dialog-overlay")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Project Seven" })).toBeInTheDocument();
  });
});
