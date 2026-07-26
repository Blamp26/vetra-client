import { describe, expect, it } from "vitest";
import type { DirectedCallHistoryEntry } from "@/api/directedCallHistory";
import type { Message } from "@/shared/types";
import {
  DIRECTED_CALL_HISTORY_LABELS,
  formatDirectedCallDuration,
  getDirectedCallHistoryDuration,
  getDirectedCallHistoryTimestamp,
  mergeMessageAndCallTimeline,
} from "./directedCallHistoryTimeline";

const statuses = Object.keys(DIRECTED_CALL_HISTORY_LABELS) as DirectedCallHistoryEntry["status"][];

function call(status: DirectedCallHistoryEntry["status"], callId = `00000000-0000-0000-0000-${String(callIdCounter++).padStart(12, "0")}`, overrides: Partial<DirectedCallHistoryEntry> = {}): DirectedCallHistoryEntry {
  return {
    call_id: callId,
    status,
    peer: { user_id: "peer-1", username: "peer" },
    created_at: "2026-07-01T10:00:00Z",
    ended_at: null,
    duration_ms: null,
    ...overrides,
  };
}

let callIdCounter = 1;
function message(id: number, insertedAt: string): Message {
  return { id, inserted_at: insertedAt, sender_id: 1, content: `message ${id}` } as Message;
}

describe("directed call history presentation", () => {
  it("maps every verified status to its exact public label", () => {
    expect(DIRECTED_CALL_HISTORY_LABELS).toEqual({
      "couldn't_reach": "Couldn't reach",
      user_busy: "User was busy",
      cancelled: "Cancelled",
      missed: "Missed call",
      no_answer: "No answer",
      declined: "Declined",
      call_failed: "Call failed",
      call_ended: "Call ended",
      completed: "Completed call",
    });
    expect(statuses.every((status) => !DIRECTED_CALL_HISTORY_LABELS[status].includes(status))).toBe(true);
  });

  it("uses ended_at first and falls back to created_at", () => {
    const ended = call("completed", undefined, { ended_at: "2026-07-02T10:00:00Z" });
    const created = call("missed", undefined, { ended_at: null });
    expect(getDirectedCallHistoryTimestamp(ended)).toBe("2026-07-02T10:00:00Z");
    expect(getDirectedCallHistoryTimestamp(created)).toBe(created.created_at);
  });

  it("formats duration deterministically without rounding and keeps zero visible", () => {
    expect(formatDirectedCallDuration(0)).toBe("0:00");
    expect(formatDirectedCallDuration(999)).toBe("0:00");
    expect(formatDirectedCallDuration(1_000)).toBe("0:01");
    expect(formatDirectedCallDuration(59_999)).toBe("0:59");
    expect(formatDirectedCallDuration(60_000)).toBe("1:00");
    expect(formatDirectedCallDuration(3_599_999)).toBe("59:59");
    expect(formatDirectedCallDuration(3_600_000)).toBe("1:00:00");
    expect(getDirectedCallHistoryDuration(call("completed", undefined, { duration_ms: null }))).toBeNull();
    expect(getDirectedCallHistoryDuration(call("completed", undefined, { duration_ms: 0 }))).toBe("0:00");
    for (const status of statuses.filter((candidate) => candidate !== "completed")) {
      expect(getDirectedCallHistoryDuration(call(status, undefined, { duration_ms: 42_000 }))).toBeNull();
    }
  });

  it("merges in the existing chronological direction with deterministic ties", () => {
    const messages = [message(1, "2026-07-01T10:00:00Z"), message(2, "2026-07-01T10:10:00Z")];
    const calls = [
      call("missed", "b-call-00000000-0000-0000-0000-000000000001", { created_at: "2026-07-01T10:05:00Z" }),
      call("completed", "a-call-00000000-0000-0000-0000-000000000001", { created_at: "2026-07-01T10:05:00Z", duration_ms: 0 }),
      call("declined", "c-call-00000000-0000-0000-0000-000000000001", { created_at: "2026-07-01T10:00:00Z" }),
    ];
    const timeline = mergeMessageAndCallTimeline(messages, [...calls, calls[0]]);
    expect(timeline.map((entry) => entry.kind === "message" ? entry.message.id : entry.call.call_id)).toEqual([
      1,
      "c-call-00000000-0000-0000-0000-000000000001",
      "a-call-00000000-0000-0000-0000-000000000001",
      "b-call-00000000-0000-0000-0000-000000000001",
      2,
    ]);
    expect(timeline.filter((entry) => entry.kind === "message").map((entry) => entry.message.id)).toEqual([1, 2]);
  });

  it("preserves descending message timelines", () => {
    const timeline = mergeMessageAndCallTimeline(
      [message(2, "2026-07-01T10:10:00Z"), message(1, "2026-07-01T10:00:00Z")],
      [call("missed", "call-00000000-0000-0000-0000-000000000001", { created_at: "2026-07-01T10:05:00Z" })],
    );
    expect(timeline.map((entry) => entry.kind === "message" ? entry.message.id : entry.call.call_id)).toEqual([
      2,
      "call-00000000-0000-0000-0000-000000000001",
      1,
    ]);
  });
});
