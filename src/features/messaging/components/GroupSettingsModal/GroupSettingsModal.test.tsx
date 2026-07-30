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
  },
  socketHandler: { current: null as ((event: any) => void) | null },
}));

vi.mock("@/api/rooms", () => ({ roomsApi: roomsApiMock }));
vi.mock("@/store", () => ({
  useAppStore: (selector: (state: any) => unknown) =>
    selector({
      currentUser: { id: 1 },
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
  });

  it("edits inherit/allow/deny restrictions and clears them through the API", async () => {
    render(
      <GroupSettingsModal
        room={{ id: 7, name: "Group" } as any}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Group settings")).toBeTruthy(),
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
});
