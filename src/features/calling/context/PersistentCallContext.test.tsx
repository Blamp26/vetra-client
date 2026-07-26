import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistentCallProvider, usePersistentCall } from "./PersistentCallContext";
import type { DirectedCallMediaCoordinatorSnapshot } from "../services/directedCallMediaCoordinator";

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

function presentationSnapshot() {
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
  } as any;
}

function makeRuntime(snapshot = baseSnapshot) {
  const listeners = new Set<(next: DirectedCallMediaCoordinatorSnapshot) => void>();
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
    getSnapshot: vi.fn(presentationSnapshot),
    subscribe: vi.fn(() => () => undefined),
    startCall: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    cancelCall: vi.fn(),
    hangup: vi.fn(),
    retryPendingAction: vi.fn(),
  };
  return { presentation, media };
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
});
