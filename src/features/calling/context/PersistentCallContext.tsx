import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  DirectedCallMediaCoordinator,
  DirectedCallMediaCoordinatorSnapshot,
} from "../services/directedCallMediaCoordinator";
import type { DirectedCallMediaStream } from "../services/directedCallWebRtcAdapter";
import type { DirectedCallPresentationModel, PersistentPresentationSnapshot, PresentationActionResult } from "../services/directedCallPresentationModel";
import type { CallAuthorityBackend, CallAuthorityState, CallAuthorityTraceEvent } from "../services/callAuthorityOwnership";
import type { DirectedCallDiagnosticEntry } from "../services/directedCallDiagnostics";
import { CallUxProjection, type CallUxSnapshot } from "../services/callUxProjection";

function legacyUxSnapshot(snapshot: PersistentPresentationSnapshot): CallUxSnapshot {
  const context = snapshot.callId && (snapshot.peerPublicId || snapshot.phase === "active")
    ? { callId: snapshot.callId, peerPublicId: snapshot.peerPublicId ?? "unknown", direction: snapshot.participantRole === "recipient" ? "incoming" as const : "outgoing" as const }
    : null;
  if (!context) return { status: { kind: "idle" }, actionBusy: false };
  if (snapshot.phase === "terminal") return { status: { kind: "ended", reason: (snapshot.terminalState ?? "ended") as any, ...context }, actionBusy: false };
  if (snapshot.phase === "active") return { status: { kind: "connected", ...context }, actionBusy: false };
  if (snapshot.phase === "connecting" || snapshot.phase === "accepting") return { status: { kind: "connecting", ...context }, actionBusy: Boolean(snapshot.pendingAction) };
  if (snapshot.phase === "ringing") return { status: { kind: "ringing", ...context }, actionBusy: Boolean(snapshot.pendingAction) };
  return { status: { kind: "idle" }, actionBusy: snapshot.phase === "preparing" || snapshot.phase === "calling" || Boolean(snapshot.pendingAction) };
}

export interface PersistentCallBoundaryDebugSnapshot {
  mode: "persistent" | "disabled";
  tauriDetected: boolean;
  ownershipBackend: CallAuthorityBackend;
  ownershipState: CallAuthorityState;
  ownershipFailureReason: string | null;
  runtimeConstructed: boolean;
  contextMounted: boolean;
  currentUserPublicUuidValid: boolean;
  stableDeviceUuidValid: boolean;
  nativeHolderPresent: boolean;
  currentFrontendGeneration: number;
  currentLeaseSuffix: string | null;
  lastOwnershipEvent: CallAuthorityTraceEvent | null;
  ownershipEventTimeline: CallAuthorityTraceEvent[];
  directedCallEventTimeline: DirectedCallDiagnosticEntry[];
  directedCallDiagnosticsEnabled: boolean;
}

const PersistentCallBoundaryDebugContext = createContext<PersistentCallBoundaryDebugSnapshot | null>(null);

export interface PersistentCallRuntimeServices {
  presentation: DirectedCallPresentationModel;
  media: DirectedCallMediaCoordinator;
  uxProjection?: CallUxProjection;
}

export interface PersistentCallRuntimeValue {
  presentation: PersistentPresentationSnapshot;
  media: DirectedCallMediaCoordinatorSnapshot;
  ux: CallUxSnapshot;
  startCall: (targetPublicUserId: string, targetUsername: string) => Promise<PresentationActionResult>;
  accept: () => Promise<PresentationActionResult>;
  decline: () => Promise<PresentationActionResult>;
  cancel: () => Promise<PresentationActionResult>;
  hangup: () => Promise<PresentationActionResult>;
  retry: () => Promise<PresentationActionResult>;
  isMuted: boolean;
  muted: boolean;
  deafened: boolean;
  effectiveMuted: boolean;
  canToggleMute: boolean;
  canToggleDeafen: boolean;
  toggleMute: () => boolean;
  toggleDeafen: () => boolean;
  screenShareAvailable: boolean;
  isScreenSharing: boolean;
  localScreenShareStream: DirectedCallMediaStream | null;
  remoteScreenShareAvailable: boolean;
  remoteScreenShareStream: DirectedCallMediaStream | null;
  startScreenShare: () => Promise<boolean>;
  stopScreenShare: () => Promise<boolean>;
}

