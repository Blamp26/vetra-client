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
});
