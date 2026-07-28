import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistentCallProvider, usePersistentCall } from "./PersistentCallContext";
import type { DirectedCallMediaCoordinatorSnapshot } from "../services/directedCallMediaCoordinator";
import { CallUxProjection } from "../services/callUxProjection";

const baseSnapshot = {
  state: "signaling_ready",
  callId: "33333333-3333-4333-8333-333333333333",
  participantRole: "initiator",
  projection: null,
  generation: "g1",
  remoteAudioStream: null,
  localScreenShareStream: null,
  isLocalScreenShareActive: false,
  remoteScreenShareStream: null,
  localIssue: null,
  peerConnectionState: "connected",
  isMuted: false,
  canToggleMute: true,
} as unknown as DirectedCallMediaCoordinatorSnapshot;

function presentationSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    phase: "active",
    callId: baseSnapshot.callId,
    participantRole: "initiator",
    peerPublicId: "44444444-4444-4444-8444-444444444444",
    peerUsername: "Morf",
    statusLabel: "Active",
    terminalLabel: null,
    timestamps: { active_at: "2026-01-01T00:00:00.000Z" },
    terminalState: null,
    pendingAction: null,
    callIssue: null,
    recoverableError: null,
    canCancel: false,
    canHangup: true,
    incomingModal: { visible: false, callerDisplayName: "", presentationKey: null },
    ...overrides,
  } as any;
}

