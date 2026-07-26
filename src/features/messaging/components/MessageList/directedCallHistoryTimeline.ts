import type { DirectedCallHistoryEntry } from "@/api/directedCallHistory";
import type { Message } from "@/shared/types";

export const DIRECTED_CALL_HISTORY_LABELS = {
  "couldn't_reach": "Couldn't reach",
  user_busy: "User was busy",
  cancelled: "Cancelled",
  missed: "Missed call",
  no_answer: "No answer",
  declined: "Declined",
  call_failed: "Call failed",
  call_ended: "Call ended",
  completed: "Completed call",
} as const;

export type MessageTimelineEntry =
  | { kind: "message"; message: Message; timestamp: string; index: number }
  | { kind: "call"; call: DirectedCallHistoryEntry; timestamp: string; index: number };

export function getDirectedCallHistoryLabel(status: DirectedCallHistoryEntry["status"]): string {
  return DIRECTED_CALL_HISTORY_LABELS[status];
}

export function formatDirectedCallDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${totalMinutes}:${String(seconds).padStart(2, "0")}`;
}

export function getDirectedCallHistoryDuration(entry: DirectedCallHistoryEntry): string | null {
  return entry.status === "completed" && entry.duration_ms !== null
    ? formatDirectedCallDuration(entry.duration_ms)
    : null;
}

export function getDirectedCallHistoryTimestamp(entry: DirectedCallHistoryEntry): string {
  return entry.ended_at ?? entry.created_at;
}

function timelineDirection(messages: Message[], calls: DirectedCallHistoryEntry[]): 1 | -1 {
  const timestamps = messages.length > 0
    ? messages.map((message) => Date.parse(message.inserted_at))
    : calls.map((call) => Date.parse(getDirectedCallHistoryTimestamp(call)));
  for (let index = 1; index < timestamps.length; index += 1) {
    if (timestamps[index] > timestamps[index - 1]) return 1;
    if (timestamps[index] < timestamps[index - 1]) return -1;
  }
  return 1;
}

export function mergeMessageAndCallTimeline(messages: Message[], calls: DirectedCallHistoryEntry[]): MessageTimelineEntry[] {
  const uniqueCalls = new Map<string, DirectedCallHistoryEntry>();
  for (const call of calls) uniqueCalls.set(call.call_id, call);
  const direction = timelineDirection(messages, [...uniqueCalls.values()]);
  const entries: MessageTimelineEntry[] = [
    ...messages.map((message, index) => ({ kind: "message" as const, message, timestamp: message.inserted_at, index })),
    ...[...uniqueCalls.values()].map((call, index) => ({ kind: "call" as const, call, timestamp: getDirectedCallHistoryTimestamp(call), index })),
  ];
  return entries.sort((left, right) => {
    const timestampDifference = (Date.parse(left.timestamp) - Date.parse(right.timestamp)) * direction;
    if (timestampDifference !== 0) return timestampDifference;
    if (left.kind !== right.kind) return left.kind === "message" ? -1 : 1;
    if (left.kind === "call" && right.kind === "call") return left.call.call_id.localeCompare(right.call.call_id);
    return left.index - right.index;
  });
}
