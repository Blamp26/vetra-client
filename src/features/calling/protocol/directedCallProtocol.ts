export const DIRECTED_CALL_PROTOCOL_VERSION = 1 as const;
export const DIRECTED_CALL_CAPABILITY = "directed_calls_v1" as const;
export const DIRECTED_CALL_TOPIC_PREFIX = "directed_call:" as const;

export const DIRECTED_CALL_EVENTS = {
  initiate: "call:initiate",
  received: "call:received",
  presented: "call:presented",
  accept: "call:accept",
  beginConnecting: "call:begin_connecting",
  mediaReady: "call:media_ready",
  setupFailed: "call:setup_failed",
  cancel: "call:cancel",
  decline: "call:decline",
  hangup: "call:hangup",
  sync: "call:sync",
  signal: "call:signal",
  state: "call:state",
} as const;

export const FAILURE_CODES = [
  "permission_denied",
  "microphone_unavailable",
  "peer_connection_failed",
  "sdp_failed",
  "ice_failed",
  "media_binding_failed",
] as const;
/** Signal kinds supported by the persistent initial-negotiation boundary. */
export const SIGNAL_KINDS = ["offer", "answer", "ice_candidate"] as const;
export const CANONICAL_STATES = ["dispatching", "delivered", "presented", "accepted", "connecting", "active", "unavailable", "undelivered", "busy", "declined", "cancelled", "no_answer", "connection_failed", "ended"] as const;
export const PARTICIPANT_ROLES = ["initiator", "recipient"] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];
export type SignalKind = (typeof SIGNAL_KINDS)[number];
export type CanonicalState = (typeof CANONICAL_STATES)[number];
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
export type UUID = string;

export interface JoinPayload { protocol_version: 1; capabilities: string[]; device_id: UUID }
export interface JoinResponse { protocol_version: 1; capabilities: ["directed_calls_v1"] }
export interface InitiatePayload { protocol_version: 1; command_id: UUID; device_id: UUID; target_user_id: string; media: "audio" }
export interface CommandPayload { protocol_version: 1; call_id: UUID; command_id: UUID; device_id: UUID }
export interface SetupFailedPayload extends CommandPayload { failure_code: FailureCode }
export interface KnownCall { call_id: UUID; state_version: number }
export interface SyncPayload { protocol_version: 1; request_id: UUID; device_id: UUID; known_calls: KnownCall[] }
export interface Peer { user_id: string; username: string }
export interface StateProjection {
  protocol_version: 1; call_id: UUID; state: CanonicalState; state_version: number; media: "audio";
  participant_role: ParticipantRole; peer: Peer; created_at: string; presented_at: string | null;
  accepted_at: string | null; connecting_at: string | null; active_at: string | null; ended_at: string | null;
}
export interface InitiateResult { call_id: UUID; state: CanonicalState; state_version: number; media: "audio"; participant_role: ParticipantRole; merged: boolean; attempt_created: boolean }
export interface InitiateReply { protocol_version: 1; status: "ok"; result: InitiateResult }
export type CommandResultCode = "applied" | "no_op" | "duplicate" | "rejected";
export interface CommandResult { call_id: UUID; state: CanonicalState; state_version: number; result_code: CommandResultCode }
export interface CommandReply { protocol_version: 1; status: "ok"; result: CommandResult }
export interface SyncResponse { protocol_version: 1; status: "ok"; request_id: UUID; calls: StateProjection[] }
export interface SignalPayload { sdp: string; screen_share?: boolean }
export interface IcePayload { candidate: string; sdp_mid: string | null; sdp_mline_index: number | null; username_fragment: string | null }
export interface SignalEnvelope { protocol_version: 1; call_id: UUID; signal_id: UUID; kind: SignalKind; payload: SignalPayload | IcePayload }
export interface OutboundSignalEnvelope extends SignalEnvelope { device_id: UUID }

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_ID_RE = UUID_RE;

export function buildJoin(deviceId: UUID, capabilities: string[] = [DIRECTED_CALL_CAPABILITY]): JoinPayload {
  if (!isUuid(deviceId) || capabilities.length === 0 || capabilities.length > 16 || new Set(capabilities).size !== capabilities.length || capabilities.some((value) => value.length === 0 || value.length > 64) || !capabilities.includes(DIRECTED_CALL_CAPABILITY)) throw new Error("invalid directed-call join");
  return { protocol_version: 1, capabilities: [...capabilities], device_id: canonicalUuid(deviceId) };
}

