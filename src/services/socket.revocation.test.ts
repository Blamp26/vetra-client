import { beforeEach, describe, expect, it, vi } from "vitest";

describe("room access revocation", () => {
  beforeEach(() => vi.resetModules());

  it("leaves and removes a revoked room channel", async () => {
    const channel = {
      on: vi.fn(),
      join: vi.fn(() => ({
        receive(event: string, callback: () => void) {
          if (event === "ok") callback();
          return this;
        },
      })),
      leave: vi.fn(),
      push: vi.fn(),
    };
    class MockSocket {
      channel = vi.fn(() => channel);
      connect = vi.fn();
      disconnect = vi.fn();
      onError = vi.fn();
      onClose = vi.fn();
      onOpen = vi.fn();
      constructor(_url: string, _opts: unknown) {}
    }

    vi.doMock("phoenix", () => ({ Socket: MockSocket }));
    vi.doMock("@/api/auth", () => ({
      authApi: {
        createSocketTicket: vi.fn().mockResolvedValue({ socket_ticket: "t" }),
      },
    }));
    vi.doMock("@/features/calling/services/callSignalingService", () => ({
      callSignalingService: { disconnect: vi.fn() },
    }));

    const { connectSocket } = await import("./socket");
    const manager = await connectSocket("token", 1);
    await manager.joinRoomChannel(23);
    const handler = channel.on.mock.calls.find(
      (call: any[]) => call[0] === "channel_access_revoked",
    )?.[1] as ((payload: unknown) => void) | undefined;

    const onRevoked = vi.fn();
    manager.onRoomAccessRevoked(onRevoked);
    handler?.({ room_id: 23, reason: "member_removed" });

    expect(channel.leave).toHaveBeenCalledTimes(1);
    expect(onRevoked).toHaveBeenCalledWith({
      room_id: 23,
      reason: "member_removed",
    });
    await expect(manager.joinRoomChannel(23)).rejects.toThrow("access revoked");
  });

  it("reconciles cached rooms before reconnecting and keeps authorized rooms", async () => {
    const channel = {
      on: vi.fn(),
      join: vi.fn(() => ({
        receive(event: string, callback: () => void) {
          if (event === "ok") callback();
          return this;
        },
      })),
      leave: vi.fn(),
      push: vi.fn(),
    };
    const rooms = { getList: vi.fn().mockResolvedValue([{ id: 23 }]) };
    const servers = {
      getList: vi.fn().mockResolvedValue([]),
      getChannels: vi.fn(),
    };

    let socketInstance: { openHandler?: () => void } = {};
    class MockSocket {
      channel = vi.fn(() => channel);
      connect = vi.fn();
      disconnect = vi.fn();
      onError = vi.fn();
      onClose = vi.fn();
      openHandler?: () => void;
      onOpen = vi.fn((callback: () => void) => {
        this.openHandler = callback;
        return 3;
      });
      constructor(_url: string, _opts: unknown) {
        socketInstance = this;
      }
    }

    vi.doMock("phoenix", () => ({ Socket: MockSocket }));
    vi.doMock("@/api/auth", () => ({
      authApi: {
        createSocketTicket: vi.fn().mockResolvedValue({ socket_ticket: "t" }),
      },
    }));
    vi.doMock("@/api/rooms", () => ({ roomsApi: rooms }));
    vi.doMock("@/api/servers", () => ({ serversApi: servers }));
    vi.doMock("@/features/calling/services/callSignalingService", () => ({
      callSignalingService: { disconnect: vi.fn() },
    }));

    const { connectSocket } = await import("./socket");
    const manager = await connectSocket("token", 1);
    await manager.joinRoomChannel(23);
    await manager.joinRoomChannel(24);
    const onRevoked = vi.fn();
    manager.onRoomAccessRevoked(onRevoked);
    await socketInstance.openHandler?.();
    await vi.waitFor(() => expect(rooms.getList).toHaveBeenCalledTimes(1));
    expect(channel.join).toHaveBeenCalledTimes(3);
    await vi.waitFor(() =>
      expect(onRevoked).toHaveBeenCalledWith({
        room_id: 24,
        reason: "reconnect_reconciliation",
      }),
    );
  });
});
