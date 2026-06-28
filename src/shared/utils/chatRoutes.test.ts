import { describe, expect, it } from "vitest";
import {
  activeChatKey,
  buildHashForActiveChat,
  resolveHashToActiveChat,
  sameActiveChat,
} from "./chatRoutes";

describe("chatRoutes", () => {
  it("treats equivalent server chats as the same active chat across ref variants", () => {
    expect(
      sameActiveChat(
        { type: "server", serverId: 5, serverRef: 5 },
        { type: "server", serverId: 5, serverRef: "srv-5" },
      ),
    ).toBe(true);
  });

  it("treats equivalent channel chats as the same active chat across ref variants", () => {
    expect(
      sameActiveChat(
        {
          type: "channel",
          serverId: 5,
          channelId: 9,
          serverRef: 5,
          channelRef: 9,
        },
        {
          type: "channel",
          serverId: 5,
          channelId: 9,
          serverRef: "srv-5",
          channelRef: "chn-9",
        },
      ),
    ).toBe(true);
  });

  it("builds canonical public-id channel hashes even when active chat refs are numeric", () => {
    const hash = buildHashForActiveChat(
      {
        type: "channel",
        serverId: 5,
        channelId: 9,
        serverRef: 5,
        channelRef: 9,
      },
      {
        activeChat: null,
        currentUser: null,
        conversationPreviews: {},
        roomPreviews: {
          9: {
            id: 9,
            public_id: "chn-9",
            name: "general",
            created_by: 1,
            server_id: 5,
            inserted_at: "2026-06-28T00:00:00Z",
            unread_count: 0,
            last_message_at: null,
            last_message: null,
          },
        },
        servers: {
          5: {
            id: 5,
            public_id: "srv-5",
            name: "Alpha",
            created_by: 1,
            inserted_at: "2026-06-28T00:00:00Z",
          },
        },
        serverChannels: {},
        searchResults: { users: [], servers: [] },
      },
    );

    expect(hash).toBe("#/s/srv-5/chn-9");
  });

  it("uses stable primitive keys for channel chats", () => {
    expect(
      activeChatKey({
        type: "channel",
        serverId: 5,
        channelId: 9,
        serverRef: "srv-5",
        channelRef: "chn-9",
      }),
    ).toBe("channel:5:9");
  });

  it("resolves a channel hash directly to a channel chat", () => {
    expect(
      resolveHashToActiveChat("#/s/1/9", {
        activeChat: null,
        currentUser: null,
        conversationPreviews: {},
        roomPreviews: {},
        servers: {
          1: {
            id: 1,
            name: "Alpha",
            created_by: 1,
            inserted_at: "2026-06-28T00:00:00Z",
          },
        },
        serverChannels: {},
        searchResults: { users: [], servers: [] },
      }),
    ).toEqual({
      type: "channel",
      serverId: 1,
      channelId: 9,
      serverRef: "1",
      channelRef: "9",
    });
  });

  it("does not fall back to the parent server when a channel hash cannot be resolved yet", () => {
    expect(
      resolveHashToActiveChat("#/s/srv-1/chn-9", {
        activeChat: null,
        currentUser: null,
        conversationPreviews: {},
        roomPreviews: {},
        servers: {
          1: {
            id: 1,
            public_id: "srv-1",
            name: "Alpha",
            created_by: 1,
            inserted_at: "2026-06-28T00:00:00Z",
          },
        },
        serverChannels: {},
        searchResults: { users: [], servers: [] },
      }),
    ).toBeNull();
  });
});
