import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { roomsApiMock, socketHandler } = vi.hoisted(() => ({
  roomsApiMock: {
    governance: vi.fn(),
    governanceMembers: vi.fn(),
    updateOverride: vi.fn(),
    clearOverride: vi.fn(),
    removeMember: vi.fn(),
    updateDefaults: vi.fn(),
    promote: vi.fn(),
    updateAdminRights: vi.fn(),
    demote: vi.fn(),
    leave: vi.fn(),
    delete: vi.fn(),
    updateProfile: vi.fn(),
  },
  socketHandler: { current: null as ((event: any) => void) | null },
}));

vi.mock("@/api/rooms", () => ({ roomsApi: roomsApiMock }));
vi.mock("@/api/base", () => ({ postFormData: vi.fn() }));
vi.mock("@/store", () => ({
  useAppStore: (selector: (state: any) => unknown) =>
    selector({
      currentUser: { id: 1 },
      upsertRoomPreview: vi.fn(),
      socketManager: {
        onGroupGovernanceChanged: (handler: (event: any) => void) => {
          socketHandler.current = handler;
          return () => {
            socketHandler.current = null;
          };
        },
      },
    }),
}));

import { GroupSettingsModal } from "./GroupSettingsModal";

const member = {
  id: 2,
  username: "member",
  display_name: "Member",
  role: "member" as const,
  admin_permissions: [],
  allow_permissions: [],
  deny_permissions: [],
  effective_permissions: ["send_messages"],
  can_manage: true,
  can_promote: true,
};

const admin = {
  id: 3,
  username: "admin",
  display_name: "Administrator",
  role: "admin" as const,
  admin_permissions: ["change_group_info"],
  allow_permissions: [],
  deny_permissions: [],
  effective_permissions: ["change_group_info"],
  can_edit_admin: true,
  can_demote: true,
};

const governance = () => ({
  role: "owner" as const,
  capabilities: ["manage_member_permissions", "remove_members"],
  delegable_admin_permissions: [
    "change_group_info",
    "delete_messages",
    "remove_members",
    "invite_members",
    "pin_messages",
    "manage_group_calls",
    "edit_member_tags",
    "add_new_admins",
  ],
  defaults: ["send_messages"],
  members: [
    {
      id: 1,
      username: "owner",
      display_name: "Owner",
      role: "owner" as const,
      admin_permissions: [],
      allow_permissions: [],
      deny_permissions: [],
      effective_permissions: ["send_messages"],
    },
    admin,
    member,
  ],
});

