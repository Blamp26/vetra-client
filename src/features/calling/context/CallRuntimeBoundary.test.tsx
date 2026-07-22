import { StrictMode, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallAuthorityOwnership } from "../services/callAuthorityOwnership";
import type { User } from "@/shared/types";

const mocks = vi.hoisted(() => ({
  startupFailure: null as Error | null,
  CallProvider: vi.fn(({ children }: { children: ReactNode }) => <div data-testid="legacy-owner">{children}</div>),
  Session: vi.fn(class { start = vi.fn(() => mocks.startupFailure ? Promise.reject(mocks.startupFailure) : Promise.resolve(true)); dispose = vi.fn(); }),
  Controller: vi.fn(class { dispose = vi.fn(); }),
  Incoming: vi.fn(class { dispose = vi.fn(); }),
  Presentation: vi.fn(class {
    dispose = vi.fn();
    getSnapshot = vi.fn(() => ({ disposed: false, phase: "idle", callId: null, participantRole: null, peerPublicId: null, peerUsername: null, canonicalState: null, stateVersion: null, timestamps: null, terminalState: null, pendingAction: null, recoverableError: null, statusLabel: "Ready", terminalLabel: null, callIssue: null, canCancel: false, canHangup: false, mediaControlsAvailable: false, incomingModal: { visible: false, callerDisplayName: "", isPending: false, presentationKey: null, onPresented: undefined, onAccept: vi.fn(), onDecline: vi.fn() } }));
    subscribe = vi.fn(() => () => undefined);
    startCall = vi.fn();
    accept = vi.fn();
    decline = vi.fn();
    cancelCall = vi.fn();
    hangup = vi.fn();
    retryPendingAction = vi.fn();
  }),
  SignalTransport: vi.fn(class { dispose = vi.fn(); }),
  MediaCoordinator: vi.fn(class {
    start = vi.fn();
    dispose = vi.fn();
    getSnapshot = vi.fn(() => ({ state: "idle", callId: null, participantRole: null, projection: null, generation: "test", remoteAudioStream: null, localIssue: null }));
    subscribe = vi.fn(() => () => undefined);
  }),
}));

vi.mock("./CallProvider", () => ({ CallProvider: mocks.CallProvider }));
vi.mock("../services/directedCallSession", () => ({ DirectedCallSession: mocks.Session }));
vi.mock("../services/directedCallLifecycleController", () => ({ DirectedCallLifecycleController: mocks.Controller }));
vi.mock("../services/directedCallIncomingCoordinator", () => ({ DirectedCallIncomingCoordinator: mocks.Incoming }));
vi.mock("../services/directedCallPresentationModel", () => ({ DirectedCallPresentationModel: mocks.Presentation }));
vi.mock("../services/directedCallSignalTransport", () => ({ DirectedCallSignalTransport: mocks.SignalTransport }));
vi.mock("../services/directedCallMediaCoordinator", () => ({ DirectedCallMediaCoordinator: mocks.MediaCoordinator }));
vi.mock("../services/directedCallDevice", () => ({
  getOrCreateDirectedCallDeviceId: () => "11111111-1111-4111-8111-111111111111",
}));

import { CallRuntimeBoundary } from "./CallRuntimeBoundary";

const USER_A = {
  id: 1,
  public_id: "22222222-2222-4222-8222-222222222222",
  username: "alice",
} as User;

function makeOwnership(state: "owner" | "non_owner" | "unavailable") {
  return {
    getSnapshot: vi.fn(() => ({
      state,
      key: "vetra:call-authority:test",
      ownerId: "owner-id",
    })),
    subscribe: vi.fn(() => () => undefined),
    acquire: vi.fn(async () => ({ state, key: "vetra:call-authority:test", ownerId: "owner-id" })),
    dispose: vi.fn(async () => undefined),
  } as unknown as CallAuthorityOwnership;
}

function makeTraceableOwnership(state: "owner" | "non_owner" | "unavailable") {
  const events: Array<{ event: string; reason?: string | null; startupPhase?: string; errorType?: string; errorMessage?: string }> = [];
  const ownership = makeOwnership(state) as unknown as CallAuthorityOwnership & {
    trace: (event: string, details?: { reason?: string | null; startupPhase?: string; errorType?: string; errorMessage?: string }) => void;
    capturedTraceEvents: typeof events;
  };
  ownership.trace = (event, details) => events.push({
    event,
    reason: details?.reason,
    startupPhase: details?.startupPhase,
    errorType: details?.errorType,
    errorMessage: details?.errorMessage,
  });
  ownership.capturedTraceEvents = events;
  ownership.dispose = vi.fn(async (_disposeOwner, reason) => {
    ownership.trace("release_requested", { reason });
  });
  return ownership;
}

