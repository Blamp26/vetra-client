import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/base";

const { addMember, searchUsers } = vi.hoisted(() => ({
  addMember: vi.fn(),
  searchUsers: vi.fn(),
}));

vi.mock("@/api/rooms", () => ({ roomsApi: { addMember } }));
vi.mock("@/api/auth", () => ({ authApi: { searchUsers } }));

import { GroupMemberPicker } from "./GroupMemberPicker";

const existingUser = { id: 2, username: "existing", display_name: "Existing Member", avatar_url: null, bio: null, status: "offline", last_seen_at: null };
const newUser = { id: 9, username: "new-user", display_name: "New User", avatar_url: null, bio: null, status: "offline", last_seen_at: null };
const secondUser = { id: 10, username: "second-user", display_name: "Second User", avatar_url: null, bio: null, status: "offline", last_seen_at: null };
const thirdUser = { id: 11, username: "third-user", display_name: "Third User", avatar_url: null, bio: null, status: "offline", last_seen_at: null };

const governanceMember = (user: typeof newUser) => ({
  id: user.id,
  username: user.username,
  display_name: user.display_name,
  role: "member" as const,
  admin_permissions: [],
  allow_permissions: [],
  deny_permissions: [],
});

function renderPicker(overrides: Partial<ComponentProps<typeof GroupMemberPicker>> = {}) {
  const props = {
    roomRef: "room-seven",
    existingMemberIds: new Set<number>(),
    onMembershipRefresh: vi.fn().mockResolvedValue([]),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<GroupMemberPicker {...props} />);
  return props;
}

async function searchFor(query: string, users: Array<typeof newUser>) {
  searchUsers.mockResolvedValueOnce({ users, servers: [] });
  fireEvent.change(screen.getByRole("textbox", { name: "Search users to add" }), { target: { value: query } });
  await waitFor(() => expect(searchUsers).toHaveBeenLastCalledWith(query));
}

