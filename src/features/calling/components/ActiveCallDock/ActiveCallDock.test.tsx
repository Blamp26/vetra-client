import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveCallDock } from "./ActiveCallDock";

function renderDock(overrides: Partial<ComponentProps<typeof ActiveCallDock>> = {}) {
  const props: ComponentProps<typeof ActiveCallDock> = {
    remoteUsername: "Alice",
    seconds: 65,
    isMuted: false,
    isScreenSharing: false,
    isScreenShareUpdating: false,
    isRemoteScreenLoading: false,
    callIssue: null,
    remoteScreenStream: null,
    localScreenStream: null,
    diagnostics: {
      connectionState: "connected",
      iceConnectionState: "connected",
      iceGatheringState: "complete",
      signalingState: "stable",
      selectedLocalCandidateType: "host",
    },
    onMuteToggle: vi.fn(),
    onStartScreenShare: vi.fn(),
    onStopScreenShare: vi.fn(),
    onHangUp: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...render(<ActiveCallDock {...props} />),
  };
}

describe("ActiveCallDock", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  });

  it("renders a docked active call panel with status and controls", () => {
    renderDock();

    expect(screen.getByTestId("active-call-dock")).toBeInTheDocument();
    expect(screen.getByTestId("active-call-dock")).toHaveClass("h-[240px]");
    expect(screen.getByTestId("active-call-dock")).not.toHaveClass("h-[300px]");
    expect(screen.getByText("Voice call")).toBeInTheDocument();
    expect(screen.getAllByText("Alice")).toHaveLength(2);
    expect(screen.getByTestId("active-call-dock-status")).toHaveTextContent("Connected");
    expect(screen.getByTestId("active-call-dock-controls")).toBeInTheDocument();
    expect(screen.getByTestId("active-call-dock-stage")).toBeInTheDocument();
    expect(screen.getAllByTestId("active-call-participant-tile")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share screen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hang Up" })).toBeInTheDocument();
  });

  it("keeps controls in a normal control row instead of overlapping participant cards", () => {
    renderDock();

    const dock = screen.getByTestId("active-call-dock");
    const controls = screen.getByTestId("active-call-dock-controls");
    const stage = screen.getByTestId("active-call-dock-stage");

    expect(dock).toContainElement(controls);
    expect(dock).toContainElement(stage);
    expect(controls.parentElement).toBe(dock);
    expect(controls).not.toHaveClass("absolute");
    expect(controls).toHaveClass("border-t");
    expect(controls).not.toHaveClass("bg-card/50");
    expect(dock.className).not.toMatch(/gradient|backdrop|shadow/);
    expect(dock.className).not.toMatch(/#202225|#2b2d31|#1e1f22|#313338/);
    expect(controls.className).not.toMatch(/backdrop|shadow/);
    expect(controls.className).not.toMatch(/#202225|#2b2d31|#1e1f22|#313338/);
  });

  it("disables the screen-share control while an update is in flight", () => {
    renderDock({ isScreenShareUpdating: true });

    expect(
      screen.getByRole("button", { name: "Updating screen share" }),
    ).toBeDisabled();
    expect(screen.getByTestId("active-call-dock-status")).toHaveTextContent(
      "Updating screen share...",
    );
  });

  it("does not expand the dock when screen share is active", () => {
    renderDock({ remoteScreenStream: {} as MediaStream });

    const dock = screen.getByTestId("active-call-dock");
    expect(dock).toHaveClass("h-[240px]");
    expect(dock.className).not.toContain("clamp");
  });

  it("shows a compact remote stream preview tile and Watch button", () => {
    renderDock({ remoteScreenStream: {} as MediaStream });

    expect(screen.getByTestId("stream-preview-tile")).toBeInTheDocument();
    expect(screen.getByTestId("stream-preview-label")).toHaveTextContent(
      "Alice is sharing their screen",
    );
    expect(screen.getByRole("button", { name: "Watch" })).toBeInTheDocument();
    expect(screen.getAllByTestId("active-call-participant-chip")).toHaveLength(2);
    expect(screen.queryByTestId("screen-share-indicator")).not.toBeInTheDocument();
    expect(screen.queryByTestId("watch-stream-modal")).not.toBeInTheDocument();
  });

  it("opens WatchStreamModal only after clicking Watch", () => {
    renderDock({ remoteScreenStream: {} as MediaStream });

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    expect(screen.getByTestId("watch-stream-modal")).toBeInTheDocument();
    expect(screen.getByTestId("watch-stream-video")).toBeInTheDocument();
  });

  it("shows local sharing copy and keeps Stop sharing reliable", () => {
    const onStopScreenShare = vi.fn();
    renderDock({
      localScreenStream: {} as MediaStream,
      isScreenSharing: true,
      onStopScreenShare,
    });

    expect(screen.getByTestId("active-call-dock")).toHaveClass("h-[240px]");
    expect(screen.getByTestId("stream-preview-label")).toHaveTextContent(
      "You are sharing your screen",
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing" }));

    expect(onStopScreenShare).toHaveBeenCalledTimes(1);
  });

  it("auto-closes the watch modal when sharing stops", () => {
    const { rerender, props } = renderDock({ remoteScreenStream: {} as MediaStream });

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));
    expect(screen.getByTestId("watch-stream-modal")).toBeInTheDocument();

    rerender(
      <ActiveCallDock
        {...props}
        remoteScreenStream={null}
        localScreenStream={null}
        isRemoteScreenLoading={false}
      />,
    );

    expect(screen.queryByTestId("watch-stream-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stream-preview-tile")).not.toBeInTheDocument();
  });

  it("does not duplicate modal or indicator across repeated share stop share", () => {
    const firstStream = { id: "first" } as MediaStream;
    const secondStream = { id: "second" } as MediaStream;
    const { rerender, props } = renderDock({ remoteScreenStream: firstStream });

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));
    expect(screen.getAllByTestId("watch-stream-modal")).toHaveLength(1);

    rerender(<ActiveCallDock {...props} remoteScreenStream={null} />);
    expect(screen.queryByTestId("watch-stream-modal")).not.toBeInTheDocument();

    rerender(<ActiveCallDock {...props} remoteScreenStream={secondStream} />);
    expect(screen.getAllByTestId("stream-preview-tile")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Watch" }));
    expect(screen.getAllByTestId("watch-stream-modal")).toHaveLength(1);
  });

  it("keeps controls inside the compact sharing dock", () => {
    renderDock({ localScreenStream: {} as MediaStream, isScreenSharing: true });

    const dock = screen.getByTestId("active-call-dock");
    const controls = screen.getByTestId("active-call-dock-controls");
    expect(dock).toContainElement(controls);
    expect(controls).not.toHaveClass("absolute");
    expect(screen.getByTestId("stream-preview-tile")).toBeInTheDocument();
  });

  it("renders a calling status label", () => {
    renderDock({
      callStatus: "calling",
      diagnostics: {
        connectionState: "new",
        iceConnectionState: "new",
        iceGatheringState: "new",
        signalingState: "stable",
        selectedLocalCandidateType: "unknown",
      },
    });

    expect(screen.getByTestId("active-call-dock-status")).toHaveTextContent("Calling...");
  });

  it("renders a connecting status label before the peer is connected", () => {
    renderDock({
      diagnostics: {
        connectionState: "connecting",
        iceConnectionState: "checking",
        iceGatheringState: "gathering",
        signalingState: "stable",
        selectedLocalCandidateType: "unknown",
      },
    });

    expect(screen.getByTestId("active-call-dock-status")).toHaveTextContent("Connecting...");
  });

  it("normalizes recoverable call issue text inside the dock", () => {
    renderDock({
      callIssue: {
        tone: "error",
        message: "Call could not start because one side is already in a call.",
      },
    });

    expect(screen.getByTestId("call-issue-banner")).toHaveTextContent(
      "One side is already in a call.",
    );
  });

  it("calls the existing hangup action from the dock controls", () => {
    const onHangUp = vi.fn();
    renderDock({ onHangUp });

    fireEvent.click(screen.getByRole("button", { name: "Hang Up" }));

    expect(onHangUp).toHaveBeenCalledTimes(1);
  });

  it("does not pause unrelated document media when screen-share video detaches", () => {
    const externalVideo = document.createElement("video");
    const externalPause = vi.fn();
    Object.defineProperty(externalVideo, "pause", {
      value: externalPause,
      configurable: true,
    });
    document.body.appendChild(externalVideo);
    const { rerender } = renderDock({ remoteScreenStream: {} as MediaStream });
    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    rerender(
      <ActiveCallDock
        remoteUsername="Alice"
        seconds={65}
        isMuted={false}
        isScreenSharing={false}
        isScreenShareUpdating={false}
        isRemoteScreenLoading={false}
        callIssue={null}
        remoteScreenStream={null}
        localScreenStream={null}
        diagnostics={{
          connectionState: "connected",
          iceConnectionState: "connected",
          iceGatheringState: "complete",
          signalingState: "stable",
          selectedLocalCandidateType: "host",
        }}
        onMuteToggle={vi.fn()}
        onStartScreenShare={vi.fn()}
        onStopScreenShare={vi.fn()}
        onHangUp={vi.fn()}
      />,
    );

    expect(externalPause).not.toHaveBeenCalled();
    externalVideo.remove();
  });
});
