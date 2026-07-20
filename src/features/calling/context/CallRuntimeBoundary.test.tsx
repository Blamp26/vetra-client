import { StrictMode, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallAuthorityOwnership } from "../services/callAuthorityOwnership";
import type { User } from "@/shared/types";

const mocks = vi.hoisted(() => ({
  CallProvider: vi.fn(({ children }: { children: ReactNode }) => <div data-testid="legacy-owner">{children}</div>),
  Session: vi.fn(class { start = vi.fn().mockResolvedValue(true); dispose = vi.fn(); }),
  Controller: vi.fn(class { dispose = vi.fn(); }),
  Incoming: vi.fn(class { dispose = vi.fn(); }),
  Presentation: vi.fn(class { dispose = vi.fn(); }),
  SignalTransport: vi.fn(class { dispose = vi.fn(); }),
  MediaCoordinator: vi.fn(class { start = vi.fn(); dispose = vi.fn(); }),
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
      ownershipFactory={() => ownership}
      legacyContent={<div data-testid="legacy-content">legacy</div>}
      nonCallContent={<div data-testid="non-call-content">messaging</div>}
    />,
  );
}

describe("CallRuntimeBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("fails closed for non-owners, unavailable ownership, and invalid persistent identity", async () => {
    renderBoundary("legacy", makeOwnership("non_owner"));
    expect(await screen.findByTestId("non-call-content")).toBeInTheDocument();
    expect(mocks.CallProvider).not.toHaveBeenCalled();

    const invalidUser = { ...USER_A, public_id: "not-a-uuid" } as User;
    renderBoundary("persistent", makeOwnership("owner"), invalidUser);
    await waitFor(() => expect(mocks.Session).not.toHaveBeenCalled());
    expect(mocks.CallProvider).not.toHaveBeenCalled();
  });

  it("does not duplicate a persistent runtime during StrictMode replay", async () => {
    const ownership = makeOwnership("owner");
    render(
      <StrictMode>
        <CallRuntimeBoundary
          currentUser={USER_A}
          socketManager={{ socket: {} } as never}
          mode="persistent"
          ownershipFactory={() => ownership}
          legacyContent={<div>legacy</div>}
          nonCallContent={<div data-testid="non-call-content">messaging</div>}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(mocks.Session).toHaveBeenCalledTimes(1));
  });
});
