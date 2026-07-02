import type {
  CallDiagnostics,
  CallIssue,
  CallServiceStatus,
  CallStatus,
} from "../hooks/useCall.types";

export const CALL_UX_TEXT = {
  calling: "Calling...",
  connecting: "Connecting...",
  connected: "Connected",
  incoming: "Incoming call",
  ended: "Call ended",
  declined: "Call declined",
  failed: "Call failed",
  timedOut: "Call timed out",
  alreadyInCall: "One side is already in a call.",
  remoteNotReady: "User is not ready to receive calls yet.",
  callServiceConnecting: "Call service is connecting. Try again in a moment.",
  micDenied: "Microphone access was denied.",
  screenShareUpdating: "Updating screen share...",
  screenSharing: "Screen sharing",
} as const;

export function getCallStatusLabel({
  status,
  diagnostics,
  isScreenSharing = false,
  isScreenShareUpdating = false,
  isIncomingActionPending = false,
}: {
  status: CallStatus;
  diagnostics?: CallDiagnostics;
  isScreenSharing?: boolean;
  isScreenShareUpdating?: boolean;
  isIncomingActionPending?: boolean;
}): string {
  if (isScreenShareUpdating) return CALL_UX_TEXT.screenShareUpdating;
  if (isScreenSharing) return CALL_UX_TEXT.screenSharing;
  if (status === "calling") return CALL_UX_TEXT.calling;
  if (status === "ringing") return isIncomingActionPending ? CALL_UX_TEXT.connecting : CALL_UX_TEXT.incoming;
  if (status === "ended") return CALL_UX_TEXT.ended;
  if (status === "failed") return CALL_UX_TEXT.failed;

  const isConnected =
    diagnostics?.connectionState === "connected" ||
    diagnostics?.iceConnectionState === "connected";

  return isConnected ? CALL_UX_TEXT.connected : CALL_UX_TEXT.connecting;
}

export function getCallServiceUnavailableMessage(status: CallServiceStatus | undefined): string | null {
  if (!status || status === "ready") return null;
  return CALL_UX_TEXT.callServiceConnecting;
}

export function normalizeCallIssue(issue: CallIssue | null): CallIssue | null {
  if (!issue) return null;

  switch (issue.message) {
    case "Call could not start because one side is already in a call.":
      return { ...issue, message: CALL_UX_TEXT.alreadyInCall };
    case "User is not ready to receive calls yet. Try again in a moment.":
      return { ...issue, message: CALL_UX_TEXT.remoteNotReady };
    case "Call timed out. No answer.":
      return { ...issue, message: CALL_UX_TEXT.timedOut };
    case "Microphone permission denied.":
      return { ...issue, message: CALL_UX_TEXT.micDenied };
    default:
      return issue;
  }
}
