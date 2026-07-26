import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  PersistentCallBoundaryDebugProvider,
  PersistentCallProvider,
} from "../context/PersistentCallContext";
import { PersistentCallDebugPanel } from "./PersistentCallDebugPanel";

const boundary = {
  mode: "persistent" as const,
  tauriDetected: true,
  ownershipBackend: "native" as const,
  ownershipState: "owner" as const,
  ownershipFailureReason: null,
  runtimeConstructed: true,
  contextMounted: true,
  currentUserPublicUuidValid: true,
  stableDeviceUuidValid: true,
  nativeHolderPresent: true,
  currentFrontendGeneration: 3,
  currentLeaseSuffix: "lease-42",
  lastOwnershipEvent: null,
  ownershipEventTimeline: [],
  directedCallEventTimeline: [],
  directedCallDiagnosticsEnabled: true,
};

function Runtime({ children }: { children: ReactNode }) {
  const presentation = {
    getSnapshot: () => ({ phase: "idle" }),
    subscribe: () => () => undefined,
    startCall: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    cancelCall: vi.fn(),
    hangup: vi.fn(),
    retryPendingAction: vi.fn(),
  } as never;
  const media = {
    getSnapshot: () => ({ state: "idle" }),
    subscribe: () => () => undefined,
  } as never;
  return (
    <PersistentCallBoundaryDebugProvider value={boundary}>
      <PersistentCallProvider runtime={{ presentation, media }}>
        {children}
      </PersistentCallProvider>
    </PersistentCallBoundaryDebugProvider>
  );
}