const PersistentCallContext = createContext<PersistentCallRuntimeValue | null>(null);

export function PersistentCallProvider({ runtime, children }: { runtime: PersistentCallRuntimeServices; children: ReactNode }) {
  const uxProjection = useMemo(() => runtime.uxProjection ?? new CallUxProjection(), [runtime]);
  const [presentation, setPresentation] = useState(() => runtime.presentation.getSnapshot());
  const [media, setMedia] = useState(() => runtime.media.getSnapshot());
  const hasUxProjection = Boolean(runtime.uxProjection);
  const [ux, setUx] = useState(() => runtime.uxProjection?.getSnapshot() ?? legacyUxSnapshot(runtime.presentation.getSnapshot()));

  useEffect(() => {
    const unsubscribePresentation = runtime.presentation.subscribe((next) => {
      setPresentation(next);
      if (!hasUxProjection) setUx(legacyUxSnapshot(next));
    });
    const unsubscribeMedia = runtime.media.subscribe((next) => {
      setMedia(next);
      if (!hasUxProjection) setUx(legacyUxSnapshot(runtime.presentation.getSnapshot()));
    });
    const unsubscribeUx = uxProjection.subscribe(setUx);
    setPresentation(runtime.presentation.getSnapshot());
    setMedia(runtime.media.getSnapshot());
    if (hasUxProjection) setUx(uxProjection.getSnapshot());
    return () => {
      unsubscribePresentation();
      unsubscribeMedia();
      unsubscribeUx();
    };
  }, [hasUxProjection, runtime, uxProjection]);

  const value = useMemo<PersistentCallRuntimeValue>(() => ({
    presentation,
    media,
    ux,
    startCall: (target, username) => runtime.presentation.startCall(target, username),
    accept: () => runtime.presentation.accept(),
    decline: () => runtime.presentation.decline(),
    cancel: () => runtime.presentation.cancelCall(),
    hangup: () => runtime.presentation.hangup(),
    retry: () => runtime.presentation.retryPendingAction(),
    isMuted: media.isMuted,
    muted: media.muted,
    deafened: media.deafened,
    effectiveMuted: media.effectiveMuted,
    canToggleMute: media.canToggleMute,
    canToggleDeafen: media.canToggleDeafen,
    toggleMute: () => runtime.media.toggleMute(),
    toggleDeafen: () => runtime.media.toggleDeafen(),
    screenShareAvailable: media.projection?.state === "active"
      && typeof navigator !== "undefined"
      && typeof navigator.mediaDevices?.getDisplayMedia === "function",
    isScreenSharing: media.isLocalScreenShareActive,
    localScreenShareStream: media.localScreenShareStream,
    remoteScreenShareAvailable: media.projection?.state === "active" && Boolean(media.remoteScreenShareStream),
    remoteScreenShareStream: media.remoteScreenShareStream,
    startScreenShare: () => runtime.media.startScreenShare(),
    stopScreenShare: () => runtime.media.stopScreenShare(),
  }), [media, presentation, runtime, ux]);

  return <PersistentCallContext.Provider value={value}>{children}</PersistentCallContext.Provider>;
}

export function PersistentCallBoundaryDebugProvider({
  value,
  children,
}: {
  value: PersistentCallBoundaryDebugSnapshot;
  children: ReactNode;
}) {
  return (
    <PersistentCallBoundaryDebugContext.Provider value={value}>
      {children}
    </PersistentCallBoundaryDebugContext.Provider>
  );
}

export function usePersistentCallBoundaryDebug(): PersistentCallBoundaryDebugSnapshot | null {
  return useContext(PersistentCallBoundaryDebugContext);
}

export function usePersistentCall(): PersistentCallRuntimeValue {
  const value = useContext(PersistentCallContext);
  if (!value) throw new Error("usePersistentCall must be used within a persistent call owner");
  return value;
}

export function useOptionalPersistentCall(): PersistentCallRuntimeValue | null {
  return useContext(PersistentCallContext);
}
