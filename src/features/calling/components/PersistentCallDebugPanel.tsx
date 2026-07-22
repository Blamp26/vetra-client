import { useEffect, useMemo } from "react";
import {
  useOptionalPersistentCall,
  usePersistentCallBoundaryDebug,
} from "../context/PersistentCallContext";

export type PersistentPeerUuidSource = "user" | "preview" | "partnerRef" | "none";

interface Props {
  activeChatType: string;
  directChat: boolean;
  peerUuidSource: PersistentPeerUuidSource;
  peerUuidValid: boolean;
  finalButtonPredicate: boolean;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

export function PersistentCallDebugPanel({
  activeChatType,
  directChat,
  peerUuidSource,
  peerUuidValid,
  finalButtonPredicate,
}: Props) {
  const boundary = usePersistentCallBoundaryDebug();
  const persistentCall = useOptionalPersistentCall();

  const fields = useMemo(() => {
    const value = {
      mode: "disabled" as const,
      tauriDetected: false,
      ownershipBackend: "unavailable" as const,
      ownershipState: "unavailable" as const,
      ownershipFailureReason: "boundary_unavailable",
      runtimeConstructed: false,
      contextMounted: false,
      currentUserPublicUuidValid: false,
      stableDeviceUuidValid: false,
      nativeHolderPresent: false,
      currentFrontendGeneration: 0,
      currentLeaseSuffix: null,
      lastOwnershipEvent: null,
      ownershipEventTimeline: [],
      ...boundary,
    };
    const contextMounted = persistentCall !== null;
    const failedGates = [
      value.mode !== "persistent" && "runtime_mode",
      value.ownershipState !== "owner" && "ownership_state",
      !value.currentUserPublicUuidValid && "current_user_public_uuid",
      !value.stableDeviceUuidValid && "stable_device_uuid",
      !value.runtimeConstructed && "persistent_runtime",
      !contextMounted && "persistent_context",
      !directChat && "direct_chat",
      !peerUuidValid && "peer_uuid",
    ].filter((gate): gate is string => Boolean(gate));

    return {
      "resolved runtime mode": value.mode,
      "Tauri detected": yesNo(value.tauriDetected),
      "ownership backend": value.ownershipBackend,
      "ownership state": value.ownershipState,
      "safe ownership failure reason": value.ownershipFailureReason ?? "none",
      "persistent runtime constructed": yesNo(value.runtimeConstructed),
      "PersistentCallContext provider mounted": yesNo(contextMounted),
      "current-user public UUID valid": yesNo(value.currentUserPublicUuidValid),
      "stable device UUID valid": yesNo(value.stableDeviceUuidValid),
      "native holder present": yesNo(value.nativeHolderPresent),
      "current frontend generation": value.currentFrontendGeneration,
      "current lease suffix": value.currentLeaseSuffix ?? "none",
      "last ownership event": value.lastOwnershipEvent?.event ?? "none",
      "ownership event timeline": value.ownershipEventTimeline.map((event) => `${event.sequence}:${event.event}${event.reason ? `(${event.reason})` : ""}${event.errorCategory ? `[${event.errorCategory}: ${event.errorDetails ?? "unknown"}]` : event.errorType ? `[${event.errorType}: ${event.errorMessage ?? "unknown"}]` : ""}`).join(" | ") || "none",
      "active chat type": activeChatType,
      "direct-chat check": directChat ? "pass" : "fail",
      "peer UUID source": peerUuidSource,
      "peer UUID valid": yesNo(peerUuidValid),
      "final outgoing-button predicate": finalButtonPredicate ? "pass" : "fail",
      "failed gates": failedGates.length > 0 ? failedGates : ["none"],
    };
  }, [activeChatType, directChat, boundary, persistentCall, peerUuidSource, peerUuidValid, finalButtonPredicate]);

  useEffect(() => {
    if (!import.meta.env.DEV || boundary?.mode !== "persistent") return;
    console.info("[persistent-call-debug]", fields);
  }, [fields]);

  if (!import.meta.env.DEV || boundary?.mode !== "persistent") return null;

  return (
    <aside
      className="fixed bottom-2 right-2 z-[100] max-w-[360px] rounded border border-amber-500/60 bg-black/90 p-2 font-mono text-[10px] leading-4 text-amber-100 shadow-lg"
      data-testid="persistent-call-debug-panel"
      aria-label="Persistent call runtime diagnostics"
    >
      <div className="mb-1 font-semibold">Persistent call debug</div>
      <dl>
        {Object.entries(fields).map(([label, value]) => (
          <div key={label} className="grid grid-cols-[auto_1fr] gap-x-2">
            <dt>{label}:</dt>
            <dd className="break-words">{Array.isArray(value) ? value.join(", ") : value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