describe("GroupSettingsModal member governance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketHandler.current = null;
    roomsApiMock.governance.mockResolvedValue(governance());
    roomsApiMock.governanceMembers.mockResolvedValue([member]);
    roomsApiMock.updateOverride.mockResolvedValue(member);
    roomsApiMock.clearOverride.mockResolvedValue(undefined);
    roomsApiMock.removeMember.mockResolvedValue(undefined);
    roomsApiMock.updateDefaults.mockResolvedValue(["send_messages"]);
    roomsApiMock.promote.mockResolvedValue({ ...member, role: "admin" });
    roomsApiMock.updateAdminRights.mockResolvedValue(admin);
    roomsApiMock.demote.mockResolvedValue({ ...admin, role: "member" });
    roomsApiMock.leave.mockResolvedValue(undefined);
    roomsApiMock.delete.mockResolvedValue(undefined);
    roomsApiMock.updateProfile.mockResolvedValue({ id: 7, name: "Updated group" });
  });

  it("edits inherit/allow/deny restrictions and clears them through the API", async () => {
    render(
      <GroupSettingsModal
        room={{ id: 7, name: "Group" } as any}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Edit group")).toBeTruthy(),
    );
    fireEvent.click(screen.getByText("Members"));
    fireEvent.click(
      screen.getByRole("button", {
        name: /^Member 1 effective permissions$/,
      }),
    );

    const control = screen.getByLabelText("Send messages override");
    expect((control as HTMLSelectElement).value).toBe("inherit");
    fireEvent.change(control, { target: { value: "deny" } });
    fireEvent.click(screen.getByText("Save restrictions"));

    await waitFor(() =>
      expect(roomsApiMock.updateOverride).toHaveBeenCalledWith(
        7,
        2,
        [],
        ["send_messages"],
      ),
    );

    fireEvent.click(screen.getByText("Clear override"));
    await waitFor(() =>
      expect(roomsApiMock.clearOverride).toHaveBeenCalledWith(7, 2),
    );
  });

  it("refetches and closes on governance realtime changes", async () => {
    const onClose = vi.fn();
    render(
      <GroupSettingsModal
        room={{ id: 7, name: "Group" } as any}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(socketHandler.current).toBeTruthy());

    const initialLoads = roomsApiMock.governance.mock.calls.length;
    socketHandler.current?.({ room_id: 7, event: "member_override_changed" });
    await waitFor(() =>
      expect(roomsApiMock.governance).toHaveBeenCalledTimes(initialLoads + 1),
    );

    socketHandler.current?.({ room_id: 7, event: "group_deleted" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses a compact vertical overview and returns from an internal page with Back", async () => {
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Edit group")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Edit group" })).toBeInTheDocument();
    expect(screen.getByTestId("group-management-frame")).toHaveAttribute("data-group-management-frame", "settings");
    expect(screen.getByTestId("dialog-panel")).toHaveClass("max-w-[366px]", "overflow-hidden");
    expect(screen.getByTestId("group-settings-scroll-body")).toHaveClass("overflow-y-auto", "min-h-0");
    expect(screen.getByRole("navigation", { name: "Group management sections" })).toBeTruthy();
    expect((screen.getByLabelText("Group name") as HTMLInputElement).value).toBe("Group");
    expect(screen.getByLabelText("Description")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Basic information")).toBeNull();
    expect(screen.queryByText(/PNG, JPEG, GIF, or WebP/)).toBeNull();
    expect(screen.queryByText("0/500")).toBeNull();
    expect((screen.getByLabelText("Group name") as HTMLInputElement).className).toContain("border-b");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).rows).toBe(1);
    const avatarButton = screen.getByRole("button", { name: "Change group photo" });
    expect(avatarButton.className).toContain("h-[72px]");
    expect(avatarButton.className).toContain("w-[72px]");
    expect(screen.getByRole("button", { name: "Cancel" }).className).toContain("vt-button--ghost");
    expect(screen.getByRole("button", { name: "Save" }).className).toContain("vt-button--ghost");
    expect(avatarButton.className).toContain("overflow-hidden");
    expect(avatarButton.querySelector(".lucide-camera")?.getAttribute("class")).toContain("text-white");
    expect(avatarButton.querySelector(".lucide-image-plus")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit group basic information" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add member" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Administrators2$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave group" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete group" })).toBeInTheDocument();
    expect(screen.getByTestId("group-settings-footer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Members/ }));
    expect(screen.getByRole("heading", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to group management" })).toBeTruthy();
    expect(screen.getByTestId("group-management-frame")).toHaveClass("min-h-[min(520px,calc(100dvh-96px))]");
    expect(screen.getByTestId("group-management-frame").querySelectorAll(".overflow-y-auto")).toHaveLength(1);
    expect(screen.queryByLabelText("Group name")).toBeNull();
    expect(screen.queryByTestId("group-settings-footer")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to group management" }));
    expect(screen.getByRole("navigation", { name: "Group management sections" })).toBeTruthy();
    expect(screen.getByTestId("group-settings-footer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Member permissions" }));
    expect(screen.getByRole("heading", { name: "Member permissions" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Group name")).toBeNull();
    expect(screen.queryByTestId("group-settings-footer")).toBeNull();
    const saveDefaults = screen.getByRole("button", { name: "Save defaults" });
    expect(screen.getByTestId("group-permissions-footer")).toContainElement(saveDefaults);
    expect(screen.getByTestId("group-settings-scroll-body")).not.toContainElement(saveDefaults);
  });

  it("shows centralized permission labels while preserving wire keys in API calls", async () => {
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await screen.findByText("Edit group");
    fireEvent.click(screen.getByRole("button", { name: "Member permissions" }));
    expect(screen.getByText("Send messages")).toBeTruthy();
    expect(screen.getByText("Send photos")).toBeTruthy();
    expect(screen.queryByText("send_messages")).toBeNull();
    expect(screen.queryByText("send_photos")).toBeNull();
    fireEvent.click(screen.getByText("Send photos"));
    fireEvent.click(screen.getByText("Save defaults"));
    await waitFor(() =>
      expect(roomsApiMock.updateDefaults).toHaveBeenCalledWith(7, ["send_messages", "send_photos"]),
    );
  });

  it("normalizes every governance subpage without changing administrator mutations", async () => {
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await screen.findByText("Edit group");

    fireEvent.click(screen.getByRole("button", { name: /^Administrators/ }));
    expect(screen.getByRole("heading", { name: "Administrators" })).toBeInTheDocument();
    expect(screen.getAllByText("Administrators")).toHaveLength(1);
    expect(screen.getByTestId("group-management-frame")).toHaveClass("min-h-[min(520px,calc(100dvh-96px))]");
    expect(screen.getByTestId("group-management-frame").querySelectorAll(".overflow-y-auto")).toHaveLength(1);
    expect(screen.getByTestId("group-admins-subpage")).toHaveClass("px-5", "pt-4", "pb-5");
    expect(screen.getByRole("button", { name: "Edit rights" }).closest('[data-group-management-person-row]')).toHaveClass("min-h-14", "gap-3");
    expect(screen.getAllByText("Owner").some((node) => node.closest('[data-group-management-person-row]'))).toBe(true);
    expect(screen.getByRole("button", { name: "Promote" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit rights" }));
    const adminRight = screen.getByLabelText("Change group info");
    expect(adminRight).toHaveClass("sr-only", "peer");
    expect(adminRight.parentElement?.querySelector("[data-group-management-boolean-control]")).toBeInTheDocument();
    expect(adminRight.closest('[data-group-management-control-row]')).toHaveClass("min-h-11");
    fireEvent.click(screen.getByRole("button", { name: "Save rights" }));
    await waitFor(() => expect(roomsApiMock.updateAdminRights).toHaveBeenCalledWith(7, 3, ["change_group_info"]));

    fireEvent.click(screen.getByRole("button", { name: "Demote" }));
    const demoteDialog = screen.getByRole("dialog", { name: "Demote administrator?" });
    expect(demoteDialog).toBeInTheDocument();
    fireEvent.click(within(demoteDialog).getByRole("button", { name: "Demote" }));
    await waitFor(() => expect(roomsApiMock.demote).toHaveBeenCalledWith(7, 3));

    let promoteButtons = screen.getAllByRole("button", { name: "Promote" });
    fireEvent.click(promoteButtons[promoteButtons.length - 1]);
    expect(screen.getByLabelText("Manage group calls")).toBeInTheDocument();
    expect(screen.getByLabelText("Edit member tags")).toBeInTheDocument();
    expect(screen.getByLabelText("Add new administrators")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Add new administrators"));
    promoteButtons = screen.getAllByRole("button", { name: "Promote" });
    fireEvent.click(promoteButtons[promoteButtons.length - 1]);
    await waitFor(() =>
      expect(roomsApiMock.promote).toHaveBeenCalledWith(7, 2, ["add_new_admins"]),
    );
  });

  it("keeps member selection, overrides, removal, and default permissions on the same APIs", async () => {
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await screen.findByText("Edit group");

    fireEvent.click(screen.getByRole("button", { name: /^Members/ }));
    expect(screen.getByRole("region", { name: "Group members" }).querySelector('[data-group-management-person-row="static"]')).toHaveTextContent("Owner");
    expect(screen.getByTestId("group-members-subpage")).toHaveClass("px-5", "pt-4", "pb-5");
    expect(screen.getByPlaceholderText("Search members")).toHaveClass("vt-input", "vt-input--compact");
    const memberRow = screen.getByRole("button", { name: "Member 1 effective permissions" });
    expect(memberRow).toHaveClass("min-h-14", "px-3");
    fireEvent.click(memberRow);
    expect(screen.getByLabelText("Send messages override").closest('[data-group-management-control-row]')).toHaveClass("min-h-11");
    fireEvent.change(screen.getByLabelText("Send messages override"), { target: { value: "allow" } });
    fireEvent.click(screen.getByRole("button", { name: "Save restrictions" }));
    await waitFor(() => expect(roomsApiMock.updateOverride).toHaveBeenCalledWith(7, 2, ["send_messages"], []));
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    expect(screen.getByRole("dialog", { name: "Remove member?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(roomsApiMock.removeMember).toHaveBeenCalledWith(7, 2));

    fireEvent.click(screen.getByRole("button", { name: "Back to group management" }));
    fireEvent.click(screen.getByRole("button", { name: "Member permissions" }));
    expect(screen.getByTestId("group-permissions-subpage")).toHaveClass("px-5", "pt-4", "pb-5");
    const defaultPermission = screen.getByLabelText("Send messages");
    expect(defaultPermission).toHaveClass("sr-only", "peer");
    expect(defaultPermission).toBeChecked();
    expect(defaultPermission.closest('[data-group-management-control-row]')).toHaveClass("min-h-11");
    expect(screen.queryByText(/Topics|Stories|QR|Slow mode|Auto-delete/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("group-settings-footer")).not.toBeInTheDocument();
    const saveDefaults = screen.getByRole("button", { name: "Save defaults" });
    expect(screen.getByTestId("group-permissions-footer")).toContainElement(saveDefaults);
    expect(screen.getByTestId("group-settings-scroll-body")).not.toContainElement(saveDefaults);
  });

  it("uses server target capabilities for delegated administration", async () => {
    roomsApiMock.governance.mockResolvedValue({
      role: "admin",
      capabilities: ["change_group_info", "add_new_admins"],
      delegable_admin_permissions: ["change_group_info", "add_new_admins"],
      defaults: [],
      members: [
        { ...governance().members[0], can_edit_admin: false, can_demote: false },
        { ...admin, id: 3, display_name: "Descendant", can_edit_admin: true, can_demote: true },
        { ...admin, id: 4, display_name: "Sibling", can_edit_admin: false, can_demote: false },
        { ...member, can_promote: true },
      ],
    });

    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await screen.findByText("Edit group");
    fireEvent.click(screen.getByRole("button", { name: /^Administrators/ }));

    const descendant = screen.getByText("Descendant").closest<HTMLElement>('[data-group-management-person-row]')!;
    const sibling = screen.getByText("Sibling").closest<HTMLElement>('[data-group-management-person-row]')!;
    expect(within(descendant).getByRole("button", { name: "Edit rights" })).toBeEnabled();
    expect(within(sibling).getByRole("button", { name: "Edit rights" })).toBeDisabled();
    expect(within(sibling).getByRole("button", { name: "Demote" })).toBeDisabled();

    fireEvent.click(within(descendant).getByRole("button", { name: "Edit rights" }));
    expect(screen.getByLabelText("Change group info")).toBeEnabled();
    expect(screen.getByLabelText("Add new administrators")).toBeEnabled();
    expect(screen.getByLabelText("Delete messages")).toBeDisabled();
    expect(screen.queryByText("Custom title")).toBeNull();
    expect(screen.queryByText("Transfer ownership")).toBeNull();
  });

  it("blocks duplicate administrator submissions and reconciles stale failures", async () => {
    let rejectMutation!: (reason: Error) => void;
    roomsApiMock.updateAdminRights.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectMutation = reject;
      }),
    );

    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await screen.findByText("Edit group");
    fireEvent.click(screen.getByRole("button", { name: /^Administrators/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit rights" }));
    const save = screen.getByRole("button", { name: "Save rights" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(roomsApiMock.updateAdminRights).toHaveBeenCalledTimes(1);

    const loadsBeforeFailure = roomsApiMock.governance.mock.calls.length;
    rejectMutation(new Error("Authorization changed"));
    await waitFor(() =>
      expect(roomsApiMock.governance.mock.calls.length).toBeGreaterThan(loadsBeforeFailure),
    );
    expect(screen.queryByRole("button", { name: "Save rights" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Authorization changed");
  });

  it("shows an owner-only membership consistently without exposing invalid owner actions", async () => {
    const owner = governance().members[0];
    roomsApiMock.governance.mockResolvedValue({ ...governance(), members: [owner] });
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await screen.findByText("Edit group");

    expect(screen.getByRole("button", { name: /^Administrators1$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Members1$/ }));
    const ownerRow = screen.getByRole("region", { name: "Group members" }).querySelector('[data-group-management-person-row]');
    expect(ownerRow).toHaveAttribute("data-group-management-person-row", "static");
    expect(screen.queryByRole("button", { name: /Owner/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Promote|Remove member|Save restrictions|Clear override/ })).not.toBeInTheDocument();
  });

  it("keeps administrator context mounted when demotion is cancelled and prevents duplicate confirmation", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    let resolveDemote!: (value: typeof admin) => void;
    roomsApiMock.demote.mockImplementationOnce(() => new Promise((resolve) => { resolveDemote = resolve; }));
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await screen.findByText("Edit group");
    fireEvent.click(screen.getByRole("button", { name: /^Administrators/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit rights" }));
    fireEvent.click(screen.getByRole("button", { name: "Demote" }));

    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(2);
    expect(screen.getByTestId("group-admins-subpage")).toBeInTheDocument();
    const demoteDialog = screen.getByRole("dialog", { name: "Demote administrator?" });
    expect(demoteDialog).toHaveAccessibleDescription("Administrator will become a regular group member.");
    expect(screen.queryByText(/delete for everyone|transfer ownership/i)).not.toBeInTheDocument();
    fireEvent.click(within(demoteDialog).getByRole("button", { name: "Cancel" }));
    expect(roomsApiMock.demote).not.toHaveBeenCalled();
    expect(screen.getByText("Administrator rights")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Demote" }));
    const confirm = within(screen.getByRole("dialog", { name: "Demote administrator?" })).getByRole("button", { name: "Demote" });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(roomsApiMock.demote).toHaveBeenCalledTimes(1);
    expect(roomsApiMock.demote).toHaveBeenCalledWith(7, 3);
    resolveDemote(admin);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Demote administrator?" })).not.toBeInTheDocument());
    expect(roomsApiMock.governance.mock.calls.length).toBeGreaterThan(1);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("keeps member selection mounted when removal is cancelled and prevents duplicate confirmation", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    let resolveRemove!: () => void;
    roomsApiMock.removeMember.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveRemove = resolve; }));
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await screen.findByText("Edit group");
    fireEvent.click(screen.getByRole("button", { name: /^Members/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Member 1 effective permissions$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));

    expect(screen.getByTestId("group-members-subpage")).toBeInTheDocument();
    const removeDialog = screen.getByRole("dialog", { name: "Remove member?" });
    expect(removeDialog).toHaveAccessibleDescription("Remove Member from this group?");
    fireEvent.click(within(removeDialog).getByRole("button", { name: "Cancel" }));
    expect(roomsApiMock.removeMember).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove member" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    const confirm = screen.getByRole("button", { name: "Remove" });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(roomsApiMock.removeMember).toHaveBeenCalledTimes(1);
    expect(roomsApiMock.removeMember).toHaveBeenCalledWith(7, 2);
    resolveRemove();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Remove member?" })).not.toBeInTheDocument());
    expect(roomsApiMock.governance.mock.calls.length).toBeGreaterThan(1);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("keeps the overview draft mounted when leaving is cancelled and prevents duplicate confirmation", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    const onClose = vi.fn();
    let resolveLeave!: () => void;
    roomsApiMock.governance.mockResolvedValue({ ...governance(), role: "member" });
    roomsApiMock.leave.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveLeave = resolve; }));
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={onClose} />);
    await screen.findByText("Edit group");
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Draft name" } });
    fireEvent.click(screen.getByRole("button", { name: "Leave group" }));

    const leaveDialog = screen.getByRole("dialog", { name: "Leave group?" });
    expect(leaveDialog).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(within(leaveDialog).getByRole("button", { name: "Cancel" }));
    expect(roomsApiMock.leave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Group name")).toHaveValue("Draft name");

    fireEvent.click(screen.getByRole("button", { name: "Leave group" }));
    const confirm = screen.getByRole("button", { name: "Leave" });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(roomsApiMock.leave).toHaveBeenCalledTimes(1);
    expect(roomsApiMock.leave).toHaveBeenCalledWith(7);
    resolveLeave();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("keeps the overview mounted when deletion is cancelled and prevents duplicate confirmation", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    const onClose = vi.fn();
    let resolveDelete!: () => void;
    roomsApiMock.delete.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveDelete = resolve; }));
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={onClose} />);
    await screen.findByText("Edit group");
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));

    const deleteDialog = screen.getByRole("dialog", { name: "Delete group?" });
    expect(deleteDialog).toHaveAccessibleDescription("This group and its messages will be permanently deleted.");
    expect(screen.getByTestId("group-settings-scroll-body")).toBeInTheDocument();
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Cancel" }));
    expect(roomsApiMock.delete).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "Group management sections" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
    const confirm = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(roomsApiMock.delete).toHaveBeenCalledTimes(1);
    expect(roomsApiMock.delete).toHaveBeenCalledWith(7);
    resolveDelete();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("keeps a valid basic-information draft while visiting governance views", async () => {
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Edit group")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: " Renamed " } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Details" } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /^Administrators/ }));
    expect(screen.queryByLabelText("Group name")).toBeNull();
    expect(screen.queryByTestId("group-settings-footer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to group management" }));
    expect((screen.getByLabelText("Group name") as HTMLInputElement).value).toBe(" Renamed ");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Details");
  });

  it("requires a valid dirty draft before saving and normalizes description", async () => {
    render(<GroupSettingsModal room={{ id: 7, name: "Group", description: "Old" } as any} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Edit group")).toBeTruthy());
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "   " } });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "New name" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "   " } });
    fireEvent.click(save);
    await waitFor(() => expect(roomsApiMock.updateProfile).toHaveBeenCalledWith(7, {
      name: "New name",
      description: null,
      avatar_media_file_id: null,
    }));
  });

  it("keeps avatar removal local until Save", async () => {
    render(<GroupSettingsModal room={{ id: 7, name: "Group", avatar_media_file_id: "media-1", avatar_url: "/media-1" } as any} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Edit group")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Change group photo" }));
    expect(screen.getByRole("menuitem", { name: "Remove photo" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove photo" }));
    expect(roomsApiMock.updateProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(roomsApiMock.updateProfile).toHaveBeenCalledWith(7, {
      name: "Group",
      description: null,
      avatar_media_file_id: null,
    }));
  });

  it("opens avatar actions from the whole initials avatar with keyboard activation", async () => {
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Edit group")).toBeTruthy());
    const avatarButton = screen.getByRole("button", { name: "Change group photo" });
    fireEvent.keyDown(avatarButton, { key: "Enter" });
    expect(screen.getByRole("menuitem", { name: "Choose from file" })).toBeTruthy();
    fireEvent.click(avatarButton);
    fireEvent.keyDown(avatarButton, { key: " " });
    expect(screen.getByRole("menuitem", { name: "Paste from clipboard" })).toBeTruthy();
  });
});
