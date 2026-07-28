import { describe, expect, it } from "vitest";
import { CallUxProjection } from "./callUxProjection";

const callId = "call-1";
const peer = "peer-1";
const generation = "generation-1";

function presentation(options: {
  callId?: string;
  state: string | null;
  role?: "initiator" | "recipient";
  phase?: string;
  stateVersion?: number | null;
  terminalState?: string | null;
}) {
  const phase = options.phase ?? (options.state === "active" ? "active" : "calling");
  return {
    disposed: false,
    phase,
    callId: options.callId ?? callId,
    participantRole: options.role ?? "initiator",
    peerPublicId: peer,
    peerUsername: "Peer",
    canonicalState: options.state,
    stateVersion: options.stateVersion ?? null,
    terminalState: options.terminalState ?? null,
    pendingAction: null,
    callIssue: null,
    recoverableError: null,
    canCancel: false,
    canHangup: options.state === "active",
  } as any;
}

function media(recovery: any = null, localIssue: any = null, id = callId, currentGeneration = generation) {
  return { callId: id, generation: currentGeneration, recovery, localIssue } as any;
}

function readyProjection() {
  const projection = new CallUxProjection();
  projection.handle({ type: "runtime_generation", generation });
  return projection;
}

describe("CallUxProjection", () => {
  it("keeps every outgoing pre-presented state idle and busy, then rings at presented", () => {
    const projection = readyProjection();
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: null, phase: "preparing" }) });
    expect(projection.getSnapshot()).toMatchObject({ status: { kind: "idle" }, actionBusy: true });
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "dispatching", phase: "calling", stateVersion: 1 }) });
    expect(projection.getSnapshot()).toMatchObject({ status: { kind: "idle" }, actionBusy: true });
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "delivered", phase: "calling", stateVersion: 2 }) });
    expect(projection.getSnapshot()).toMatchObject({ status: { kind: "idle" }, actionBusy: true });
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "presented", phase: "ringing", stateVersion: 3 }) });
    expect(projection.getSnapshot().status).toMatchObject({ kind: "ringing", direction: "outgoing" });
  });

  it("does not ring incoming delivered, but rings incoming presented", () => {
    const projection = readyProjection();
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "delivered", role: "recipient", phase: "incoming", stateVersion: 1 }) });
    expect(projection.getSnapshot().status.kind).toBe("idle");
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "presented", role: "recipient", phase: "ringing", stateVersion: 2 }) });
    expect(projection.getSnapshot().status).toMatchObject({ kind: "ringing", direction: "incoming" });
  });

  it("rejects lower versions, equal duplicates, and equal-version conflicts", () => {
    const projection = readyProjection();
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "connecting", phase: "connecting", stateVersion: 4 }) });
    const connecting = projection.getSnapshot();
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "presented", phase: "ringing", stateVersion: 3 }) });
    expect(projection.getSnapshot()).toBe(connecting);
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "connecting", phase: "connecting", stateVersion: 4 }) });
    expect(projection.getSnapshot()).toBe(connecting);
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "active", phase: "active", stateVersion: 4 }) });
    expect(projection.getSnapshot()).toBe(connecting);
  });

  it("keeps terminal state locked against delayed same-call events", () => {
    const projection = readyProjection();
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "active", phase: "active", stateVersion: 5 }) });
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "ended", phase: "terminal", stateVersion: 6, terminalState: "ended" }) });
    expect(projection.getSnapshot().status).toMatchObject({ kind: "ended", reason: "ended" });
    for (const state of ["active", "connecting", "presented"]) {
      projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state, phase: state === "active" ? "active" : state === "connecting" ? "connecting" : "ringing", stateVersion: 7 }) });
      expect(projection.getSnapshot().status).toMatchObject({ kind: "ended", reason: "ended" });
    }
  });

  it("latches rebuild exhaustion, clears on matching recovery, and gives terminal precedence", () => {
    const projection = readyProjection();
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "active", phase: "active", stateVersion: 1 }) });
    projection.handle({ type: "media_snapshot", snapshot: media({ phase: "peer_rebuild", attempt: 1 }) });
    projection.handle({ type: "media_snapshot", snapshot: media({ phase: "peer_rebuild", attempt: 1 }, "rebuild_exhausted") });
    expect(projection.getSnapshot().status).toMatchObject({ kind: "failed", reason: "rebuild_exhausted" });
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "active", phase: "active", stateVersion: 2 }) });
    expect(projection.getSnapshot().status).toMatchObject({ kind: "failed", reason: "rebuild_exhausted" });
    projection.handle({ type: "media_snapshot", snapshot: media(null) });
    expect(projection.getSnapshot().status.kind).toBe("connected");
    projection.handle({ type: "media_snapshot", snapshot: media(null, "permission_denied") });
    expect(projection.getSnapshot().status).toMatchObject({ kind: "failed", reason: "permission_denied" });
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "ended", phase: "terminal", stateVersion: 3, terminalState: "ended" }) });
    expect(projection.getSnapshot().status).toMatchObject({ kind: "ended", reason: "ended" });
  });

  it("rejects stale media generations and supports a new call after terminal", () => {
    const projection = readyProjection();
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "active", phase: "active", stateVersion: 1 }) });
    projection.handle({ type: "media_snapshot", snapshot: media({ phase: "ice_restart", attempt: 1 }, null, callId, "old-generation") });
    expect(projection.getSnapshot().status.kind).toBe("connected");
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ state: "ended", phase: "terminal", stateVersion: 2, terminalState: "ended" }) });
    projection.handle({ type: "runtime_generation", generation: "generation-2" });
    projection.handle({ type: "runtime_generation", generation });
    expect(projection.getSnapshot().status).toMatchObject({ kind: "idle" });
    projection.handle({ type: "presentation_snapshot", snapshot: presentation({ callId: "call-2", state: "active", phase: "active", stateVersion: 1 }) });
    expect(projection.getSnapshot().status).toMatchObject({ kind: "connected", callId: "call-2" });
  });
});
