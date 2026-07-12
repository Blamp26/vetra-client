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

import {
  buildSocketMessagePayload,
  connectSocket,
  getDefaultSocketUrl,
} from "./socket";

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

describe("buildSocketMessagePayload", () => {
  it("includes both legacy and grouped media keys for a four-photo album payload", () => {
    expect(
      buildSocketMessagePayload(
        {
          content: null,
          mediaFileId: "media-photo-1",
          mediaFileIds: [
            "media-photo-1",
            "media-photo-2",
            "media-photo-3",
            "media-photo-4",
          ],
        },
      ),
    ).toEqual({
      content: null,
      mediaFileId: "media-photo-1",
      mediaFileIds: [
        "media-photo-1",
        "media-photo-2",
        "media-photo-3",
        "media-photo-4",
      ],
      media_file_id: "media-photo-1",
      media_file_ids: [
        "media-photo-1",
        "media-photo-2",
        "media-photo-3",
        "media-photo-4",
      ],
      reply_to_id: null,
    });
  });

  it("includes grouped media ids in both camelCase and snake_case forms", () => {
    expect(
      buildSocketMessagePayload(
        {
          content: "caption",
          mediaFileId: "media-photo-1",
          mediaFileIds: ["media-photo-1", "media-photo-2"],
          replyToId: 55,
        },
        { recipient_id: "user-public-id" },
      ),
    ).toEqual({
      recipient_id: "user-public-id",
      content: "caption",
      mediaFileId: "media-photo-1",
      mediaFileIds: ["media-photo-1", "media-photo-2"],
      media_file_id: "media-photo-1",
      media_file_ids: ["media-photo-1", "media-photo-2"],
      reply_to_id: 55,
    });
  });

  it("keeps single-photo payloads on the legacy single-media path while preserving the first id", () => {
    expect(
      buildSocketMessagePayload({
        content: null,
        mediaFileIds: ["media-photo-10"],
      }),
    ).toEqual({
      content: null,
      mediaFileId: "media-photo-10",
      mediaFileIds: null,
      media_file_id: "media-photo-10",
      media_file_ids: null,
      reply_to_id: null,
    });
  });

  it("includes the persisted source message id for forwarded messages", () => {
    expect(
      buildSocketMessagePayload({
        content: "copied text",
        forwardedFromMessageId: 123,
      }),
    ).toEqual({
      content: "copied text",
      mediaFileId: null,
      mediaFileIds: null,
      media_file_id: null,
      media_file_ids: null,
      reply_to_id: null,
      forwarded_from_message_id: 123,
    });
  });
});
