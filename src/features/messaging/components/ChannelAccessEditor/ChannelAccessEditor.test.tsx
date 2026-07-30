import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelAccessEditor } from "./ChannelAccessEditor";
import { serversApi } from "@/api/servers";

vi.mock("@/api/servers", () => ({
  serversApi: {
    getChannelAccess: vi.fn(),
    getRoles: vi.fn(),
    getMembers: vi.fn(),
    updateEveryoneAccess: vi.fn(),
    updateRoleAccess: vi.fn(),
    updateMemberAccess: vi.fn(),
    deleteRoleAccess: vi.fn(),
    deleteMemberAccess: vi.fn(),
  },
}));

const server = {
  id: 1,
  name: "Test",
  created_by: 10,
  inserted_at: "now",
  can_manage: true,
};
const channel = {
  id: 2,
  public_id: "channel",
  name: "private",
  created_by: 10,
  server_id: 1,
  inserted_at: "now",
} as any;

describe("ChannelAccessEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serversApi.getChannelAccess).mockResolvedValue({
      room_id: 2,
      server_id: 1,
      overrides: [
        {
          id: 4,
          role_id: 3,
          allow: ["view_channel"],
          deny: [],
          provenance: "manual",
        },
      ],
    });
    vi.mocked(serversApi.getRoles).mockResolvedValue([
      {
        id: 3,
        name: "Readers",
        position: 1,
        permissions: ["view_channel"],
        is_everyone: false,
        can_manage: true,
        can_assign: true,
      },
    ]);
    vi.mocked(serversApi.getMembers).mockResolvedValue([
      {
        user_id: 20,
        username: "member",
        display_name: "Member",
        avatar_url: null,
        joined_at: "now",
        is_owner: false,
        roles: [],
      },
    ]);
    vi.mocked(serversApi.updateRoleAccess).mockResolvedValue(undefined);
  });

  it("loads subjects and distinguishes inherited/default from explicit states", async () => {
    render(
      <ChannelAccessEditor
        server={server}
        channel={channel}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Readers" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Readers" }));
    expect(
      (screen.getByLabelText("view_channel access") as HTMLSelectElement).value,
    ).toBe("allow");
    expect(
      (screen.getByLabelText("send_messages access") as HTMLSelectElement)
        .value,
    ).toBe("inherit");
  });

  it("prevents overlap through a single inherit/allow/deny control and saves", async () => {
    render(
      <ChannelAccessEditor
        server={server}
        channel={channel}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Readers" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Readers" }));
    fireEvent.change(screen.getByLabelText("send_messages access"), {
      target: { value: "deny" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(serversApi.updateRoleAccess).toHaveBeenCalledWith(
        1,
        "channel",
        3,
        ["view_channel"],
        ["send_messages"],
      ),
    );
  });

  it("searches and selects a member subject", async () => {
    render(
      <ChannelAccessEditor
        server={server}
        channel={channel}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search members…")).toBeTruthy(),
    );
    fireEvent.change(screen.getByPlaceholderText("Search members…"), {
      target: { value: "mem" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Member" }));
    expect(screen.getByText("Member")).toBeTruthy();
  });

  it("shows protected compatibility overrides as read-only", async () => {
    vi.mocked(serversApi.getChannelAccess).mockResolvedValue({
      room_id: 2,
      server_id: 1,
      overrides: [
        {
          id: 4,
          role_id: 3,
          allow: [],
          deny: [],
          provenance: "stage_2b_legacy_projection",
        },
      ],
    });
    render(
      <ChannelAccessEditor
        server={server}
        channel={channel}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Readers" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Readers" }));
    expect(screen.getByRole("note").textContent).toContain("protected");
    expect(
      screen.getByRole("button", { name: "Save" }).getAttribute("disabled"),
    ).not.toBeNull();
  });
});