function makeRuntime(snapshot = baseSnapshot, uxProjection?: CallUxProjection) {
  const listeners = new Set<(next: DirectedCallMediaCoordinatorSnapshot) => void>();
  const presentationListeners = new Set<(next: any) => void>();
  let currentPresentation = presentationSnapshot();
  const media = {
    getSnapshot: vi.fn(() => snapshot),
    subscribe: vi.fn((listener: (next: DirectedCallMediaCoordinatorSnapshot) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    startScreenShare: vi.fn().mockResolvedValue(true),
    stopScreenShare: vi.fn().mockResolvedValue(true),
    toggleMute: vi.fn(() => true),
    emit(next: DirectedCallMediaCoordinatorSnapshot) {
      listeners.forEach((listener) => listener(next));
    },
  };
  const presentation = {
    getSnapshot: vi.fn(() => currentPresentation),
    subscribe: vi.fn((listener: (next: any) => void) => {
      presentationListeners.add(listener);
      return () => presentationListeners.delete(listener);
    }),
    startCall: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    cancelCall: vi.fn(),
    hangup: vi.fn(),
    retryPendingAction: vi.fn(),
    emit(next: any) {
      currentPresentation = next;
      presentationListeners.forEach((listener) => listener(next));
    },
  };
  return { presentation, media, uxProjection };
}

function Probe() {
  const call = usePersistentCall();
  return (
    <div>
      <output data-testid="screen-capable">{String(call.screenShareAvailable)}</output>
      <output data-testid="screen-active">{String(call.isScreenSharing)}</output>
      <output data-testid="remote-available">{String(call.remoteScreenShareAvailable)}</output>
      <output data-testid="local-stream">{String(Boolean(call.localScreenShareStream))}</output>
      <output data-testid="remote-stream">{String(Boolean(call.remoteScreenShareStream))}</output>
      <output data-testid="ux-kind">{call.ux.status.kind}</output>
      <output data-testid="ux-busy">{String(call.ux.actionBusy)}</output>
      <output data-testid="ux-recovery">
        {call.ux.status.kind === "reconnecting" ? `${call.ux.status.recovery.strategy}:${call.ux.status.recovery.attempt}` : ""}
      </output>
      <output data-testid="ux-reason">{call.ux.status.kind === "ended" ? call.ux.status.reason : ""}</output>
      <button onClick={() => { void call.startScreenShare(); }}>start</button>
      <button onClick={() => { void call.stopScreenShare(); }}>stop</button>
    </div>
  );
}

function renderRuntime(runtime: ReturnType<typeof makeRuntime>) {
  return render(<PersistentCallProvider runtime={runtime as any}><Probe /></PersistentCallProvider>);
}

describe("PersistentCallProvider screen-share exposure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gates capability by authoritative active projection and getDisplayMedia", () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getDisplayMedia: vi.fn() } });
    const runtime = makeRuntime({ ...baseSnapshot, projection: { state: "active" } as any });
    renderRuntime(runtime);
    expect(screen.getByTestId("screen-capable")).toHaveTextContent("true");

    act(() => runtime.media.emit({ ...baseSnapshot, projection: { state: "connecting" } as any }));
    expect(screen.getByTestId("screen-capable")).toHaveTextContent("false");
  });

  it("propagates local and remote state and delegates only to the coordinator", () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getDisplayMedia: vi.fn() } });
    const localStream = {} as any;
    const remoteStream = {} as any;
    const runtime = makeRuntime({
      ...baseSnapshot,
      projection: { state: "active" } as any,
      localScreenShareStream: localStream,
      isLocalScreenShareActive: true,
      remoteScreenShareStream: remoteStream,
    });
    renderRuntime(runtime);
    expect(screen.getByTestId("screen-active")).toHaveTextContent("true");
    expect(screen.getByTestId("local-stream")).toHaveTextContent("true");
    expect(screen.getByTestId("remote-available")).toHaveTextContent("true");
    expect(screen.getByTestId("remote-stream")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "start" }));
    fireEvent.click(screen.getByRole("button", { name: "stop" }));
    expect(runtime.media.startScreenShare).toHaveBeenCalledTimes(1);
    expect(runtime.media.stopScreenShare).toHaveBeenCalledTimes(1);
  });

  it("does not let stale runtime snapshots affect a replacement runtime", () => {
    const first = makeRuntime({ ...baseSnapshot, projection: { state: "active" } as any, isLocalScreenShareActive: true });
    const second = makeRuntime({ ...baseSnapshot, projection: { state: "active" } as any });
    const view = renderRuntime(first);
    view.rerender(<PersistentCallProvider runtime={second as any}><Probe /></PersistentCallProvider>);
    first.media.emit({ ...baseSnapshot, projection: { state: "active" } as any, isLocalScreenShareActive: true, localScreenShareStream: {} as any });
    expect(screen.getByTestId("screen-active")).toHaveTextContent("false");
    view.unmount();
    first.media.emit({ ...baseSnapshot, isLocalScreenShareActive: true });
    expect(second.media.subscribe).toHaveBeenCalledTimes(1);
  });

  it("exposes the runtime UX projection through the persistent context", () => {
    const uxProjection = new CallUxProjection();
    uxProjection.handle({ type: "runtime_generation", generation: "g1" });
    const provisional = presentationSnapshot({
      phase: "preparing",
      callId: baseSnapshot.callId,
      participantRole: "initiator",
      peerPublicId: "44444444-4444-4444-8444-444444444444",
      canonicalState: null,
      stateVersion: null,
    });
    const runtime = makeRuntime({ ...baseSnapshot, recovery: null } as any);
    runtime.uxProjection = uxProjection;
    runtime.presentation.emit(provisional);
    const view = renderRuntime(runtime);

    expect(screen.getByTestId("ux-kind")).toHaveTextContent("idle");
    act(() => uxProjection.handle({ type: "presentation_snapshot", snapshot: provisional }));
    expect(screen.getByTestId("ux-kind")).toHaveTextContent("idle");
    expect(screen.getByTestId("ux-busy")).toHaveTextContent("true");

    const presented = presentationSnapshot({ phase: "ringing", canonicalState: "presented", stateVersion: 1 });
    act(() => uxProjection.handle({ type: "presentation_snapshot", snapshot: presented }));
    expect(screen.getByTestId("ux-kind")).toHaveTextContent("ringing");

    const connecting = presentationSnapshot({ phase: "connecting", canonicalState: "connecting", stateVersion: 2 });
    act(() => uxProjection.handle({ type: "presentation_snapshot", snapshot: connecting }));
    expect(screen.getByTestId("ux-kind")).toHaveTextContent("connecting");

    const active = presentationSnapshot({ phase: "active", canonicalState: "active", stateVersion: 3 });
    act(() => uxProjection.handle({ type: "presentation_snapshot", snapshot: active }));
    expect(screen.getByTestId("ux-kind")).toHaveTextContent("connected");

    act(() => uxProjection.handle({
      type: "media_snapshot",
      snapshot: {
        ...baseSnapshot,
        callId: baseSnapshot.callId,
        projection: { state: "active" },
        recovery: { phase: "ice_restart", attempt: 2 },
        localIssue: "transport_recovery",
      } as any,
    }));
    expect(screen.getByTestId("ux-kind")).toHaveTextContent("reconnecting");
    expect(screen.getByTestId("ux-recovery")).toHaveTextContent("ice_restart:2");

    const ended = presentationSnapshot({ phase: "terminal", canonicalState: "declined", terminalState: "declined", stateVersion: 4 });
    act(() => uxProjection.handle({ type: "presentation_snapshot", snapshot: ended }));
    expect(screen.getByTestId("ux-kind")).toHaveTextContent("ended");
    expect(screen.getByTestId("ux-reason")).toHaveTextContent("declined");
    view.unmount();
  });
});
