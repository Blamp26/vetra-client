import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallProvider } from "./CallProvider";
import { useCallContext } from "./useCallContext";

const { useAppStoreMock, useCallMock, audioMounts, audioUnmounts } = vi.hoisted(
  () => ({
    useAppStoreMock: vi.fn(),
    useCallMock: vi.fn(),
    audioMounts: { current: 0 },
    audioUnmounts: { current: 0 },
  }),
);

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

vi.mock("@/features/calling/hooks/useCall", () => ({
  useCall: (currentUserId: number) => useCallMock(currentUserId),
}));

vi.mock("@/features/calling/components/CallAudioRenderer/CallAudioRenderer", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    CallAudioRenderer: ({ remoteStream }: { remoteStream: MediaStream | null }) => {
      React.useEffect(() => {
        audioMounts.current += 1;
        return () => {
          audioUnmounts.current += 1;
        };
      }, []);

      return (
        <div data-testid="provider-audio">
          {remoteStream ? "remote-stream-present" : "remote-stream-empty"}
        </div>
      );
    },
  };
});

function makeCallState(overrides = {}) {
  return {
    status: "active",
    remoteUserId: 2,
    remoteUsername: "Partner",
    callId: "call-1",
    isMuted: false,
    isScreenSharing: false,
    isScreenShareUpdating: false,
    isRemoteScreenLoading: false,
    remoteStream: { id: "remote-stream-1" } as MediaStream,
    remoteScreenStream: null,
    localScreenStream: null,
    seconds: 15,
    diagnostics: {
      connectionState: "connected",
      iceConnectionState: "connected",
      iceGatheringState: "complete",
      signalingState: "stable",
      selectedLocalCandidateType: "host",
    },
    callIssue: null,
    isIncomingActionPending: false,
    startCall: vi.fn(),
    startScreenShare: vi.fn(),
    stopScreenShare: vi.fn(),
    acceptCall: vi.fn(),
    rejectCall: vi.fn(),
    hangUp: vi.fn(),
    toggleMute: vi.fn(),
    ...overrides,
  };
}

function Probe() {
  const call = useCallContext();

  return (
    <button onClick={call.hangUp}>
      {call.status}:{call.remoteUsername}:{call.seconds}
    </button>
  );
}

function RouteSwitcher() {
  const [route, setRoute] = useState("chat");
  const call = useCallContext();

  return (
    <div>
      <div data-testid="route">{route}</div>
      <div data-testid="call">{call.status}:{call.remoteUsername}</div>
      <button onClick={() => setRoute("settings")}>settings</button>
    </div>
  );
}

describe("CallProvider", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    useCallMock.mockReset();
    useCallMock.mockReturnValue(makeCallState());
    audioMounts.current = 0;
    audioUnmounts.current = 0;
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        selectedOutputDeviceId: "default",
        setOutputDevice: vi.fn(),
      }),
    );
  });

  it("owns useCall once and exposes state/actions through context", async () => {
    const hangUp = vi.fn();
    useCallMock.mockReturnValue(makeCallState({ hangUp }));

    render(
      <CallProvider currentUserId={1}>
        <Probe />
      </CallProvider>,
    );

    expect(useCallMock).toHaveBeenCalledTimes(1);
    expect(useCallMock).toHaveBeenCalledWith(1);
    expect(screen.getByRole("button").textContent).toBe("active:Partner:15");
    expect(screen.getByTestId("provider-audio").textContent).toBe(
      "remote-stream-present",
    );

    fireEvent.click(screen.getByRole("button"));
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("keeps the same call provider lifecycle while child routes change", async () => {
    render(
      <CallProvider currentUserId={1}>
        <RouteSwitcher />
      </CallProvider>,
    );

    expect(screen.getByTestId("route").textContent).toBe("chat");
    expect(screen.getByTestId("call").textContent).toBe("active:Partner");
    expect(useCallMock).toHaveBeenCalledTimes(1);
    expect(audioMounts.current).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "settings" }));

    expect(screen.getByTestId("route").textContent).toBe("settings");
    expect(screen.getByTestId("call").textContent).toBe("active:Partner");
    expect(useCallMock).toHaveBeenCalledTimes(1);
    expect(audioMounts.current).toBe(1);
    expect(audioUnmounts.current).toBe(0);
  });
});
