import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@/shared/types";
import type { SocketManager } from "@/services/socket";
import { CallProvider } from "./CallProvider";
import { DirectedCallSession } from "../services/directedCallSession";
import { DirectedCallLifecycleController } from "../services/directedCallLifecycleController";
import { DirectedCallIncomingCoordinator } from "../services/directedCallIncomingCoordinator";
import { DirectedCallPresentationModel } from "../services/directedCallPresentationModel";
import { DirectedCallSignalTransport } from "../services/directedCallSignalTransport";
import { DirectedCallMediaCoordinator } from "../services/directedCallMediaCoordinator";
import {
  PersistentCallBoundaryDebugProvider,
  PersistentCallProvider,
  type PersistentCallRuntimeServices,
} from "./PersistentCallContext";
import {
  recordDirectedCallDiagnostic,
  recordDirectedCallRuntimeBranch,
} from "../services/directedCallDiagnostics";
import { getOrCreateDirectedCallDeviceId } from "../services/directedCallDevice";
import { isUuid } from "../protocol/directedCallProtocol";
import { parseCallRuntimeMode, type CallRuntimeMode } from "../services/callRuntimeMode";
import {
  CallAuthorityOwnership,
  isTauriRuntime,
  resolveCallAuthorityScope,
  type CallAuthoritySnapshot,
} from "../services/callAuthorityOwnership";

interface PersistentRuntime {
  start: () => void;
  dispose: () => void;
  services: PersistentCallRuntimeServices;
}

export interface CallRuntimeBoundaryProps {
  currentUser: User;
  socketManager: SocketManager | null;
  legacyContent: ReactNode;
  nonCallContent: ReactNode;
  persistentContent?: ReactNode | ((affordance: PersistentCallAffordance) => ReactNode);
  mode?: CallRuntimeMode;
  ownershipFactory?: OwnershipFactory;
  persistentMediaAvailable?: boolean;
}

export type PersistentCallAffordance =
  | { state: "owner" }
  | { state: "non_owner"; reason: "managed_in_other_window" }
  | { state: "unavailable"; reason: string };

type OwnershipFactory = (options: ConstructorParameters<typeof CallAuthorityOwnership>[0]) => CallAuthorityOwnership;
const defaultOwnershipFactory: OwnershipFactory = (options) => new CallAuthorityOwnership(options);

function describeStartupError(error: unknown): { errorType: string; errorMessage: string } {
  if (error instanceof Error) return { errorType: error.name.slice(0, 64) || "Error", errorMessage: "error_instance" };
  if (error === null) return { errorType: "null", errorMessage: "null" };
  if (typeof error !== "object") return { errorType: typeof error, errorMessage: "primitive" };
  if (Array.isArray(error)) return { errorType: "array", errorMessage: "array_value" };

  const record = error as Record<string, unknown>;
  const keys = Object.keys(record).sort().slice(0, 12);
  const safeFields = ["status", "reason", "code", "event"].flatMap((key) => {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return [`${key}=${value.replace(/[^A-Za-z0-9._:/ -]/g, "").slice(0, 64)}`];
    if (typeof value === "number" || typeof value === "boolean") return [`${key}=${String(value)}`];
    return [];
  });
  return { errorType: "plain_object", errorMessage: [`keys=${keys.join(",") || "none"}`, ...safeFields].join("; ") };
}

