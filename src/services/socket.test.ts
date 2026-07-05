import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  socketInstances,
  createSocketTicket,
  initializeCallSignaling,
  disconnectCallSignaling,
  MockSocket,
} = vi.hoisted(() => {
  const socketInstances: Array<InstanceType<typeof MockSocket>> = [];
  const createSocketTicket = vi.fn();
  const initializeCallSignaling = vi.fn();
  const disconnectCallSignaling = vi.fn();

  const createJoinResponse = () => ({
    receive(event: string, callback: () => void) {
      if (event === "ok") callback();
      return this;
    },
  });

  const createMockChannel = () => ({
    on: vi.fn(),
    push: vi.fn(),
    join: vi.fn(() => createJoinResponse()),
    leave: vi.fn(),
  });

  class MockSocket {
    endPoint: string;
    opts: Record<string, unknown>;
    channelInstance = createMockChannel();
    connect = vi.fn();
    disconnect = vi.fn();
    channel = vi.fn(() => this.channelInstance);
    onError = vi.fn((callback: () => void) => {
      this.errorHandler = callback;
      return 1;
    });
    onClose = vi.fn((callback: () => void) => {
      this.closeHandler = callback;
      return 2;
    });
    errorHandler?: () => void;
    closeHandler?: () => void;

    constructor(endPoint: string, opts: Record<string, unknown>) {
      this.endPoint = endPoint;
      this.opts = opts;
      socketInstances.push(this);
    }
  }

  return {
    socketInstances,
    createSocketTicket,
    initializeCallSignaling,
    disconnectCallSignaling,
    MockSocket,
  };
});

vi.mock("phoenix", () => ({
  Socket: MockSocket,
}));

vi.mock("@/api/auth", () => ({
  authApi: {
    createSocketTicket,
  },
}));

vi.mock("@/features/calling/services/callSignalingService", () => ({
  callSignalingService: {
    initialize: initializeCallSignaling,
    disconnect: disconnectCallSignaling,
  },
}));

import { connectSocket, getDefaultSocketUrl } from "./socket";

describe("getDefaultSocketUrl", () => {
  it("uses ws for same-origin HTTP deployments", () => {
    expect(getDefaultSocketUrl({ protocol: "http:", host: "146.120.249.160" })).toBe(
      "ws://146.120.249.160/socket",
    );
  });

  it("uses wss for same-origin HTTPS deployments", () => {
    expect(getDefaultSocketUrl({ protocol: "https:", host: "146.120.249.160" })).toBe(
      "wss://146.120.249.160/socket",
    );
  });
});

describe("connectSocket", () => {
  beforeEach(() => {
    socketInstances.length = 0;
    createSocketTicket.mockReset();
    initializeCallSignaling.mockReset();
    disconnectCallSignaling.mockReset();
  });

  it("uses socket_ticket params when the ticket endpoint succeeds", async () => {
    createSocketTicket.mockResolvedValue({
      socket_ticket: "ticket-123",
      expires_in: 60,
    });

    await connectSocket("access-token", 42);

    expect(createSocketTicket).toHaveBeenCalledTimes(1);
    expect(socketInstances).toHaveLength(1);
    expect(socketInstances[0].connect).toHaveBeenCalledTimes(1);
    expect((socketInstances[0].opts.params as () => unknown)()).toEqual({
      socket_ticket: "ticket-123",
    });
  });

  it("falls back to the legacy token param when ticket fetch fails", async () => {
    createSocketTicket.mockRejectedValue(new Error("missing endpoint"));

    await connectSocket("access-token", 42);

    expect((socketInstances[0].opts.params as () => unknown)()).toEqual({
      token: "access-token",
    });
  });

  it("falls back to the legacy token param when the response has no socket_ticket", async () => {
    createSocketTicket.mockResolvedValue({ expires_in: 60 });

    await connectSocket("access-token", 42);

    expect((socketInstances[0].opts.params as () => unknown)()).toEqual({
      token: "access-token",
    });
  });

  it("refreshes socket auth params before reconnect attempts", async () => {
    createSocketTicket
      .mockResolvedValueOnce({
        socket_ticket: "ticket-initial",
        expires_in: 60,
      })
      .mockResolvedValueOnce({
        socket_ticket: "ticket-refreshed",
        expires_in: 60,
      });

    await connectSocket("access-token", 42);
    socketInstances[0].closeHandler?.();

    await vi.waitFor(() => {
      expect(createSocketTicket).toHaveBeenCalledTimes(2);
      expect((socketInstances[0].opts.params as () => unknown)()).toEqual({
        socket_ticket: "ticket-refreshed",
      });
    });
  });
});
