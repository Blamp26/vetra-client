import type { Message } from "@/shared/types";
import { describe, expect, it } from "vitest";
import { getMessageSequenceFlags, isMessageSequenceContinuation } from "./messageGrouping";

const message = (overrides: Partial<Message> = {}): Message => ({
  id: 1,
  content: "hello",
  sender_id: 2,
  recipient_id: null,
  room_id: 7,
  status: "sent",
  inserted_at: "2026-08-01T10:00:00.000Z",
  ...overrides,
});

describe("message visual grouping", () => {
  it("groups adjacent messages from one sender within five minutes", () => {
    expect(isMessageSequenceContinuation(message(), message({ id: 2, inserted_at: "2026-08-01T10:05:00.000Z" }))).toBe(true);
  });

  it.each([
    ["sender change", { sender_id: 3 }],
    ["gap over five minutes", { inserted_at: "2026-08-01T10:05:01.000Z" }],
    ["date change", { inserted_at: "2026-08-02T10:00:00.000Z" }],
  ])("starts a new sequence on %s", (_, overrides) => {
    expect(isMessageSequenceContinuation(message(), message({ id: 2, ...overrides }))).toBe(false);
  });

  it("recalculates flags for a prepended page", () => {
    const flags = getMessageSequenceFlags([
      message({ id: 0, inserted_at: "2026-08-01T09:59:00.000Z" }),
      message({ id: 1 }),
      message({ id: 2, inserted_at: "2026-08-01T10:06:00.000Z" }),
    ]);
    expect(flags.map(({ isConsecutive, isGroupedWithNext }) => [isConsecutive, isGroupedWithNext])).toEqual([
      [false, true],
      [true, false],
      [false, false],
    ]);
  });

  it("does not crash with missing optional sender fields", () => {
    expect(message({ sender_display_name: undefined, sender_username: undefined, sender: undefined })).toBeTruthy();
  });
});
