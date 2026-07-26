import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDirectedCallDiagnosticTimeline,
  recordDirectedCallDiagnostic,
  resetDirectedCallDiagnosticTimeline,
  subscribeToDirectedCallDiagnostics,
} from "./directedCallDiagnostics";
import { setCallDebugEnabled } from "../utils/callDebug";

describe("directed-call diagnostics", () => {
  beforeEach(() => setCallDebugEnabled(true));
  afterEach(() => { resetDirectedCallDiagnosticTimeline(); setCallDebugEnabled(false); });

  it("keeps bounded, correlated single-line events without SDP or candidate contents", () => {
    recordDirectedCallDiagnostic("renegotiate_offer_sent", {
      callId: "11111111-1111-4111-8111-111111111111",
      transactionId: "22222222-2222-4222-8222-222222222222",
      role: "initiator",
      generation: "window:7",
      adapterGeneration: 3,
      canonicalState: "active",
      mediaPhase: "signaling_ready",
      localVideoDirection: "sendonly",
      reason: "sdp omitted",
    });

    const entry = getDirectedCallDiagnosticTimeline()[0];
    expect(entry.line).toContain("call_id=11111111…");
    expect(entry.line).toContain("transaction_id=22222222…");
    expect(entry.line).toContain("local_video_direction=sendonly");
    expect(entry.line).not.toContain("v=0");
    expect(entry.line).not.toContain("candidate:");
    expect(entry.line).not.toContain("10.0.0.1");
    expect(entry.line).not.toContain("username");
  });

  it("records tagged ICE rejection reasons and distinguishes media milestones", () => {
    recordDirectedCallDiagnostic("ice_rejected", {
      callId: "11111111-1111-4111-8111-111111111111",
      transactionId: "22222222-2222-4222-8222-222222222222",
      role: "recipient",
      generation: "window:7",
      canonicalState: "active",
      mediaPhase: "signaling_ready",
      candidateAction: "rejected",
      candidateReason: "stale_or_unknown_renegotiation",
    });
    recordDirectedCallDiagnostic("remote_video_ontrack", { callId: "11111111-1111-4111-8111-111111111111", role: "recipient" });
    recordDirectedCallDiagnostic("remote_screen_snapshot_published", { callId: "11111111-1111-4111-8111-111111111111", role: "recipient", remoteStreamPresent: true });

    expect(getDirectedCallDiagnosticTimeline().map((entry) => entry.event)).toEqual([
      "ice_rejected",
      "remote_video_ontrack",
      "remote_screen_snapshot_published",
    ]);
    expect(getDirectedCallDiagnosticTimeline()[0].line).toContain("candidate_reason=stale_or_unknown_renegotiation");
  });

  it("gates storage and isolates throwing listeners", () => {
    setCallDebugEnabled(false);
    const disabledListener = () => { throw new Error("must not run"); };
    const disabledUnsubscribe = subscribeToDirectedCallDiagnostics(disabledListener);
    recordDirectedCallDiagnostic("media_phase", { reason: "disabled" });
    expect(getDirectedCallDiagnosticTimeline()).toEqual([]);
    disabledUnsubscribe();

    setCallDebugEnabled(true);
    const throwingListener = () => { throw new Error("listener failure"); };
    const unsubscribe = subscribeToDirectedCallDiagnostics(throwingListener);
    expect(() => recordDirectedCallDiagnostic("media_phase", { reason: "enabled" })).not.toThrow();
    expect(getDirectedCallDiagnosticTimeline()).toHaveLength(1);
    unsubscribe();
  });

  it("deduplicates unchanged records but preserves ordered ICE records", () => {
    recordDirectedCallDiagnostic("peer_connection", { peerConnection: "connected" });
    recordDirectedCallDiagnostic("peer_connection", { peerConnection: "connected" });
    recordDirectedCallDiagnostic("ice_received", { candidateAction: "received", candidateIndex: 1 });
    recordDirectedCallDiagnostic("ice_received", { candidateAction: "received", candidateIndex: 2 });
    expect(getDirectedCallDiagnosticTimeline().map((entry) => entry.event)).toEqual([
      "peer_connection", "ice_received", "ice_received",
    ]);
  });

  it("bounds free-form diagnostics and redacts sensitive patterns", () => {
    recordDirectedCallDiagnostic("failure", {
      reason: `https://user:password@example.test/token=secret candidate:1 10.0.0.1 ${"x".repeat(200)}`,
      failureKind: "v=0 credential=top-secret",
    });
    const line = getDirectedCallDiagnosticTimeline()[0].line;
    expect(line.length).toBeLessThan(700);
    expect(line).not.toContain("user:password");
    expect(line).not.toContain("10.0.0.1");
    expect(line).not.toContain("top-secret");
    expect(line).toContain("url-redacted");
  });

  it("keeps only the bounded tail", () => {
    for (let index = 0; index < 170; index += 1) {
      recordDirectedCallDiagnostic("media_phase", { reason: `phase_${index}` });
    }
    const entries = getDirectedCallDiagnosticTimeline();
    expect(entries).toHaveLength(160);
    expect(entries[0].line).toContain("phase_10");
    expect(entries[entries.length - 1]?.line).toContain("phase_169");
  });
});
