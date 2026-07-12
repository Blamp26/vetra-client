import { describe, expect, it, vi } from "vitest";
import { createMessagesSlice } from "./messagesSlice";

describe("createMessagesSlice", () => {
  it("setSearchResults is idempotent when results are already empty", () => {
    let state = {
      searchResults: { users: [], servers: [] },
      isSearching: false,
    };

    const set = vi.fn((updater: any) => {
      state =
        typeof updater === "function"
          ? { ...state, ...updater(state) }
          : { ...state, ...updater };
    });

    const slice = createMessagesSlice(
      set as any,
      () => state as any,
      {} as any,
    );
    slice.setSearchResults({ users: [], servers: [] });

    expect(set).toHaveBeenCalledTimes(1);
    expect(state.searchResults).toEqual({ users: [], servers: [] });
  });

  it("setConversationLoading is idempotent when the value is unchanged", () => {
    let state = {
      conversations: {
        5: {
          messages: [],
          isLoading: true,
          hasMore: true,
        },
      },
    };

    const set = vi.fn((updater: any) => {
      state =
        typeof updater === "function"
          ? { ...state, ...updater(state) }
          : { ...state, ...updater };
    });

    const slice = createMessagesSlice(
      set as any,
      () => state as any,
      {} as any,
    );

    const previousRecord = state.conversations;
    slice.setConversationLoading(5, true);

    expect(set).toHaveBeenCalledTimes(1);
    expect(state.conversations).toBe(previousRecord);
  });

  it("merges history with a seeded acknowledgement and prefers the incoming server version", () => {
    let state: any = {
      conversations: {
        5: {
          messages: [
            { id: 9, content: "ack", inserted_at: "2026-07-12T12:01:00Z" },
            { id: 1, content: "old", inserted_at: "2026-07-12T12:00:00Z" },
          ],
          isLoading: false,
          hasMore: true,
        },
      },
    };
    const set = vi.fn((updater: any) => {
      state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater };
    });
    const slice = createMessagesSlice(set as any, () => state, {} as any);

    slice.setConversationMessages(5, [
      { id: 9, content: "history version", inserted_at: "2026-07-12T12:01:00Z" } as any,
      { id: 2, content: "recent", inserted_at: "2026-07-12T12:02:00Z" } as any,
    ]);

    expect(state.conversations[5].messages.map((message: any) => message.id)).toEqual([1, 9, 2]);
    expect(state.conversations[5].messages.find((message: any) => message.id === 9).content).toBe("history version");
  });
});
