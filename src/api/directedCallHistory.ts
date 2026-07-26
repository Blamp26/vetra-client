import { get } from "./base";

export type DirectedCallHistoryStatus =
  | "couldn't_reach"
  | "user_busy"
  | "cancelled"
  | "missed"
  | "no_answer"
  | "declined"
  | "call_failed"
  | "call_ended"
  | "completed";

export interface DirectedCallHistoryPeer {
  user_id: string;
  username: string;
}

export interface DirectedCallHistoryEntry {
  call_id: string;
  status: DirectedCallHistoryStatus;
  peer: DirectedCallHistoryPeer | null;
  created_at: string;
  ended_at: string | null;
  duration_ms: number | null;
}

export interface DirectedCallHistoryParams {
  limit?: number;
}

const DIRECTED_CALL_HISTORY_STATUSES: ReadonlySet<string> = new Set([
  "couldn't_reach",
  "user_busy",
  "cancelled",
  "missed",
  "no_answer",
  "declined",
  "call_failed",
  "call_ended",
  "completed",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid directed call history ${field}`);
  }

  return value;
}

function requireTimestamp(value: unknown, field: string): string {
  const timestamp = requireString(value, field);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`Invalid directed call history ${field}`);
  }

  return timestamp;
}

function nullableTimestamp(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  return requireTimestamp(value, field);
}

function nullableDuration(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("Invalid directed call history duration_ms");
  }

  return value;
}

function normalizePeer(value: unknown): DirectedCallHistoryPeer | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error("Invalid directed call history peer");

  const userId = requireString(value.user_id, "peer.user_id");
  const username = requireString(value.username, "peer.username");

  return {
    user_id: userId,
    username,
  };
}

function normalizeEntry(value: unknown): DirectedCallHistoryEntry {
  if (!isRecord(value)) throw new Error("Invalid directed call history entry");

  const callId = requireString(value.call_id, "call_id");
  if (!UUID_PATTERN.test(callId)) throw new Error("Invalid directed call history call_id");

  const status = requireString(value.status, "status");
  if (!DIRECTED_CALL_HISTORY_STATUSES.has(status)) {
    throw new Error("Invalid directed call history status");
  }

  return {
    call_id: callId,
    status: status as DirectedCallHistoryStatus,
    peer: normalizePeer(value.peer),
    created_at: requireTimestamp(value.created_at, "created_at"),
    ended_at: nullableTimestamp(value.ended_at, "ended_at"),
    duration_ms: nullableDuration(value.duration_ms),
  };
}

export function normalizeDirectedCallHistoryResponse(value: unknown): DirectedCallHistoryEntry[] {
  if (!Array.isArray(value)) throw new Error("Invalid directed call history response");
  return value.map(normalizeEntry);
}

export const directedCallHistoryApi = {
  getHistory(params: DirectedCallHistoryParams = {}): Promise<DirectedCallHistoryEntry[]> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));

    const suffix = query.toString() ? `?${query.toString()}` : "";
    return get<unknown>(`/directed-calls/history${suffix}`).then(normalizeDirectedCallHistoryResponse);
  },
};
