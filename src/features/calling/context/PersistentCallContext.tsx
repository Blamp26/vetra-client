import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  DirectedCallMediaCoordinator,
  DirectedCallMediaCoordinatorSnapshot,
} from "../services/directedCallMediaCoordinator";
import type { DirectedCallMediaStream } from "../services/directedCallWebRtcAdapter";
import type { DirectedCallPresentationModel, PersistentPresentationSnapshot, PresentationActionResult } from "../services/directedCallPresentationModel";
import type { CallAuthorityBackend, CallAuthorityState, CallAuthorityTraceEvent } from "../services/callAuthorityOwnership";
import type { DirectedCallDiagnosticEntry } from "../services/directedCallDiagnostics";

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
}

export interface PersistentCallRuntimeValue {
  presentation: PersistentPresentationSnapshot;
  media: DirectedCallMediaCoordinatorSnapshot;
  startCall: (targetPublicUserId: string, targetUsername: string) => Promise<PresentationActionResult>;
  accept: () => Promise<PresentationActionResult>;
  decline: () => Promise<PresentationActionResult>;
  cancel: () => Promise<PresentationActionResult>;
  hangup: () => Promise<PresentationActionResult>;
  retry: () => Promise<PresentationActionResult>;
  isMuted: boolean;
  canToggleMute: boolean;
  toggleMute: () => boolean;
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
  const [presentation, setPresentation] = useState(() => runtime.presentation.getSnapshot());
  const [media, setMedia] = useState(() => runtime.media.getSnapshot());

  useEffect(() => {
    const unsubscribePresentation = runtime.presentation.subscribe(setPresentation);
    const unsubscribeMedia = runtime.media.subscribe(setMedia);
    setPresentation(runtime.presentation.getSnapshot());
    setMedia(runtime.media.getSnapshot());
    return () => {
      unsubscribePresentation();
      unsubscribeMedia();
    };
  }, [runtime]);

  const value = useMemo<PersistentCallRuntimeValue>(() => ({
    presentation,
    media,
    startCall: (target, username) => runtime.presentation.startCall(target, username),
    accept: () => runtime.presentation.accept(),
    decline: () => runtime.presentation.decline(),
    cancel: () => runtime.presentation.cancelCall(),
    hangup: () => runtime.presentation.hangup(),
    retry: () => runtime.presentation.retryPendingAction(),
    isMuted: media.isMuted,
    canToggleMute: media.canToggleMute,
    toggleMute: () => runtime.media.toggleMute(),
    screenShareAvailable: media.projection?.state === "active"
      && typeof navigator !== "undefined"
      && typeof navigator.mediaDevices?.getDisplayMedia === "function",
    isScreenSharing: media.isLocalScreenShareActive,
    localScreenShareStream: media.localScreenShareStream,
    remoteScreenShareAvailable: media.projection?.state === "active" && Boolean(media.remoteScreenShareStream),
    remoteScreenShareStream: media.remoteScreenShareStream,
    startScreenShare: () => runtime.media.startScreenShare(),
    stopScreenShare: () => runtime.media.stopScreenShare(),
  }), [media, presentation, runtime]);

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
