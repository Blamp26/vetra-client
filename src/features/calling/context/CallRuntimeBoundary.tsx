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
}

export interface CallRuntimeBoundaryProps {
  currentUser: User;
  socketManager: SocketManager | null;
  legacyContent: ReactNode;
  nonCallContent: ReactNode;
  mode?: CallRuntimeMode;
  ownershipFactory?: OwnershipFactory;
}

type OwnershipFactory = (options: ConstructorParameters<typeof CallAuthorityOwnership>[0]) => CallAuthorityOwnership;
const defaultOwnershipFactory: OwnershipFactory = (options) => new CallAuthorityOwnership(options);

export function CallRuntimeBoundary({
  currentUser,
  socketManager,
  legacyContent,
  nonCallContent,
  mode = parseCallRuntimeMode(),
  ownershipFactory = defaultOwnershipFactory,
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
  const persistentRuntimeRef = useRef<PersistentRuntime | null>(null);
  const activeOwnershipRef = useRef<CallAuthorityOwnership | null>(null);
  const effectGenerationRef = useRef(0);

  useEffect(() => {
    const effectGeneration = ++effectGenerationRef.current;
    activeOwnershipRef.current = ownership;
    setAuthority(ownership.getSnapshot());
    const unsubscribe = ownership.subscribe(setAuthority);
    let cancelled = false;
    let localRuntime: PersistentRuntime | null = null;

    void (async () => {
      // Let a dependency-change cleanup release an obsolete scope before the
      // replacement acquisition runs, while allowing StrictMode replay to
      // observe the still-owned runtime.
      await Promise.resolve();
      const acquired = await ownership.acquire();
      if (cancelled || activeOwnershipRef.current !== ownership) {
        if (activeOwnershipRef.current !== ownership) await ownership.dispose();
        return;
      }
      if (acquired.state !== "owner" || mode !== "persistent" || !scope || !socketManager || !publicUserRef) return;

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
      try {
        await session.start();
        runtime.start();
      } catch {
        runtime.dispose();
        localRuntime = null;
        persistentRuntimeRef.current = null;
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
          if (persistentRuntimeRef.current === localRuntime) persistentRuntimeRef.current = null;
          localRuntime?.dispose();
          localRuntime = null;
        });
      });
    };
  }, [deviceId, mode, ownership, publicUserRef, scope, socketManager]);

  if (mode === "legacy" && authority.state === "owner") {
    return <CallProvider currentUserId={currentUser.id}>{legacyContent}</CallProvider>;
  }

  return <>{nonCallContent}</>;
}
