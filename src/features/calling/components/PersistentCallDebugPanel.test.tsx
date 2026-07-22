import { render, screen } from "@testing-library/react";
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
  afterEach(() => vi.restoreAllMocks());

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
});
