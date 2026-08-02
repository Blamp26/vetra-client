import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
};

const governance = () => ({
  role: "owner" as const,
  capabilities: ["manage_member_permissions", "remove_members"],
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

    const control = screen.getByLabelText("send_messages override");
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
    expect(screen.getByTestId("group-management-dialog").parentElement?.className).toContain("w-[min(366px,calc(100vw-32px))]");
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
    expect(avatarButton.className).toContain("h-16");
    expect(avatarButton.className).toContain("w-16");
    expect(screen.getByRole("button", { name: "Cancel" }).className).toContain("vt-button--ghost");
    expect(screen.getByRole("button", { name: "Save" }).className).toContain("vt-button--ghost");
    expect(avatarButton.className).toContain("overflow-hidden");
    expect(avatarButton.querySelector(".lucide-camera")?.getAttribute("class")).toContain("text-white");
    expect(avatarButton.querySelector(".lucide-image-plus")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit group basic information" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Members/ }));
    expect(screen.getByRole("button", { name: "Back to group management" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to group management" }));
    expect(screen.getByRole("navigation", { name: "Group management sections" })).toBeTruthy();
  });

  it("keeps a valid basic-information draft while visiting governance views", async () => {
    render(<GroupSettingsModal room={{ id: 7, name: "Group" } as any} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Edit group")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: " Renamed " } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Details" } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /^Administrators/ }));
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
