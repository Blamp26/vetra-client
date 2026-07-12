import { describe, expect, it } from "vitest";
import { sortConversationItems } from "./conversationOrdering";

describe("sortConversationItems", () => {
  it("puts pinned items first, then newest activity, with deterministic fallback ordering", () => {
    const sorted = sortConversationItems([
      { kind: "room" as const, id: 9, time: null, pinned: false },
      { kind: "direct" as const, id: 4, time: "2026-07-02T00:00:00Z", pinned: false },
      { kind: "direct" as const, id: 2, time: "2026-07-03T00:00:00Z", pinned: true },
      { kind: "room" as const, id: 3, time: null, pinned: false },
    ]);

    expect(sorted.map(({ kind, id }) => `${kind}-${id}`)).toEqual([
      "direct-2",
      "direct-4",
      "room-3",
      "room-9",
    ]);
  });
});
