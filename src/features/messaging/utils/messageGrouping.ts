import type { Message } from "@/shared/types";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function calendarDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

/** Returns whether two adjacent real messages belong to one visual sequence. */
export function isMessageSequenceContinuation(previous: Message | undefined, current: Message | undefined) {
  if (!current) return false;
  if (!previous || previous.sender_id !== current.sender_id) return false;
  if (calendarDate(previous.inserted_at) !== calendarDate(current.inserted_at)) return false;

  const previousTime = new Date(previous.inserted_at).getTime();
  const currentTime = new Date(current.inserted_at).getTime();
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return false;

  const gap = currentTime - previousTime;
  return gap >= 0 && gap <= FIVE_MINUTES_MS;
}

export function getMessageSequenceFlags(messages: Message[]) {
  return messages.map((message, index) => ({
    isConsecutive: isMessageSequenceContinuation(messages[index - 1], message),
    isGroupedWithNext: isMessageSequenceContinuation(message, messages[index + 1]),
  }));
}
