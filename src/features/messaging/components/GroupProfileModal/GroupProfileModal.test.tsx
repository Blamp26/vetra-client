import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupProfileModal } from "./GroupProfileModal";

const { governanceMembers, governance, addMember, searchUsers } = vi.hoisted(() => ({ governanceMembers: vi.fn(), governance: vi.fn(), addMember: vi.fn(), searchUsers: vi.fn() }));

vi.mock("@/api/rooms", () => ({
  roomsApi: { governanceMembers, governance, addMember },
}));

vi.mock("@/api/auth", () => ({ authApi: { searchUsers } }));

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
    expect(actions.className).toContain("justify-center");
    expect(actions.className).toContain("gap-2");
    expect(screen.getByRole("button", { name: "Search" })).toHaveClass("h-[52px]", "w-[81px]");
    expect(screen.queryByRole("button", { name: /mute|leave|media/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/description|photos|videos|media/i)).not.toBeInTheDocument();
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
    governance.mockResolvedValue({ role: "owner", capabilities: [], defaults: [], members: [...members] });
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
    governance.mockResolvedValue({ role: "admin", capabilities: ["invite_members"], defaults: [], members: [...members] });
    const { rerender } = render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Add member" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    governance.mockResolvedValue({ role: "member", capabilities: [], defaults: [], members: [...members] });
    rerender(<GroupProfileModal room={{ ...room, id: 8 }} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
  });

  it("adds a user through the real search and room member APIs, then refreshes members", async () => {
    searchUsers.mockResolvedValue({ users: [{ id: 9, username: "new-user", display_name: "New User", avatar_url: null, bio: null, status: "offline", last_seen_at: null }], servers: [] });
    governance.mockResolvedValue({ role: "owner", capabilities: [], defaults: [], members: [...members] });
    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add member" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search users to add" }), { target: { value: "new" } });
    fireEvent.click(await screen.findByRole("button", { name: /New User/ }));
    await waitFor(() => expect(addMember).toHaveBeenCalledWith("room-seven", 9));
    expect(governanceMembers.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("delegates Manage without mounting a second dialog owner", async () => {
    governance.mockResolvedValue({ role: "owner", capabilities: [], defaults: [], members: [...members] });
    const onManage = vi.fn();
    render(<GroupProfileModal room={room} onClose={vi.fn()} onSearchMessages={vi.fn()} onManage={onManage} />);
    const manage = await screen.findByRole("button", { name: "Manage" });
    fireEvent.click(manage);
    expect(onManage).toHaveBeenCalledOnce();
    expect(screen.getAllByTestId("dialog-overlay")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Project Seven" })).toBeInTheDocument();
  });
});