function renderBoundary(
  mode: "legacy" | "persistent" | "disabled",
  ownership: CallAuthorityOwnership,
  user = USER_A,
) {
  return render(
    <CallRuntimeBoundary
      currentUser={user}
      socketManager={{ socket: {} } as never}
      mode={mode}
      persistentMediaAvailable
      ownershipFactory={() => ownership}
      legacyContent={<div data-testid="legacy-content">legacy</div>}
      nonCallContent={<div data-testid="non-call-content">messaging</div>}
    />,
  );
}

describe("CallRuntimeBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startupFailure = null;
  });

  it("mounts exactly the legacy owner branch without persistent services", async () => {
    renderBoundary("legacy", makeOwnership("owner"));
    expect(await screen.findByTestId("legacy-owner")).toBeInTheDocument();
    expect(mocks.Session).not.toHaveBeenCalled();
    expect(screen.getByTestId("legacy-content")).toBeInTheDocument();
  });

  it("constructs one dormant persistent runtime without mounting CallProvider", async () => {
    renderBoundary("persistent", makeOwnership("owner"));
    expect(await screen.findByTestId("non-call-content")).toBeInTheDocument();
    await waitFor(() => expect(mocks.Session).toHaveBeenCalledTimes(1));
    expect(mocks.CallProvider).not.toHaveBeenCalled();
    expect(mocks.Incoming).toHaveBeenCalledTimes(1);
    expect(mocks.Presentation).toHaveBeenCalledTimes(1);
    expect(mocks.SignalTransport).toHaveBeenCalledTimes(1);
    expect(mocks.MediaCoordinator).toHaveBeenCalledTimes(1);
  });

  it("waits for the persistent socket prerequisite without releasing a granted owner", async () => {
    const ownership = makeOwnership("owner");
    const view = render(
      <CallRuntimeBoundary
        currentUser={USER_A}
        socketManager={null}
        mode="persistent"
        persistentMediaAvailable
        ownershipFactory={() => ownership}
        legacyContent={<div>legacy</div>}
        nonCallContent={<div data-testid="non-call-content">messaging</div>}
        persistentContent={<div data-testid="persistent-content">persistent</div>}
      />,
    );

    await Promise.resolve();
    expect(ownership.acquire).not.toHaveBeenCalled();
    expect(ownership.dispose).not.toHaveBeenCalled();

    view.rerender(
      <CallRuntimeBoundary
        currentUser={USER_A}
        socketManager={{ socket: {} } as never}
        mode="persistent"
        persistentMediaAvailable
        ownershipFactory={() => ownership}
        legacyContent={<div>legacy</div>}
        nonCallContent={<div data-testid="non-call-content">messaging</div>}
        persistentContent={<div data-testid="persistent-content">persistent</div>}
      />,
    );
    await waitFor(() => expect(ownership.acquire).toHaveBeenCalledTimes(1));
    expect(ownership.dispose).not.toHaveBeenCalled();

    view.rerender(
      <CallRuntimeBoundary
        currentUser={USER_A}
        socketManager={{ socket: {} } as never}
        mode="persistent"
        persistentMediaAvailable
        ownershipFactory={() => ownership}
        legacyContent={<div>legacy</div>}
        nonCallContent={<div data-testid="non-call-content">messaging</div>}
        persistentContent={<div data-testid="persistent-content">persistent</div>}
      />,
    );
    expect(ownership.acquire).toHaveBeenCalledTimes(1);
    expect(ownership.dispose).not.toHaveBeenCalled();

    view.unmount();
    await waitFor(() => expect(ownership.dispose).toHaveBeenCalledTimes(1));
  });

  it("records the rollback reason for an acquired owner when runtime prerequisites fail", async () => {
    const ownership = makeTraceableOwnership("owner");
    render(
      <CallRuntimeBoundary
        currentUser={USER_A}
        socketManager={{ socket: {} } as never}
        mode="persistent"
        persistentMediaAvailable={false}
        ownershipFactory={() => ownership}
        legacyContent={<div>legacy</div>}
        nonCallContent={<div data-testid="non-call-content">messaging</div>}
        persistentContent={<div data-testid="persistent-content">persistent</div>}
      />,
    );

    await waitFor(() => expect(ownership.dispose).toHaveBeenCalledTimes(1));
    expect(ownership.capturedTraceEvents).toContainEqual({ event: "release_requested", reason: "runtime_prerequisite_unavailable" });
  });

  it("traces the safe rejected session-start error before rolling ownership back", async () => {
    mocks.startupFailure = new Error("topic join failed for device 11111111-1111-4111-8111-111111111111");
    const ownership = makeTraceableOwnership("owner");
    renderBoundary("persistent", ownership);

    await waitFor(() => expect(ownership.dispose).toHaveBeenCalledTimes(1));
    expect(ownership.capturedTraceEvents).toContainEqual({ event: "runtime_start_requested", reason: "session_start", startupPhase: undefined, errorType: undefined, errorMessage: undefined });
    expect(ownership.capturedTraceEvents).toContainEqual({
      event: "runtime_start_failed",
      reason: "runtime_start_failed",
      startupPhase: "session_start",
      errorType: "Error",
      errorMessage: "topic join failed for <redacted-sensitive-field>",
    });
  });

  it("releases only the old authority when the stable profile identity changes", async () => {
    const first = makeOwnership("owner");
    const second = makeOwnership("owner");
    const view = renderBoundary("persistent", first);
    await waitFor(() => expect(first.acquire).toHaveBeenCalledTimes(1));

    view.rerender(
      <CallRuntimeBoundary
        currentUser={{ ...USER_A, public_id: "33333333-3333-4333-8333-333333333333" } as User}
        socketManager={{ socket: {} } as never}
        mode="persistent"
        persistentMediaAvailable
        ownershipFactory={() => second}
        legacyContent={<div>legacy</div>}
        nonCallContent={<div data-testid="non-call-content">messaging</div>}
        persistentContent={<div data-testid="persistent-content">persistent</div>}
      />,
    );
    await waitFor(() => expect(second.acquire).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(first.dispose).toHaveBeenCalledTimes(1));
    expect(second.dispose).not.toHaveBeenCalled();
  });

  it("fails closed for non-owners, unavailable ownership, and invalid persistent identity", async () => {
    renderBoundary("legacy", makeOwnership("non_owner"));
    expect(await screen.findByTestId("non-call-content")).toBeInTheDocument();
    expect(mocks.CallProvider).not.toHaveBeenCalled();

    const invalidUser = { ...USER_A, public_id: "not-a-uuid" } as User;
    renderBoundary("persistent", makeOwnership("owner"), invalidUser);
    await waitFor(() => expect(mocks.Session).not.toHaveBeenCalled());
    expect(mocks.CallProvider).not.toHaveBeenCalled();
  });

  it("fails closed when persistent browser media APIs are unavailable", async () => {
    render(
      <CallRuntimeBoundary
        currentUser={USER_A}
        socketManager={{ socket: {} } as never}
        mode="persistent"
        persistentMediaAvailable={false}
        ownershipFactory={() => makeOwnership("owner")}
        legacyContent={<div>legacy</div>}
        nonCallContent={<div data-testid="non-call-content">messaging</div>}
        persistentContent={<div data-testid="persistent-content">persistent</div>}
      />,
    );
    expect(await screen.findByTestId("non-call-content")).toBeInTheDocument();
    await waitFor(() => expect(mocks.Session).not.toHaveBeenCalled());
  });

  it("does not duplicate a persistent runtime during StrictMode replay", async () => {
    const ownership = makeOwnership("owner");
    render(
      <StrictMode>
        <CallRuntimeBoundary
          currentUser={USER_A}
          socketManager={{ socket: {} } as never}
          mode="persistent"
          persistentMediaAvailable
          ownershipFactory={() => ownership}
          legacyContent={<div>legacy</div>}
          nonCallContent={<div data-testid="non-call-content">messaging</div>}
          persistentContent={<div data-testid="persistent-content">persistent</div>}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(mocks.Session).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("persistent-content")).toBeInTheDocument();
  });
});
