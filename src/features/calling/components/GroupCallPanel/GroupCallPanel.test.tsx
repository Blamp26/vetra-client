import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupCallPanel } from "./GroupCallPanel";
import { roomsApi } from "@/api/rooms";

vi.mock("@/api/rooms", () => ({
  roomsApi: {
    getGroupCall: vi.fn(),
    startGroupCall: vi.fn(),
    joinGroupCall: vi.fn(),
    leaveGroupCall: vi.fn(),
    endGroupCall: vi.fn(),
    updateGroupCallMedia: vi.fn(),
  },
}));

const eventSocket = () => ({
  onGroupCallEvent: vi.fn(() => () => undefined),
  onRoomMemberRemoved: vi.fn(() => () => undefined),
  onRoomDeleted: vi.fn(() => () => undefined),
}) as any;

const active = { call_id: "call-1", room_id: 7, state: "active", state_version: 2, started_by_user_id: 1, started_at: "2026-08-08T00:00:00Z", participants: [], viewer_joined: false, can_end_for_everyone: true } as const;

describe("GroupCallPanel", () => {
  it("presents start and join from server projection", async () => {
    vi.mocked(roomsApi.getGroupCall).mockResolvedValueOnce({ call: null, capabilities: { can_start: true, can_join: true, can_end_for_everyone: false } });
    vi.mocked(roomsApi.startGroupCall).mockResolvedValue(active as any);
    vi.mocked(roomsApi.getGroupCall).mockResolvedValueOnce({ ...active, viewer_joined: true, participants: [] } as any);
    render(<GroupCallPanel roomRef={7} currentUserId={1} socketManager={eventSocket()} />);
    expect(await screen.findByRole("button", { name: /start call/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /start call/i }));
    await waitFor(() => expect(roomsApi.startGroupCall).toHaveBeenCalledWith(7));
  });

  it("keeps leave and end-for-everyone distinct", async () => {
    vi.mocked(roomsApi.getGroupCall).mockResolvedValue({ ...active, viewer_joined: true, participants: [{ user_id: 1, joined_at: active.started_at, microphone_enabled: false, camera_enabled: false, screen_sharing: false }] } as any);
    vi.mocked(roomsApi.leaveGroupCall).mockResolvedValue(undefined);
    vi.mocked(roomsApi.endGroupCall).mockResolvedValue(undefined);
    render(<GroupCallPanel roomRef={7} currentUserId={1} socketManager={eventSocket()} />);
    expect(await screen.findByRole("button", { name: /^leave$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /end for everyone/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^leave$/i }));
    await waitFor(() => expect(roomsApi.leaveGroupCall).toHaveBeenCalledWith(7, "call-1"));
  });
});
