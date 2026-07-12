import { describe, expect, it, vi } from "vitest";
import { createRoomsSlice } from "./roomsSlice";

describe("createRoomsSlice", () => {
  it("setRoomConversationLoading is idempotent when the value is unchanged", () => {
    let state = {
      roomConversations: {
        9: {
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

    const slice = createRoomsSlice(
      set as any,
      () => state as any,
      {} as any,
    );

    const previousRecord = state.roomConversations;
    slice.setRoomConversationLoading(9, true);

    expect(set).toHaveBeenCalledTimes(1);
    expect(state.roomConversations).toBe(previousRecord);
  });

  it("merges a room history page with a seeded acknowledgement by message id", () => {
    let state: any = {
      roomConversations: {
        9: {
          messages: [{ id: 7, content: "ack", inserted_at: "2026-07-12T12:01:00Z" }],
          isLoading: false,
          hasMore: true,
        },
      },
    };
    const set = vi.fn((updater: any) => {
      state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater };
    });
    const slice = createRoomsSlice(set as any, () => state, {} as any);

    slice.setRoomMessages(9, [
      { id: 6, content: "recent room", inserted_at: "2026-07-12T12:00:00Z" } as any,
      { id: 7, content: "history version", inserted_at: "2026-07-12T12:01:00Z" } as any,
    ]);

    expect(state.roomConversations[9].messages.map((message: any) => message.id)).toEqual([6, 7]);
    expect(state.roomConversations[9].messages.find((message: any) => message.id === 7).content).toBe("history version");
  });
});