export function buildInitiate(commandId: UUID, deviceId: UUID, targetUserId: string): InitiatePayload {
  if (!isUuid(commandId) || !isUuid(deviceId) || !PUBLIC_ID_RE.test(targetUserId) || !targetUserId) throw new Error("invalid directed-call initiate");
  return { protocol_version: 1, command_id: canonicalUuid(commandId), device_id: canonicalUuid(deviceId), target_user_id: canonicalUuid(targetUserId), media: "audio" };
}

export function buildCommand(callId: UUID, commandId: UUID, deviceId: UUID): CommandPayload {
  if (![callId, commandId, deviceId].every(isUuid)) throw new Error("invalid directed-call command");
  return { protocol_version: 1, call_id: canonicalUuid(callId), command_id: canonicalUuid(commandId), device_id: canonicalUuid(deviceId) };
}

export function buildSetupFailed(callId: UUID, commandId: UUID, deviceId: UUID, failureCode: FailureCode): SetupFailedPayload {
  if (!FAILURE_CODES.includes(failureCode)) throw new Error("invalid setup failure code");
  return { ...buildCommand(callId, commandId, deviceId), failure_code: failureCode };
}

export function buildSync(requestId: UUID, deviceId: UUID, knownCalls: KnownCall[]): SyncPayload {
  if (!isUuid(requestId) || !isUuid(deviceId) || knownCalls.length > 16 || new Set(knownCalls.map((call) => call.call_id)).size !== knownCalls.length || knownCalls.some((call) => !isUuid(call.call_id) || !isSafeInteger(call.state_version))) throw new Error("invalid directed-call sync");
  return { protocol_version: 1, request_id: canonicalUuid(requestId), device_id: canonicalUuid(deviceId), known_calls: knownCalls.map((call) => ({ call_id: canonicalUuid(call.call_id), state_version: call.state_version })) };
}

export function buildSignal(callId: UUID, signalId: UUID, deviceId: UUID, kind: SignalKind, payload: SignalPayload | IcePayload): OutboundSignalEnvelope {
  if (![callId, signalId, deviceId].every(isUuid) || !SIGNAL_KINDS.includes(kind) || !validSignalPayload(kind, payload)) throw new Error("invalid directed-call signal");
  return { protocol_version: 1, call_id: canonicalUuid(callId), signal_id: canonicalUuid(signalId), device_id: canonicalUuid(deviceId), kind, payload };
}

export function decodeInitiate(value: unknown): InitiatePayload | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["protocol_version", "command_id", "device_id", "target_user_id", "media"]) || value.protocol_version !== 1 || !isUuid(value.command_id) || !isUuid(value.device_id) || !isUuid(value.target_user_id) || value.media !== "audio") return null;
  return { protocol_version: 1, command_id: canonicalUuid(value.command_id), device_id: canonicalUuid(value.device_id), target_user_id: canonicalUuid(value.target_user_id), media: "audio" };
}

export function decodeCommand(value: unknown): CommandPayload | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["protocol_version", "call_id", "command_id", "device_id"]) || value.protocol_version !== 1 || !isUuid(value.call_id) || !isUuid(value.command_id) || !isUuid(value.device_id)) return null;
  return { protocol_version: 1, call_id: canonicalUuid(value.call_id), command_id: canonicalUuid(value.command_id), device_id: canonicalUuid(value.device_id) };
}

export function decodeSetupFailed(value: unknown): SetupFailedPayload | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["protocol_version", "call_id", "command_id", "device_id", "failure_code"]) || !FAILURE_CODES.includes(value.failure_code as FailureCode)) return null;
  const command = decodeCommand(value);
  return command ? { ...command, failure_code: value.failure_code as FailureCode } : null;
}

