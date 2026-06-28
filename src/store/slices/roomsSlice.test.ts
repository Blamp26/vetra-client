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
});
