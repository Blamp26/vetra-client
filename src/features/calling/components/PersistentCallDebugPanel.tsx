import { useEffect, useMemo, useRef, useState } from "react";
import {
  useOptionalPersistentCall,
  usePersistentCallBoundaryDebug,
} from "../context/PersistentCallContext";
import {
  getDirectedCallDiagnosticTimeline,
  getDirectedCallDiagnosticsProbe,
  registerDirectedCallDiagnosticsPanelReader,
  resetDirectedCallDiagnosticTimeline,
  resetDirectedCallDiagnosticsProbe,
  unregisterDirectedCallDiagnosticsPanelReader,
} from "../services/directedCallDiagnostics";
import { isCallDebugEnabled, setCallDebugEnabled } from "../utils/callDebug";

export type PersistentPeerUuidSource = "user" | "preview" | "partnerRef" | "none";

const DIAGNOSTICS_SHORTCUT_KEYS = new Set(["d", "control", "shift", "alt"]);

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

export function PersistentCallDiagnosticsShortcut() {
  const boundary = usePersistentCallBoundaryDebug();

  useEffect(() => {
    if (boundary?.mode !== "persistent" || !boundary.tauriDetected) return;
    let chordHeld = false;

    const resetChord = (event: KeyboardEvent) => {
      if (DIAGNOSTICS_SHORTCUT_KEYS.has(event.key.toLowerCase())) chordHeld = false;
    };
    const resetOnBlur = () => { chordHeld = false; };
    const handleKeyDown = (event: KeyboardEvent) => {
      try {
        if (
          event.repeat
          || chordHeld
          || event.key.toLowerCase() !== "d"
          || !event.ctrlKey
          || !event.shiftKey
          || !event.altKey
        ) return;
        chordHeld = true;
        event.preventDefault();
        const enabled = !isCallDebugEnabled();
        resetDirectedCallDiagnosticsProbe();
        resetDirectedCallDiagnosticTimeline();
        setCallDebugEnabled(enabled);
        getDirectedCallDiagnosticTimeline();
        if (!enabled) resetDirectedCallDiagnosticsProbe();
      } catch {
        // Diagnostics must never affect application control flow.
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", resetChord);
    window.addEventListener("blur", resetOnBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", resetChord);
      window.removeEventListener("blur", resetOnBlur);
    };
  }, [boundary?.mode, boundary?.tauriDetected]);

  return null;
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
  const diagnosticsEnabled = boundary?.mode === "persistent"
    && boundary.tauriDetected === true
    && boundary.directedCallDiagnosticsEnabled === true;
  const [probeSnapshot, setProbeSnapshot] = useState(getDirectedCallDiagnosticsProbe);
  const [panelReaderInstanceId, setPanelReaderInstanceId] = useState<string | null>(null);
  const [view, setView] = useState<"probe" | "timeline">("probe");
  const [copyFeedback, setCopyFeedback] = useState<"success" | "failure" | null>(null);
  const copyFeedbackTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (!diagnosticsEnabled) {
      setPanelReaderInstanceId(null);
      return;
    }
    const readerId = registerDirectedCallDiagnosticsPanelReader();
    setPanelReaderInstanceId(readerId);
    const refresh = () => setProbeSnapshot((previous) => {
      const next = getDirectedCallDiagnosticsProbe();
      return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
    });
    refresh();
    const refreshHandle = window.setInterval(refresh, 250);
    return () => {
      window.clearInterval(refreshHandle);
      unregisterDirectedCallDiagnosticsPanelReader(readerId);
      setPanelReaderInstanceId(null);
    };
  }, [diagnosticsEnabled]);

  useEffect(() => () => {
    if (copyFeedbackTimeout.current !== null) window.clearTimeout(copyFeedbackTimeout.current);
  }, []);

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
      directedCallDiagnosticsEnabled: false,
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
      "ownership event timeline": value.ownershipEventTimeline.map((event) => `${event.sequence}:${event.event}${event.reason ? `(${event.reason})` : ""}${event.errorCategory ? `[${event.errorCategory}${event.serverErrorCode ? `/${event.serverErrorCode}` : ""}: ${event.errorDetails ?? "unknown"}]` : event.errorType ? `[${event.errorType}: ${event.errorMessage ?? "unknown"}]` : ""}`).join(" | ") || "none",
      "directed call event timeline": (value.directedCallEventTimeline ?? []).map((event) => `${event.sequence}:${event.line}`).join(" | ") || "none",
      "disable diagnostics": "Ctrl+Shift+Alt+D",
      "Diagnostics transport probe": "",
      "probe renderer/session ID": probeSnapshot.rendererSessionProbeId,
      "probe recorder module IDs": probeSnapshot.recorderModuleInstanceIds.join(", ") || "none",
      "probe panel reader ID": panelReaderInstanceId ?? "none",
      "probe recorder flag": probeSnapshot.flagObservedByRecorder ? "enabled" : "disabled",
      "probe setting changes": probeSnapshot.settingChangeCount,
      "probe boundary/runtime mounted": `${probeSnapshot.boundaryMounted ? "yes" : "no"}/${probeSnapshot.runtimeMounted ? "yes" : "no"}`,
      "probe recorder entries/suppressed": `${probeSnapshot.recorderEntryCount}/${probeSnapshot.suppressedDisabledCount}`,
      "probe timeline appends/length": `${probeSnapshot.timelineAppendCount}/${probeSnapshot.currentTimelineLength}`,
      "probe listener notifications/active": `${probeSnapshot.listenerNotificationCount}/${probeSnapshot.activeListenerCount}`,
      "probe last event family": probeSnapshot.lastEventFamily ?? "none",
      "probe last completed step": probeSnapshot.lastCompletedStep ?? "none",
      "probe last internal error": probeSnapshot.lastInternalErrorCode ?? "none",
      "probe producer families": probeSnapshot.producerFamilies.join(", ") || "none",
      "active chat type": activeChatType,
      "direct-chat check": directChat ? "pass" : "fail",
      "peer UUID source": peerUuidSource,
      "peer UUID valid": yesNo(peerUuidValid),
      "final outgoing-button predicate": finalButtonPredicate ? "pass" : "fail",
      "failed gates": failedGates.length > 0 ? failedGates : ["none"],
    };
  }, [activeChatType, directChat, boundary, persistentCall, peerUuidSource, peerUuidValid, finalButtonPredicate, panelReaderInstanceId, probeSnapshot]);

  const timelineText = useMemo(
    () => (fields["directed call event timeline"] as string) || "none",
    [fields],
  );
  const probeText = useMemo(
    () => Object.entries(fields)
      .filter(([label]) => label !== "directed call event timeline")
      .map(([label, value]) => `${label}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join("\n"),
    [fields],
  );

  const copyCurrentView = () => {
    try {
      const writeText = navigator.clipboard?.writeText;
      if (!writeText) throw new Error("clipboard_unavailable");
      const text = view === "probe" ? probeText : timelineText;
      void writeText.call(navigator.clipboard, text).then(
        () => {
          setCopyFeedback("success");
          if (copyFeedbackTimeout.current !== null) window.clearTimeout(copyFeedbackTimeout.current);
          copyFeedbackTimeout.current = window.setTimeout(() => setCopyFeedback(null), 1800);
        },
        () => {
          setCopyFeedback("failure");
        },
      );
    } catch {
      setCopyFeedback("failure");
    }
  };

  useEffect(() => {
    if (!import.meta.env.DEV || boundary?.mode !== "persistent") return;
    console.info("[persistent-call-debug]", fields);
  }, [fields]);

  if (!diagnosticsEnabled) return null;

  return (
    <aside
      className="fixed bottom-2 right-2 z-[100] flex h-[min(42rem,calc(100vh-1rem))] max-h-[calc(100vh-1rem)] w-[min(36rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] flex-col rounded border border-amber-500/60 bg-black/90 p-2 font-mono text-[10px] leading-4 text-amber-100 shadow-lg"
      data-testid="persistent-call-debug-panel"
      aria-label="Persistent call runtime diagnostics"
    >
      <header className="shrink-0 border-b border-amber-500/40 pb-2">
        <div className="mb-1 flex items-center justify-between gap-2 font-semibold">
          <span>Persistent call debug</span>
          <span className="whitespace-nowrap">Ctrl+Shift+Alt+D disables</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" aria-pressed={view === "probe"} onClick={() => setView("probe")} className="rounded border border-amber-300/60 px-1.5 py-0.5" data-testid="persistent-call-debug-probe-tab">Probe</button>
          <button type="button" aria-pressed={view === "timeline"} onClick={() => setView("timeline")} className="rounded border border-amber-300/60 px-1.5 py-0.5" data-testid="persistent-call-debug-timeline-tab">Timeline</button>
          <button type="button" onClick={copyCurrentView} className="rounded border border-amber-300/60 px-1.5 py-0.5" data-testid="persistent-call-debug-copy">Copy {view}</button>
          {copyFeedback && <span role="status" data-testid="persistent-call-debug-copy-feedback">{copyFeedback === "success" ? "Copied" : "Copy failed"}</span>}
        </div>
      </header>
      <div data-testid="persistent-call-debug-body" className="min-h-0 flex-1 overflow-x-auto overflow-y-auto pt-2">
        {view === "probe" ? (
          <dl>
            {Object.entries(fields).filter(([label]) => label !== "directed call event timeline").map(([label, value]) => (
              <div key={label} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2">
                <dt>{label}:</dt>
                <dd className="min-w-0 break-words">{Array.isArray(value) ? value.join(", ") : value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <pre data-testid="persistent-call-debug-timeline" className="whitespace-pre-wrap break-words">{timelineText}</pre>
        )}
      </div>
    </aside>
  );
}