export function decodeSync(value: unknown): SyncPayload | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["protocol_version", "request_id", "device_id", "known_calls"]) || value.protocol_version !== 1 || !isUuid(value.request_id) || !isUuid(value.device_id) || !Array.isArray(value.known_calls) || value.known_calls.length > 16) return null;
  const knownCalls = value.known_calls;
  if (new Set(knownCalls.map((call) => isRecord(call) ? call.call_id : undefined)).size !== knownCalls.length || knownCalls.some((call) => !isRecord(call) || !hasOnlyKeys(call, ["call_id", "state_version"]) || !isUuid(call.call_id) || !isSafeInteger(call.state_version))) return null;
  return { protocol_version: 1, request_id: canonicalUuid(value.request_id), device_id: canonicalUuid(value.device_id), known_calls: knownCalls.map((call) => ({ call_id: canonicalUuid((call as Record<string, any>).call_id), state_version: (call as Record<string, any>).state_version })) };
}

export function decodeState(value: unknown): StateProjection | null {
  if (!isRecord(value) || value.protocol_version !== 1 || !isUuid(value.call_id) || !CANONICAL_STATES.includes(value.state as CanonicalState) || !isSafeInteger(value.state_version) || value.media !== "audio" || !PARTICIPANT_ROLES.includes(value.participant_role as ParticipantRole) || !isPeer(value.peer) || !isTimestamp(value.created_at) || !optionalTimestamp(value.presented_at) || !optionalTimestamp(value.accepted_at) || !optionalTimestamp(value.connecting_at) || !optionalTimestamp(value.active_at) || !optionalTimestamp(value.ended_at)) return null;
  return { protocol_version: 1, call_id: canonicalUuid(value.call_id), state: value.state as CanonicalState, state_version: value.state_version, media: "audio", participant_role: value.participant_role as ParticipantRole, peer: { user_id: canonicalUuid(value.peer.user_id), username: value.peer.username }, created_at: value.created_at, presented_at: value.presented_at, accepted_at: value.accepted_at, connecting_at: value.connecting_at, active_at: value.active_at, ended_at: value.ended_at };
}

export function decodeSignal(value: unknown): SignalEnvelope | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["protocol_version", "call_id", "signal_id", "kind", "payload"]) || value.protocol_version !== 1 || !isUuid(value.call_id) || !isUuid(value.signal_id) || !SIGNAL_KINDS.includes(value.kind as SignalKind) || !validSignalPayload(value.kind as SignalKind, value.payload)) return null;
  return { protocol_version: 1, call_id: canonicalUuid(value.call_id), signal_id: canonicalUuid(value.signal_id), kind: value.kind as SignalKind, payload: value.payload as SignalPayload | IcePayload };
}

export function classifyState(previous: StateProjection | null, nextValue: unknown): "accept" | "duplicate" | "stale" | "conflict" {
  const next = decodeState(nextValue);
  if (!next) return "conflict";
  if (!previous || previous.call_id !== next.call_id) return "accept";
  if (next.state_version > previous.state_version) return "accept";
  if (next.state_version < previous.state_version) return "stale";
  return JSON.stringify(previous) === JSON.stringify(next) ? "duplicate" : "conflict";
}

export function isUuid(value: unknown): value is UUID { return typeof value === "string" && UUID_RE.test(value); }
export function canonicalUuid(value: string): string { return value.toLowerCase(); }
function isSafeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_SAFE_INTEGER; }
function isTimestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value); }
function optionalTimestamp(value: unknown): value is string | null { return value === null || isTimestamp(value); }
function isPeer(value: unknown): value is Peer { return isRecord(value) && typeof value.user_id === "string" && PUBLIC_ID_RE.test(value.user_id) && typeof value.username === "string" && value.username.length > 0 && value.username.length <= 32; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasOnlyKeys(value: Record<string, any>, keys: string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)); }
function validSignalPayload(kind: SignalKind, value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (kind === "ice_candidate") return hasOnlyKeys(value, ["candidate", "sdp_mid", "sdp_mline_index", "username_fragment"]) && typeof value.candidate === "string" && value.candidate.length > 0 && value.candidate.length <= 8192 && (value.sdp_mid === null || (typeof value.sdp_mid === "string" && value.sdp_mid.length <= 256)) && (value.sdp_mline_index === null || isSafeInteger(value.sdp_mline_index)) && (value.username_fragment === null || (typeof value.username_fragment === "string" && value.username_fragment.length <= 256));
  return hasOnlyKeys(value, ["sdp"]) && typeof value.sdp === "string" && value.sdp.length > 0 && value.sdp.length <= 262144;
}