describe("GroupMemberPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchUsers.mockResolvedValue({ users: [], servers: [] });
    addMember.mockResolvedValue(undefined);
  });

  it("uses the existing bounded dialog layout with explicit disabled actions and no deferred controls", () => {
    renderPicker();
    expect(screen.getByTestId("dialog-panel")).toHaveClass("max-w-[360px]", "max-h-[calc(100dvh-32px)]", "overflow-hidden", "flex-col");
    expect(screen.getByTestId("group-member-picker-results")).toHaveClass("min-h-32", "flex-1", "overflow-y-auto");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.queryByText(/invite link|history/i)).not.toBeInTheDocument();
  });

  it("excludes existing members and reports safe search states", async () => {
    renderPicker({ existingMemberIds: new Set([2]) });
    await searchFor("people", [existingUser, newUser]);
    expect(await screen.findByRole("button", { name: "New User @new-user" })).toBeInTheDocument();
    expect(screen.queryByText("Existing Member")).not.toBeInTheDocument();

    searchUsers.mockRejectedValueOnce(new Error("raw internal detail"));
    fireEvent.change(screen.getByRole("textbox", { name: "Search users to add" }), { target: { value: "failure" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not search users. Please try again.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("raw internal detail");
  });

  it("selects multiple users without mutation, preserves selection across queries, prevents duplicates, and removes chips", async () => {
    renderPicker();
    await searchFor("first", [newUser, secondUser]);
    fireEvent.click(await screen.findByRole("button", { name: "New User @new-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Second User @second-user" }));
    expect(addMember).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Selected members")).toHaveTextContent("New User");
    expect(screen.getByLabelText("Selected members")).toHaveTextContent("Second User");

    await searchFor("second", [secondUser]);
    expect(screen.getByLabelText("Selected members")).toHaveTextContent("New User");
    fireEvent.click(screen.getByRole("button", { name: "Second User @second-user" }));
    expect(screen.queryByRole("button", { name: "Remove Second User" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Second User @second-user" }));
    expect(screen.getAllByRole("button", { name: "Remove Second User" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove New User" }));
    expect(screen.queryByRole("button", { name: "Remove New User" })).not.toBeInTheDocument();
  });

  it("submits each selected user exactly once, blocks duplicate submission and dismissal while pending", async () => {
    let resolveAdds!: () => void;
    addMember.mockImplementation(() => new Promise<void>((resolve) => { resolveAdds = resolve; }));
    const props = renderPicker({ onMembershipRefresh: vi.fn().mockResolvedValue([governanceMember(newUser)]) });
    await searchFor("new", [newUser]);
    fireEvent.click(await screen.findByRole("button", { name: "New User @new-user" }));
    const add = screen.getByRole("button", { name: "Add" });
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("dialog-backdrop"));
    fireEvent.click(screen.getByRole("button", { name: "Close add members" }));
    expect(addMember).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(add).toBeDisabled();
    resolveAdds();
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(props.onMembershipRefresh).toHaveBeenCalledOnce();
  });

  it("closes after full success and refreshes authoritative membership", async () => {
    const refresh = vi.fn().mockResolvedValue([governanceMember(newUser), governanceMember(secondUser)]);
    const props = renderPicker({ onMembershipRefresh: refresh });
    await searchFor("users", [newUser, secondUser]);
    fireEvent.click(await screen.findByRole("button", { name: "New User @new-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Second User @second-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(addMember).toHaveBeenCalledTimes(2));
    expect(addMember.mock.calls).toEqual([["room-seven", 9], ["room-seven", 10]]);
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("runs at most one request at a time in deterministic selection order", async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    addMember.mockImplementation(() => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      return new Promise<void>((resolve) => {
        releases.push(() => {
          active -= 1;
          resolve();
        });
      });
    });
    const props = renderPicker({
      onMembershipRefresh: vi.fn().mockResolvedValue([
        governanceMember(newUser),
        governanceMember(secondUser),
        governanceMember(thirdUser),
      ]),
    });
    await searchFor("users", [newUser, secondUser, thirdUser]);
    fireEvent.click(await screen.findByRole("button", { name: "New User @new-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Second User @second-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Third User @third-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(addMember.mock.calls).toEqual([["room-seven", 9]]);
    releases[0]();
    await waitFor(() => expect(addMember.mock.calls).toEqual([["room-seven", 9], ["room-seven", 10]]));
    releases[1]();
    await waitFor(() => expect(addMember.mock.calls).toEqual([["room-seven", 9], ["room-seven", 10], ["room-seven", 11]]));
    releases[2]();
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(maximumActive).toBe(1);
  });

  it("keeps only actionable failures selected after partial completion", async () => {
    addMember
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(undefined);
    const refresh = vi.fn()
      .mockResolvedValueOnce([governanceMember(newUser), governanceMember(thirdUser)])
      .mockResolvedValueOnce([governanceMember(newUser), governanceMember(secondUser), governanceMember(thirdUser)]);
    const props = renderPicker({ onMembershipRefresh: refresh });
    await searchFor("users", [newUser, secondUser, thirdUser]);
    fireEvent.click(await screen.findByRole("button", { name: "New User @new-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Second User @second-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Third User @third-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("2 members were added. 1 could not be added");
    expect(screen.queryByRole("button", { name: "Remove New User" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Third User" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Second User" })).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();

    addMember.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(addMember.mock.calls).toEqual([
      ["room-seven", 9],
      ["room-seven", 10],
      ["room-seven", 11],
      ["room-seven", 10],
    ]);
  });

  it("reconciles an already-member race as complete from refreshed membership", async () => {
    addMember.mockRejectedValueOnce(new Error("duplicate membership"));
    const props = renderPicker({ onMembershipRefresh: vi.fn().mockResolvedValue([governanceMember(newUser)]) });
    await searchFor("new", [newUser]);
    fireEvent.click(await screen.findByRole("button", { name: "New User @new-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(screen.queryByText(/duplicate membership/)).not.toBeInTheDocument();
  });

  it("stops after a structured rate-limit response and retains that user and unattempted users", async () => {
    addMember
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError("rate_limited", 429));
    const props = renderPicker({ onMembershipRefresh: vi.fn().mockResolvedValue([governanceMember(newUser)]) });
    await searchFor("users", [newUser, secondUser, thirdUser]);
    fireEvent.click(await screen.findByRole("button", { name: "New User @new-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Second User @second-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Third User @third-user" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please wait before trying the remaining 2 members again");
    expect(addMember.mock.calls).toEqual([["room-seven", 9], ["room-seven", 10]]);
    expect(screen.queryByRole("button", { name: "Remove New User" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Second User" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Third User" })).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("cancels through buttons, Escape, and backdrop without API calls and initially focuses search", () => {
    const props = renderPicker();
    expect(screen.getByRole("textbox", { name: "Search users to add" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("dialog-backdrop"));
    expect(props.onClose).toHaveBeenCalledTimes(3);
    expect(addMember).not.toHaveBeenCalled();
  });
});
