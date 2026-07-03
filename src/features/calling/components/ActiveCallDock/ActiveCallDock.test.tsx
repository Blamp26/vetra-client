import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveCallDock } from "./ActiveCallDock";

function makeStream(id: string): MediaStream {
  return { id } as MediaStream;
}

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

  it("keeps the audio-only dock compact with one participant grid", () => {
    renderDock();

    expect(screen.getByTestId("active-call-dock")).toHaveClass("active-call-dock", "min-h-[208px]");
    expect(screen.getByTestId("active-call-dock-surface")).toHaveClass("call-surface");
    expect(screen.getByTestId("call-grid-view")).toBeInTheDocument();
    expect(screen.getByTestId("call-grid-view")).toHaveClass("call-grid", "flex", "max-w-[680px]", "justify-center", "gap-[10px]");
    expect(screen.getAllByTestId("active-call-participant-tile")).toHaveLength(2);
    expect(screen.getAllByTestId("active-call-participant-tile")[0]).toHaveClass("participant-tile", "participant-tile--avatar");
    expect(screen.getAllByTestId("active-call-participant-tile")[0]).toHaveClass("w-[min(150px,calc((100vw-5rem)/2))]");
    expect(screen.getAllByTestId("active-call-participant-tile")[0]).not.toHaveClass("border");
    expect(screen.getAllByTestId("participant-avatar-name")[0]).toHaveTextContent("You");
    expect(screen.queryByTestId("active-call-screen-share-tile")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share screen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hang Up" })).toBeInTheDocument();
  });

  it("renders a remote screen share as an idle participant tile without auto-expanding", () => {
    renderDock({ remoteScreenStream: makeStream("remote-screen") });

    const dock = screen.getByTestId("active-call-dock");
    const tile = screen.getByTestId("active-call-screen-share-tile");

    expect(dock).toHaveClass("min-h-[208px]");
    expect(tile).toHaveAttribute("data-variant", "screenShare");
    expect(tile).toHaveAttribute("data-state", "idle");
    expect(tile).toHaveClass("participant-tile", "participant-tile--screen");
    expect(tile).toHaveClass("w-[min(150px,calc((100vw-5rem)/2))]");
    expect(screen.getByRole("button", { name: "Watch stream" })).toBeInTheDocument();
    expect(screen.getByTestId("participant-screen-name")).toHaveTextContent("Alice");
    expect(screen.queryByTestId("focus-stream-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("active-call-dock-controls")).toBeInTheDocument();
  });

  it("switches the same screen-share tile to watchingInline when Watch stream is clicked", () => {
    const stream = makeStream("remote-screen");
    renderDock({ remoteScreenStream: stream });

    const tileBefore = screen.getByTestId("active-call-screen-share-tile");
    fireEvent.click(screen.getByRole("button", { name: "Watch stream" }));
    const tileAfter = screen.getByTestId("active-call-screen-share-tile");

    expect(tileAfter).toBe(tileBefore);
    expect(tileAfter).toHaveAttribute("data-state", "watchingInline");
    expect(tileAfter).toHaveClass("participant-tile--watching");
    expect(screen.getByTestId("participant-screen-video")).toHaveProperty("srcObject", stream);
    expect(screen.getByTestId("participant-screen-live-badge")).toHaveTextContent("720p · LIVE");
    expect(screen.queryByTestId("focus-stream-view")).not.toBeInTheDocument();
  });

  it("opens FocusStreamView only from an explicit expand action after inline watch", () => {
    const stream = makeStream("remote-screen");
    renderDock({ remoteScreenStream: stream });

    expect(screen.queryByRole("button", { name: "Expand Alice's screen" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Watch stream" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Alice's screen" }));

    expect(screen.getByTestId("focus-stream-view")).toBeInTheDocument();
    expect(screen.getByTestId("focus-stream-view")).toHaveClass("focus-stream-view");
    expect(screen.getByTestId("active-call-dock")).toHaveClass("h-[min(56vh,520px)]");
    expect(screen.getByText("Alice's screen")).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText("720p")).toBeInTheDocument();
    expect(screen.getByTestId("focus-stream-stage")).toBeInTheDocument();
    expect(screen.getByTestId("focus-stream-stage")).toHaveClass("focus-stage", "max-h-[min(40vh,300px)]");
    expect(screen.getByTestId("focus-participant-strip")).toHaveTextContent("You");
    expect(screen.getByTestId("focus-participant-strip")).toHaveTextContent("Alice");
    expect(screen.getByTestId("focus-participant-strip")).toHaveClass("focus-strip");
    expect(screen.getByTestId("focus-control-bar")).toBeInTheDocument();
    expect(screen.getByTestId("focus-control-bar")).toHaveClass("focus-controls");
    expect(screen.getByTestId("focus-stream-video")).toHaveProperty("srcObject", stream);
  });

  it("exits focus back to the grid while preserving watchingInline state", () => {
    renderDock({ remoteScreenStream: makeStream("remote-screen") });

    fireEvent.click(screen.getByRole("button", { name: "Watch stream" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Alice's screen" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit focus view" }));

    expect(screen.queryByTestId("focus-stream-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-call-screen-share-tile")).toHaveAttribute(
      "data-state",
      "watchingInline",
    );
  });

  it("shows local sharing as a screen-share tile with stop sharing available from tile and controls", () => {
    const onStopScreenShare = vi.fn();
    renderDock({
      localScreenStream: makeStream("local-screen"),
      isScreenSharing: true,
      onStopScreenShare,
    });

    expect(screen.getByTestId("active-call-dock")).toHaveClass("min-h-[208px]");
    expect(screen.getByTestId("active-call-screen-share-tile")).toHaveAttribute(
      "data-state",
      "idle",
    );
    expect(screen.getByTestId("participant-screen-name")).toHaveTextContent("You");

    fireEvent.click(screen.getAllByRole("button", { name: "Stop sharing" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Stop sharing" })[1]);

    expect(onStopScreenShare).toHaveBeenCalledTimes(2);
  });

  it("removes inline/focus UI state when sharing stops", () => {
    const { rerender, props } = renderDock({ remoteScreenStream: makeStream("remote-screen") });

    fireEvent.click(screen.getByRole("button", { name: "Watch stream" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Alice's screen" }));
    expect(screen.getByTestId("focus-stream-view")).toBeInTheDocument();

    rerender(
      <ActiveCallDock
        {...props}
        remoteScreenStream={null}
        localScreenStream={null}
        isRemoteScreenLoading={false}
      />,
    );

    expect(screen.queryByTestId("focus-stream-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("active-call-screen-share-tile")).not.toBeInTheDocument();
  });

  it("disables the screen-share control while an update is in flight", () => {
    renderDock({ isScreenShareUpdating: true });

    expect(screen.getByRole("button", { name: "Updating screen share" })).toBeDisabled();
    expect(screen.getByTestId("active-call-dock-status")).toHaveTextContent(
      "Updating screen share...",
    );
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

  it("does not pause unrelated document media when screen-share video detaches", () => {
    const externalVideo = document.createElement("video");
    const externalPause = vi.fn();
    Object.defineProperty(externalVideo, "pause", {
      value: externalPause,
      configurable: true,
    });
    document.body.appendChild(externalVideo);
    const { rerender, props } = renderDock({ remoteScreenStream: makeStream("remote-screen") });
    fireEvent.click(screen.getByRole("button", { name: "Watch stream" }));

    rerender(<ActiveCallDock {...props} remoteScreenStream={null} />);

    expect(externalPause).not.toHaveBeenCalled();
    externalVideo.remove();
  });
});
