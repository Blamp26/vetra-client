import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { addMember, searchUsers } = vi.hoisted(() => ({
  addMember: vi.fn(),
  searchUsers: vi.fn(),
}));

vi.mock("@/api/rooms", () => ({ roomsApi: { addMember } }));
vi.mock("@/api/auth", () => ({ authApi: { searchUsers } }));

import { GroupMemberPicker } from "./GroupMemberPicker";

const existingUser = {
  id: 2,
  username: "existing",
  display_name: "Existing Member",
  avatar_url: null,
  bio: null,
  status: "offline",
  last_seen_at: null,
};

const newUser = {
  id: 9,
  username: "new-user",
  display_name: "New User",
  avatar_url: null,
  bio: null,
  status: "offline",
  last_seen_at: null,
};

describe("GroupMemberPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchUsers.mockResolvedValue({ users: [], servers: [] });
    addMember.mockResolvedValue(undefined);
  });

  it("uses one clipped panel and one flexible result scroll region", () => {
    render(<GroupMemberPicker roomRef="room-seven" existingMemberIds={new Set()} onAdded={vi.fn()} onClose={vi.fn()} />);

    const panel = screen.getByTestId("dialog-panel");
    const search = screen.getByTestId("group-member-picker-search");
    const results = screen.getByTestId("group-member-picker-results");
    expect(panel).toHaveClass("max-w-[360px]", "max-h-[calc(100dvh-32px)]", "overflow-hidden", "flex-col");
    expect(results).toHaveClass("min-h-32", "flex-1", "overflow-y-auto", "overflow-x-hidden", "px-5");
    expect(results).not.toContainElement(screen.getByRole("heading", { name: "Add member" }));
    expect(results).not.toContainElement(search);
    expect(screen.getByRole("status")).toHaveTextContent("Enter at least 2 characters");
    expect(screen.queryByText(/selected|invite link/i)).not.toBeInTheDocument();
    expect(document.querySelector("footer")).toBeNull();
  });

  it("filters existing members and immediately adds one normalized person-row result", async () => {
    let resolveAdd!: () => void;
    addMember.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveAdd = resolve; }));
    searchUsers.mockResolvedValue({ users: [existingUser, newUser], servers: [] });
    const onAdded = vi.fn();
    const onClose = vi.fn();
    render(<GroupMemberPicker roomRef="room-seven" existingMemberIds={new Set([2])} onAdded={onAdded} onClose={onClose} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search users to add" }), { target: { value: "new" } });
    const result = await screen.findByRole("button", { name: "New User @new-user" });
    expect(screen.queryByText("Existing Member")).not.toBeInTheDocument();
    expect(result).toHaveClass("min-h-14", "gap-3", "px-3");
    expect(result.querySelector('[data-slot="avatar"]')).toHaveClass("h-10", "w-10");
    expect(screen.getByText("New User")).toBeInTheDocument();
    expect(screen.getByText("@new-user")).toBeInTheDocument();

    fireEvent.click(result);
    expect(addMember).toHaveBeenCalledWith("room-seven", 9);
    expect(result).toBeDisabled();
    fireEvent.click(result);
    expect(addMember).toHaveBeenCalledTimes(1);
    resolveAdd();
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps loading, error, filtered-empty, and no-results states reachable", async () => {
    let resolveSearch!: (value: { users: Array<typeof newUser>; servers: never[] }) => void;
    searchUsers.mockImplementationOnce(() => new Promise((resolve) => { resolveSearch = resolve; }));
    const { unmount } = render(<GroupMemberPicker roomRef={7} existingMemberIds={new Set()} onAdded={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search users to add" }), { target: { value: "new" } });
    expect(screen.getByRole("status")).toHaveTextContent("Searching");
    await waitFor(() => expect(searchUsers).toHaveBeenCalledWith("new"));
    resolveSearch({ users: [newUser], servers: [] });
    await screen.findByRole("button", { name: "New User @new-user" });
    unmount();

    searchUsers.mockRejectedValueOnce(new Error("Search unavailable"));
    const errorRender = render(<GroupMemberPicker roomRef={7} existingMemberIds={new Set()} onAdded={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search users to add" }), { target: { value: "fail" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Search unavailable");
    errorRender.unmount();

    searchUsers.mockResolvedValueOnce({ users: [existingUser], servers: [] });
    render(<GroupMemberPicker roomRef={7} existingMemberIds={new Set([2])} onAdded={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search users to add" }), { target: { value: "existing" } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No users found"));
  });

  it("closes through the existing header and Dialog backdrop paths", () => {
    const onClose = vi.fn();
    render(<GroupMemberPicker roomRef={7} existingMemberIds={new Set()} onAdded={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close add member" }));
    fireEvent.mouseDown(screen.getByTestId("dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
