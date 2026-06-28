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
});
