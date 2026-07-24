import { describe, expect, it } from "vitest";
import { persistentActiveCallDockModel, persistentCallElapsedSeconds, persistentCallSidebarModel } from "./PersistentCallViewModel";

const basePresentation = {
  phase: "ringing",
  callId: "11111111-1111-4111-8111-111111111111",
  participantRole: "initiator",
  peerPublicId: "22222222-2222-4222-8222-222222222222",
  peerUsername: "Morf",
  statusLabel: "Ringing",
  terminalLabel: null,
  timestamps: null,
  terminalState: null,
  pendingAction: null,
  callIssue: null,
  recoverableError: null,
  canCancel: true,
  canHangup: false,
  incomingModal: { visible: false, callerDisplayName: "", presentationKey: null },
} as any;

function call(presentation = basePresentation) {
  return {
    presentation,
    media: { peerConnectionState: "connected", localIssue: null },
    isMuted: false,
  } as any;
}

describe("persistent call presentation adapter", () => {
  it("keeps outgoing ringing distinct from correlated incoming presentation", () => {
    const outgoing = persistentCallSidebarModel(call(), 0);
    const incoming = persistentCallSidebarModel(call({
      ...basePresentation,
      phase: "incoming",
      participantRole: "recipient",
      incomingModal: { visible: true, callerDisplayName: "Blamp26", presentationKey: basePresentation.callId },
    }), 0);

    expect(outgoing).toMatchObject({ status: "calling", direction: "outgoing", remoteUsername: "Morf", canCancel: true });
    expect(incoming).toMatchObject({ status: "ringing", direction: "incoming", remoteUsername: "Blamp26" });
  });

  it("maps dock identity, issue, mute state, diagnostics, and elapsed time", () => {
    const model = persistentActiveCallDockModel(call({
      ...basePresentation,
      phase: "active",
      timestamps: { active_at: "2026-01-01T00:00:00.000Z" },
      callIssue: { kind: "transport", message: "Connection issue" },
    }), { id: 1, public_id: "me", display_name: "Me" } as any, { public_id: basePresentation.peerPublicId, username: "morf" } as any, 12);

    expect(model).toMatchObject({ remoteUserId: basePresentation.peerPublicId, remoteUsername: "Morf", seconds: 12, callIssue: { message: "Connection issue" } });
    expect(model.diagnostics.connectionState).toBe("connected");
  });

  it("stops elapsed time at termination and resets without timestamps", () => {
    const active = { ...basePresentation, phase: "active", timestamps: { active_at: "2026-01-01T00:00:00.000Z" } } as any;
    const ended = { ...active, phase: "terminal", terminalState: "ended", timestamps: { ...active.timestamps, ended_at: "2026-01-01T00:00:05.000Z" } } as any;
    expect(persistentCallElapsedSeconds(active, Date.parse("2026-01-01T00:00:09.000Z"))).toBe(9);
    expect(persistentCallElapsedSeconds(ended, Date.parse("2026-01-01T00:01:00.000Z"))).toBe(5);
    expect(persistentCallElapsedSeconds({ ...basePresentation, phase: "idle", timestamps: null } as any)).toBe(0);
  });
});