describe("PersistentCallDebugPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("reports the real owner/provider/direct-chat button gates", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    render(
      <Runtime>
        <PersistentCallDebugPanel
          activeChatType="direct"
          directChat
          peerUuidSource="partnerRef"
          peerUuidValid
          finalButtonPredicate
        />
      </Runtime>,
    );

    expect(screen.getByTestId("persistent-call-debug-panel")).toHaveTextContent(/ownership state:owner/);
    expect(screen.getByTestId("persistent-call-debug-panel")).toHaveTextContent(/peer UUID source:partnerRef/);
    expect(screen.getByTestId("persistent-call-debug-panel")).toHaveTextContent(/final outgoing-button predicate:pass/);
    expect(info).toHaveBeenCalledWith("[persistent-call-debug]", expect.objectContaining({
      "PersistentCallContext provider mounted": "yes",
      "failed gates": ["none"],
    }));
  });

  it("does not render when the existing debug flag is disabled", () => {
    render(
      <PersistentCallBoundaryDebugProvider value={{ ...boundary, directedCallDiagnosticsEnabled: false }}>
        <PersistentCallDebugPanel
          activeChatType="direct"
          directChat
          peerUuidSource="partnerRef"
          peerUuidValid
          finalButtonPredicate
        />
      </PersistentCallBoundaryDebugProvider>,
    );
    expect(screen.queryByTestId("persistent-call-debug-panel")).not.toBeInTheDocument();
  });

  it("does not render in a browser even when persistent diagnostics are enabled or settings change", () => {
    const { rerender } = render(
      <PersistentCallBoundaryDebugProvider value={{ ...boundary, tauriDetected: false }}>
        <PersistentCallDebugPanel
          activeChatType="direct"
          directChat
          peerUuidSource="partnerRef"
          peerUuidValid
          finalButtonPredicate
        />
      </PersistentCallBoundaryDebugProvider>,
    );

    expect(screen.queryByTestId("persistent-call-debug-panel")).not.toBeInTheDocument();
    window.dispatchEvent(new Event("vetra:call-debug-changed"));
    rerender(
      <PersistentCallBoundaryDebugProvider value={{ ...boundary, tauriDetected: false }}>
        <PersistentCallDebugPanel
          activeChatType="direct"
          directChat
          peerUuidSource="partnerRef"
          peerUuidValid
          finalButtonPredicate
        />
      </PersistentCallBoundaryDebugProvider>,
    );
    expect(screen.queryByTestId("persistent-call-debug-panel")).not.toBeInTheDocument();
  });

  it("shows safe ownership release reasons in the visible timeline", () => {
    render(
      <PersistentCallBoundaryDebugProvider value={{
        ...boundary,
        ownershipEventTimeline: [{
          sequence: 15,
          elapsedMs: 42,
          event: "release_requested",
          frontendGeneration: 3,
          windowLabel: "main",
          ownershipKeyHash: "safe",
          leaseSuffix: null,
          reason: "runtime_start_failed",
          startupPhase: "session_start",
          errorType: "Error",
          errorMessage: "join failed safely",
          errorCategory: "plain_object",
          errorDetails: "keys=error,protocol_version,status; status=error",
          serverErrorCode: "feature_disabled",
          frontendState: "owner",
          rustHolderPresent: true,
          outcome: null,
        }],
        lastOwnershipEvent: null,
      }}>
        <PersistentCallDebugPanel
          activeChatType="direct"
          directChat
          peerUuidSource="partnerRef"
          peerUuidValid
          finalButtonPredicate
        />
      </PersistentCallBoundaryDebugProvider>,
    );

    expect(screen.getByTestId("persistent-call-debug-panel")).toHaveTextContent("15:release_requested(runtime_start_failed)[plain_object/feature_disabled: keys=error,protocol_version,status; status=error]");
  });

  it("lists only the failed gates for a hidden button without exposing identifiers", () => {
    render(
      <PersistentCallBoundaryDebugProvider value={{
        ...boundary,
        ownershipState: "non_owner",
        runtimeConstructed: false,
        contextMounted: false,
      }}>
        <PersistentCallDebugPanel
          activeChatType="room"
          directChat={false}
          peerUuidSource="none"
          peerUuidValid={false}
          finalButtonPredicate={false}
        />
      </PersistentCallBoundaryDebugProvider>,
    );

    const panel = screen.getByTestId("persistent-call-debug-panel");
    expect(panel).toHaveTextContent(/ownership state:non_owner/);
    expect(panel).toHaveTextContent(/failed gates:ownership_state, persistent_runtime, persistent_context, direct_chat, peer_uuid/);
    expect(panel).not.toHaveTextContent("33333333");
  });

  it("constrains the viewport and keeps long probe/timeline content scrollable", () => {
    const longText = "x".repeat(800);
    render(
      <PersistentCallBoundaryDebugProvider value={{
        ...boundary,
        ownershipEventTimeline: [{
          sequence: 1,
          elapsedMs: 1,
          event: "release_requested",
          frontendGeneration: 3,
          windowLabel: "main",
          ownershipKeyHash: "safe",
          leaseSuffix: null,
          reason: longText,
          startupPhase: "session_start",
          errorType: undefined,
          errorMessage: undefined,
          errorCategory: undefined,
          errorDetails: longText,
          serverErrorCode: undefined,
          frontendState: "owner",
          rustHolderPresent: true,
          outcome: null,
        }],
        directedCallEventTimeline: [{ sequence: 1, event: "media_phase", line: `media_phase ${longText}` }],
      }}>
        <PersistentCallDebugPanel activeChatType="direct" directChat peerUuidSource="partnerRef" peerUuidValid finalButtonPredicate />
      </PersistentCallBoundaryDebugProvider>,
    );

    const panel = screen.getByTestId("persistent-call-debug-panel");
    const body = screen.getByTestId("persistent-call-debug-body");
    expect(panel.className).toContain("max-h-[calc(100vh-1rem)]");
    expect(panel.className).toContain("w-[min(36rem,calc(100vw-1rem))]");
    expect(body.className).toContain("overflow-y-auto");
    expect(body.className).toContain("overflow-x-auto");
    expect(panel).toHaveTextContent(longText.slice(0, 96));

    fireEvent.click(screen.getByTestId("persistent-call-debug-timeline-tab"));
    expect(screen.getByTestId("persistent-call-debug-timeline")).toHaveTextContent(longText);
  });

  it("switches views without clearing data and copies complete off-screen content", async () => {
    const longProbeText = "probe-value-".repeat(120);
    const longTimelineText = "timeline-value-".repeat(120);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <PersistentCallBoundaryDebugProvider value={{
        ...boundary,
        ownershipEventTimeline: [{
          sequence: 1,
          elapsedMs: 1,
          event: "release_requested",
          frontendGeneration: 3,
          windowLabel: "main",
          ownershipKeyHash: "safe",
          leaseSuffix: null,
          reason: longProbeText,
          startupPhase: "session_start",
          errorType: undefined,
          errorMessage: undefined,
          errorCategory: undefined,
          errorDetails: longProbeText,
          serverErrorCode: undefined,
          frontendState: "owner",
          rustHolderPresent: true,
          outcome: null,
        }],
        directedCallEventTimeline: [{ sequence: 7, event: "media_phase", line: longTimelineText }],
      }}>
        <PersistentCallDebugPanel activeChatType="direct" directChat peerUuidSource="partnerRef" peerUuidValid finalButtonPredicate />
      </PersistentCallBoundaryDebugProvider>,
    );

    fireEvent.click(screen.getByTestId("persistent-call-debug-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining(longProbeText)));
    expect(screen.getByTestId("persistent-call-debug-copy-feedback")).toHaveTextContent("Copied");

    fireEvent.click(screen.getByTestId("persistent-call-debug-timeline-tab"));
    expect(screen.getByTestId("persistent-call-debug-timeline")).toHaveTextContent(longTimelineText);
    fireEvent.click(screen.getByTestId("persistent-call-debug-copy"));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining(longTimelineText)));

    fireEvent.click(screen.getByTestId("persistent-call-debug-probe-tab"));
    fireEvent.click(screen.getByTestId("persistent-call-debug-timeline-tab"));
    expect(screen.getByTestId("persistent-call-debug-timeline")).toHaveTextContent(longTimelineText);
  });

  it("isolates clipboard failures", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <PersistentCallBoundaryDebugProvider value={boundary}>
        <PersistentCallDebugPanel activeChatType="direct" directChat peerUuidSource="partnerRef" peerUuidValid finalButtonPredicate />
      </PersistentCallBoundaryDebugProvider>,
    );

    expect(() => fireEvent.click(screen.getByTestId("persistent-call-debug-copy"))).not.toThrow();
    await waitFor(() => expect(screen.getByTestId("persistent-call-debug-copy-feedback")).toHaveTextContent("Copy failed"));
  });
});