export function CallRuntimeBoundary({
  currentUser,
  socketManager,
  legacyContent,
  nonCallContent,
  persistentContent,
  mode = parseCallRuntimeMode(),
  ownershipFactory = defaultOwnershipFactory,
  persistentMediaAvailable = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof RTCPeerConnection !== "undefined",
}: CallRuntimeBoundaryProps) {
  const deviceId = useMemo(() => getOrCreateDirectedCallDeviceId(), []);
  const publicUserRef = currentUser.public_id ?? null;
  const scope = useMemo(() => resolveCallAuthorityScope({
    mode,
    publicUserRef,
    numericUserId: currentUser.id,
    deviceId,
  }), [currentUser.id, deviceId, mode, publicUserRef]);
  const ownership = useMemo(() => ownershipFactory({
    mode,
    publicUserRef,
    numericUserId: currentUser.id,
    deviceId,
  }), [currentUser.id, deviceId, mode, ownershipFactory, publicUserRef]);
  const [authority, setAuthority] = useState<CallAuthoritySnapshot>(() => ownership.getSnapshot());
  const ownershipTrace = ownership.getTraceSnapshot?.() ?? { events: [], lastEvent: null, nativeHolderPresent: false };
  const [persistentRuntime, setPersistentRuntime] = useState<PersistentRuntime | null>(null);
  const persistentRuntimeRef = useRef<PersistentRuntime | null>(null);
  const activeOwnershipRef = useRef<CallAuthorityOwnership | null>(null);
  const acquiredOwnershipsRef = useRef(new Set<CallAuthorityOwnership>());
  const effectGenerationRef = useRef(0);

  useEffect(() => {
    const effectGeneration = ++effectGenerationRef.current;
    ownership.setTraceContext?.(effectGeneration);
    ownership.trace?.("ownership_generation_created", { reason: "effect_generation" });
    ownership.trace?.("boundary_mount");
    activeOwnershipRef.current = ownership;
    setAuthority(ownership.getSnapshot());
    const onAuthority = (snapshot: CallAuthoritySnapshot) => {
      setAuthority(snapshot);
      recordDirectedCallDiagnostic("authority", { mode, authority: snapshot.state });
    };
    const unsubscribe = ownership.subscribe(onAuthority);
    const onWindowDestroy = () => ownership.trace?.("window_destroy_cleanup", { reason: "beforeunload" });
    window.addEventListener("beforeunload", onWindowDestroy);
    let cancelled = false;
    let localRuntime: PersistentRuntime | null = null;

    void (async () => {
      // Let a dependency-change cleanup release an obsolete scope before the
      // replacement acquisition runs, while allowing StrictMode replay to
      // observe the still-owned runtime.
      await Promise.resolve();
      if (mode === "persistent" && !socketManager) return;
      acquiredOwnershipsRef.current.add(ownership);
      const acquired = await ownership.acquire();
      recordDirectedCallDiagnostic("runtime_mode", { mode, authority: acquired.state });
      if (cancelled || activeOwnershipRef.current !== ownership) {
        ownership.trace?.("frontend_owner_rejected_stale", { outcome: "stale", reason: "obsolete_boundary_generation" });
        if (activeOwnershipRef.current !== ownership) await ownership.dispose(undefined, "stale_generation");
        return;
      }
      ownership.trace?.(acquired.state === "owner" ? "frontend_owner_applied" : "frontend_owner_rejected_stale", {
        outcome: acquired.state === "owner" ? "accepted" : "denied",
        reason: acquired.state === "owner" ? "current_boundary_generation" : "acquire_not_granted",
      });
      if (acquired.state !== "owner" || mode !== "persistent") {
        if (mode === "persistent") {
          recordDirectedCallRuntimeBranch(
            acquired.state === "non_owner" ? "non-owner" : "unavailable",
            acquired.state === "non_owner" ? undefined : "ownership_unavailable",
          );
          recordDirectedCallDiagnostic("failure", {
            failureKind: acquired.state === "unavailable" ? "persistent_authority_unavailable" : "persistent_authority_not_owned",
            reason: acquired.state === "unavailable" ? "web_locks_unavailable_or_failed" : "another_window_owns_call_runtime",
          });
        }
        return;
      }
      if (!scope || !socketManager || !publicUserRef || !persistentMediaAvailable) {
        recordDirectedCallRuntimeBranch(
          "unavailable",
          !persistentMediaAvailable ? "media_api_unavailable" : "persistent_runtime_unavailable",
        );
        recordDirectedCallDiagnostic("failure", { failureKind: !persistentMediaAvailable ? "persistent_media_unavailable" : "persistent_runtime_unavailable" });
        await ownership.dispose(undefined, "runtime_prerequisite_unavailable");
        return;
      }

      const session = new DirectedCallSession({
        socket: socketManager.socket,
        publicUserRef,
        deviceId,
        enabled: true,
        trace: (event, details) => ownership.trace?.(event, details),
      });
      const controller = new DirectedCallLifecycleController(session);
      const incoming = new DirectedCallIncomingCoordinator(session, controller, { enabled: true });
      const presentation = new DirectedCallPresentationModel(session, controller, incoming, { enabled: true });
      const signalTransport = new DirectedCallSignalTransport(session, {
        generation: `${effectGeneration}:${deviceId}`,
        isGenerationCurrent: (generation) => generation.startsWith(`${effectGeneration}:`),
      });
      const mediaCoordinator = new DirectedCallMediaCoordinator(
        session,
        signalTransport,
        controller,
        `${effectGeneration}:${deviceId}`,
        {
          isGenerationCurrent: (generation) => generation.startsWith(`${effectGeneration}:`),
        },
      );
      const runtime: PersistentRuntime = {
        start: () => mediaCoordinator.start(),
        services: { presentation, media: mediaCoordinator },
        dispose: () => {
          mediaCoordinator.dispose();
          signalTransport.dispose();
          presentation.dispose();
          incoming.dispose();
          controller.dispose();
          session.dispose();
        },
      };
      if (persistentRuntimeRef.current) {
        localRuntime = persistentRuntimeRef.current;
        return;
      }
      if (cancelled || ownership.getSnapshot().state !== "owner") {
        runtime.dispose();
        await ownership.dispose(undefined, "runtime_generation_stale");
        return;
      }
      localRuntime = runtime;
      persistentRuntimeRef.current = runtime;
      setPersistentRuntime(runtime);
      let startupPhase: "session_start" | "runtime_start" = "session_start";
      try {
        ownership.trace?.("runtime_start_requested", { reason: "session_start" });
        await session.start();
        ownership.trace?.("session_start_succeeded", { reason: "session_start" });
        startupPhase = "runtime_start";
        runtime.start();
        ownership.trace?.("runtime_start_succeeded", { reason: "runtime_start" });
        recordDirectedCallRuntimeBranch("owner");
      } catch (error) {
        const startupError = describeStartupError(error);
        ownership.trace?.("runtime_start_failed", {
          reason: "runtime_start_failed",
          startupPhase,
          ...startupError,
        });
        recordDirectedCallRuntimeBranch("unavailable", "persistent_runtime_start_failed");
        runtime.dispose();
        localRuntime = null;
        persistentRuntimeRef.current = null;
        setPersistentRuntime(null);
        await ownership.dispose(undefined, "runtime_start_failed");
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("beforeunload", onWindowDestroy);
      ownership.trace?.("boundary_cleanup", { reason: "react_effect_cleanup" });
      if (!acquiredOwnershipsRef.current.has(ownership) && !localRuntime) return;
      ownership.trace?.("release_scheduled", { reason: "deferred_boundary_cleanup" });
      setTimeout(() => {
        if (effectGenerationRef.current !== effectGeneration && activeOwnershipRef.current === ownership) {
          ownership.trace?.("scheduled_release_cancelled", { outcome: "cancelled", reason: "replacement_generation" });
          return;
        }
        if (activeOwnershipRef.current === ownership) activeOwnershipRef.current = null;
        void ownership.dispose(() => {
          if (persistentRuntimeRef.current === localRuntime) {
            persistentRuntimeRef.current = null;
            setPersistentRuntime(null);
          }
          localRuntime?.dispose();
          localRuntime = null;
        }, "boundary_cleanup");
      }, 0);
    };
  }, [deviceId, mode, ownership, persistentMediaAvailable, publicUserRef, scope, socketManager]);

  const debugValue = {
    mode,
    tauriDetected: isTauriRuntime(),
    ownershipBackend: ownership.backend,
    ownershipState: authority.state,
    ownershipFailureReason:
      authority.state === "unavailable"
        ? "ownership_unavailable"
        : authority.state === "non_owner"
          ? "another_window_owns_call_runtime"
          : !scope && mode === "persistent"
            ? "invalid_persistent_identity"
            : null,
    runtimeConstructed: persistentRuntime !== null,
    contextMounted: mode === "persistent" && authority.state === "owner" && persistentRuntime !== null && persistentContent !== undefined,
    currentUserPublicUuidValid: typeof publicUserRef === "string" && isUuid(publicUserRef),
    stableDeviceUuidValid: isUuid(deviceId),
    nativeHolderPresent: ownershipTrace.nativeHolderPresent,
    currentFrontendGeneration: effectGenerationRef.current,
    currentLeaseSuffix: ownershipTrace.lastEvent?.leaseSuffix ?? null,
    lastOwnershipEvent: ownershipTrace.lastEvent,
    ownershipEventTimeline: ownership.getTraceSnapshot?.().events ?? [],
  };

  const persistentCallAffordance: PersistentCallAffordance =
    mode === "persistent" && authority.state === "owner" && persistentRuntime
      ? { state: "owner" }
      : authority.state === "non_owner"
        ? { state: "non_owner", reason: "managed_in_other_window" }
        : { state: "unavailable", reason: "persistent_call_unavailable" };

  const renderedPersistentContent = typeof persistentContent === "function"
    ? persistentContent(persistentCallAffordance)
    : persistentContent;

  let content: ReactNode = nonCallContent;
  if (mode === "legacy" && authority.state === "owner") {
    content = <CallProvider currentUserId={currentUser.id}>{legacyContent}</CallProvider>;
  } else if (mode === "persistent" && authority.state === "owner" && persistentRuntime && persistentContent !== undefined) {
    content = <PersistentCallProvider runtime={persistentRuntime.services}>{renderedPersistentContent}</PersistentCallProvider>;
  } else if (mode === "persistent" && renderedPersistentContent !== undefined) {
    content = renderedPersistentContent;
  }

  return (
    <PersistentCallBoundaryDebugProvider value={debugValue}>
      {content}
    </PersistentCallBoundaryDebugProvider>
  );
}
