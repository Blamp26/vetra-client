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
import { PersistentCallProvider, type PersistentCallRuntimeServices } from "./PersistentCallContext";
import { recordDirectedCallDiagnostic } from "../services/directedCallDiagnostics";
import { getOrCreateDirectedCallDeviceId } from "../services/directedCallDevice";
import { parseCallRuntimeMode, type CallRuntimeMode } from "../services/callRuntimeMode";
import {
  CallAuthorityOwnership,
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
  persistentContent?: ReactNode;
  mode?: CallRuntimeMode;
  ownershipFactory?: OwnershipFactory;
  persistentMediaAvailable?: boolean;
}

type OwnershipFactory = (options: ConstructorParameters<typeof CallAuthorityOwnership>[0]) => CallAuthorityOwnership;
const defaultOwnershipFactory: OwnershipFactory = (options) => new CallAuthorityOwnership(options);

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
  }), [currentUser.id, deviceId, mode, ownershipFactory, publicUserRef, mode === "persistent" ? socketManager : null]);
  const [authority, setAuthority] = useState<CallAuthoritySnapshot>(() => ownership.getSnapshot());
  const [persistentRuntime, setPersistentRuntime] = useState<PersistentRuntime | null>(null);
  const persistentRuntimeRef = useRef<PersistentRuntime | null>(null);
  const activeOwnershipRef = useRef<CallAuthorityOwnership | null>(null);
  const effectGenerationRef = useRef(0);

  useEffect(() => {
    const effectGeneration = ++effectGenerationRef.current;
    activeOwnershipRef.current = ownership;
    setAuthority(ownership.getSnapshot());
    const onAuthority = (snapshot: CallAuthoritySnapshot) => {
      setAuthority(snapshot);
      recordDirectedCallDiagnostic("authority", { mode, authority: snapshot.state });
    };
    const unsubscribe = ownership.subscribe(onAuthority);
    let cancelled = false;
    let localRuntime: PersistentRuntime | null = null;

    void (async () => {
      // Let a dependency-change cleanup release an obsolete scope before the
      // replacement acquisition runs, while allowing StrictMode replay to
      // observe the still-owned runtime.
      await Promise.resolve();
      const acquired = await ownership.acquire();
      recordDirectedCallDiagnostic("runtime_mode", { mode, authority: acquired.state });
      if (cancelled || activeOwnershipRef.current !== ownership) {
        if (activeOwnershipRef.current !== ownership) await ownership.dispose();
        return;
      }
      if (acquired.state !== "owner" || mode !== "persistent") {
        if (mode === "persistent") {
          recordDirectedCallDiagnostic("failure", {
            failureKind: acquired.state === "unavailable" ? "persistent_authority_unavailable" : "persistent_authority_not_owned",
            reason: acquired.state === "unavailable" ? "web_locks_unavailable_or_failed" : "another_window_owns_call_runtime",
          });
        }
        return;
      }
      if (!scope || !socketManager || !publicUserRef || !persistentMediaAvailable) {
        recordDirectedCallDiagnostic("failure", { failureKind: !persistentMediaAvailable ? "persistent_media_unavailable" : "persistent_runtime_unavailable" });
        await ownership.dispose();
        return;
      }

      const session = new DirectedCallSession({
        socket: socketManager.socket,
        publicUserRef,
        deviceId,
        enabled: true,
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
        await ownership.dispose();
        return;
      }
      localRuntime = runtime;
      persistentRuntimeRef.current = runtime;
      setPersistentRuntime(runtime);
      try {
        await session.start();
        runtime.start();
      } catch {
        runtime.dispose();
        localRuntime = null;
        persistentRuntimeRef.current = null;
        setPersistentRuntime(null);
        await ownership.dispose();
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      queueMicrotask(() => {
        if (effectGenerationRef.current !== effectGeneration && activeOwnershipRef.current === ownership) return;
        if (activeOwnershipRef.current === ownership) activeOwnershipRef.current = null;
        void ownership.dispose(() => {
          if (persistentRuntimeRef.current === localRuntime) {
            persistentRuntimeRef.current = null;
            setPersistentRuntime(null);
          }
          localRuntime?.dispose();
          localRuntime = null;
        });
      });
    };
  }, [deviceId, mode, ownership, persistentMediaAvailable, publicUserRef, scope, socketManager]);

  if (mode === "legacy" && authority.state === "owner") {
    return <CallProvider currentUserId={currentUser.id}>{legacyContent}</CallProvider>;
  }

  if (mode === "persistent" && authority.state === "owner" && persistentRuntime) {
    if (persistentContent === undefined) return <>{nonCallContent}</>;
    return <PersistentCallProvider runtime={persistentRuntime.services}>{persistentContent}</PersistentCallProvider>;
  }

  return <>{nonCallContent}</>;
}
