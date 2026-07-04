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

  it("renders the audio-only dock as a large call viewport with one participant grid", () => {
    renderDock();

    expect(screen.getByTestId("active-call-dock")).toHaveClass(
      "active-call-dock",
      "h-[clamp(300px,48vh,523px)]",
    );
    expect(screen.getByTestId("call-dock-inner")).toHaveClass("call-dock-inner", "h-full", "w-full");
    expect(screen.getByTestId("call-dock-inner")).not.toHaveClass("max-w-[980px]", "mx-auto");
    expect(screen.getByTestId("active-call-dock-surface")).toHaveClass("call-surface", "flex-1");
    expect(screen.getByTestId("active-call-dock-surface")).not.toHaveClass("rounded-[12px]", "p-[14px]");
    expect(screen.getByTestId("call-grid-view")).toBeInTheDocument();
    expect(screen.getByTestId("call-grid-view")).toHaveClass(
      "call-grid",
      "h-full",
      "w-full",
      "gap-[clamp(24px,2vw,32px)]",
    );
    expect(screen.getAllByTestId("active-call-participant-tile")).toHaveLength(2);
    expect(screen.getAllByTestId("active-call-participant-tile")[0]).toHaveClass("participant-tile", "participant-tile--avatar");
    expect(screen.getAllByTestId("active-call-participant-tile")[0]).toHaveClass(
      "h-[clamp(140px,14vw,190px)]",
      "max-h-[190px]",
      "w-[clamp(220px,24vw,330px)]",
      "max-w-[330px]",
      "shrink-0",
    );
    expect(screen.getAllByTestId("active-call-participant-tile")[0].className).not.toContain("flex-[");
    expect(screen.getAllByTestId("active-call-participant-tile")[0]).not.toHaveClass("max-w-[705px]");
    expect(screen.getAllByTestId("active-call-participant-tile")[0]).toHaveClass(
      "rounded-[4px]",
      "border",
      "bg-[var(--call-surface-2)]",
    );
    expect(screen.getAllByTestId("participant-avatar-name")[0]).toHaveTextContent("You");
    expect(screen.queryByTestId("active-call-screen-share-tile")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-call-dock-controls")).toHaveClass("call-controls", "h-[50px]");
    expect(screen.getByRole("button", { name: "Mute" })).toHaveClass(
      "h-12",
      "w-12",
      "rounded-[4px]",
      "border",
    );
    expect(screen.getByRole("button", { name: "Mute" })).not.toHaveClass("rounded-full");
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share screen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hang Up" })).toHaveClass(
      "ctrl-btn--danger",
      "h-12",
      "w-12",
      "rounded-[4px]",
    );
  });

  it("renders a remote screen share as an idle participant tile without auto-expanding", () => {
    renderDock({ remoteScreenStream: makeStream("remote-screen") });

    const dock = screen.getByTestId("active-call-dock");
    const tile = screen.getByTestId("active-call-screen-share-tile");

    expect(dock).toHaveClass("active-call-dock", "h-[clamp(300px,48vh,523px)]");
    expect(tile).toHaveAttribute("data-variant", "screenShare");
    expect(tile).toHaveAttribute("data-state", "idle");
    expect(tile).toHaveClass("participant-tile", "participant-tile--screen");
    expect(tile).toHaveClass(
      "h-[clamp(140px,14vw,190px)]",
      "max-h-[190px]",
      "w-[clamp(220px,24vw,330px)]",
      "max-w-[330px]",
      "rounded-[4px]",
      "border",
    );
    expect(tile.className).not.toContain("flex-[");
    expect(screen.getByRole("button", { name: "Watch stream" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Watch stream" })).toHaveClass("rounded-[4px]", "border");
    expect(screen.queryByRole("button", { name: "Expand Alice's screen" })).not.toBeInTheDocument();
    expect(screen.getByTestId("participant-screen-name")).toHaveTextContent("Alice");
    expect(screen.queryByTestId("focus-stream-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("active-call-dock-controls")).toBeInTheDocument();
  });

  it("watches a remote screen share inline as a normal grid tile", () => {
    const stream = makeStream("remote-screen");
    renderDock({ remoteScreenStream: stream });

    const tileBefore = screen.getByTestId("active-call-screen-share-tile");
    fireEvent.click(screen.getByRole("button", { name: "Watch stream" }));
    const tileAfter = screen.getByTestId("active-call-screen-share-tile");

    expect(tileAfter).toBe(tileBefore);
    expect(tileAfter).toHaveAttribute("data-state", "watchingInline");
    expect(tileAfter).toHaveClass(
      "h-[clamp(140px,14vw,190px)]",
      "max-h-[190px]",
      "w-[clamp(220px,24vw,330px)]",
      "max-w-[330px]",
    );
    expect(tileAfter.className).not.toContain("flex-[");
    expect(screen.getByTestId("participant-screen-video")).toHaveProperty("srcObject", stream);
    expect(screen.getByTestId("participant-screen-video")).toHaveClass("object-contain");
    expect(screen.getByRole("button", { name: "Expand Alice's screen" })).toBeInTheDocument();
    expect(screen.queryByTestId("focus-stream-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-call-dock-controls")).not.toHaveClass("watch-stage-ui", "opacity-20");
  });

  it("opens partial fullscreen from the grid tile, then true fullscreen from pop out", () => {
    const stream = makeStream("remote-screen");
    renderDock({ remoteScreenStream: stream });

    fireEvent.click(screen.getByRole("button", { name: "Watch stream" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Alice's screen" }));

    expect(screen.getByTestId("focus-stream-view")).toBeInTheDocument();
    expect(screen.getByTestId("focus-stream-view")).toHaveClass("focus-stream-view", "h-full", "w-full");
    expect(screen.getByTestId("focus-stream-view")).not.toHaveClass("max-w-[1040px]", "mx-auto");
    expect(screen.getByTestId("active-call-dock")).toHaveClass("active-call-dock", "h-[clamp(300px,48vh,523px)]");
    expect(screen.getByText("Alice's screen")).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText("720p")).toBeInTheDocument();
    expect(screen.getByTestId("focus-stream-stage")).toBeInTheDocument();
    expect(screen.getByTestId("focus-stream-stage")).toHaveClass(
      "focus-stage",
      "flex-1",
      "min-h-[180px]",
      "rounded-[4px]",
      "border",
    );
    expect(screen.getByTestId("focus-participant-strip")).toHaveTextContent("You");
    expect(screen.getByTestId("focus-participant-strip")).toHaveTextContent("Alice");
    expect(screen.getByTestId("focus-participant-strip")).toHaveClass("focus-strip", "watch-stage-ui", "opacity-20");
    expect(
      screen.getByTestId("focus-participant-strip").querySelectorAll(".focus-strip-tile"),
    ).toHaveLength(2);
    expect(screen.getByTestId("focus-control-bar")).toBeInTheDocument();
    expect(screen.getByTestId("focus-control-bar")).toHaveClass(
      "focus-controls",
      "h-[50px]",
      "watch-stage-ui",
      "opacity-20",
      "group-hover:opacity-100",
    );
    expect(screen.getByRole("button", { name: "Mute" })).toHaveClass("h-12", "w-12", "rounded-[4px]");
    expect(screen.getByRole("button", { name: "Mute" })).not.toHaveClass("rounded-full");
    expect(screen.getByTestId("focus-stream-video")).toHaveProperty("srcObject", stream);
    expect(screen.getByTestId("focus-stream-video")).toHaveClass("object-contain");

    fireEvent.click(screen.getByRole("button", { name: "Pop out stream" }));

    expect(screen.getByTestId("fullscreen-stream-view")).toBeInTheDocument();
    expect(screen.getByTestId("fullscreen-stream-view")).toHaveClass("items-center", "justify-center", "bg-[#050506]");
    expect(screen.getByTestId("fullscreen-content")).toHaveClass("fullscreen-content", "flex", "flex-col", "items-center");
    expect(screen.getByTestId("fullscreen-stream-stage")).toHaveClass(
      "aspect-video",
      "w-[min(1354px,70.6vw,calc(100vw-96px))]",
      "max-w-[1354px]",
    );
    expect(screen.getByTestId("fullscreen-stream-stage")).not.toHaveClass("flex-1");
    expect(screen.getByTestId("fullscreen-stream-video")).toHaveProperty("srcObject", stream);
    expect(screen.getByTestId("fullscreen-stream-video")).toHaveClass("object-contain");
    expect(screen.getByTestId("fullscreen-control-bar")).toHaveClass(
      "fullscreen-ui",
      "opacity-0",
      "pointer-events-none",
      "group-hover:opacity-100",
    );
    expect(screen.getByTestId("fullscreen-control-bar")).not.toHaveClass("absolute", "bottom-5", "-translate-x-1/2");
    expect(screen.getByTestId("fullscreen-participant-strip")).toHaveClass(
      "fullscreen-ui",
      "opacity-0",
      "pointer-events-none",
      "group-hover:opacity-100",
    );
    expect(screen.getByTestId("fullscreen-participant-strip")).not.toHaveClass("absolute", "bottom-24", "-translate-x-1/2");
    expect(screen.getAllByTestId("fullscreen-participant-avatar-tile")).toHaveLength(2);
    expect(screen.getByTestId("fullscreen-participant-strip")).toHaveTextContent("You");
    expect(screen.getByTestId("fullscreen-participant-strip")).toHaveTextContent("Alice");
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen stream" }));
    expect(screen.queryByTestId("fullscreen-stream-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("focus-stream-view")).toBeInTheDocument();
  });

  it("exits partial fullscreen back to the watched grid tile", () => {
    renderDock({ remoteScreenStream: makeStream("remote-screen") });

    fireEvent.click(screen.getByRole("button", { name: "Watch stream" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Alice's screen" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit focus view" }));

    expect(screen.queryByTestId("focus-stream-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-call-screen-share-tile")).toHaveAttribute(
      "data-state",
      "watchingInline",
    );
    expect(screen.getByTestId("participant-screen-video")).toBeInTheDocument();
  });

  it("renders local sharing as a grid tile without a Watch stream action or auto-opened stage", () => {
    const onStopScreenShare = vi.fn();
    const stream = makeStream("local-screen");
    renderDock({
      localScreenStream: stream,
      isScreenSharing: true,
      onStopScreenShare,
    });

    expect(screen.getByTestId("active-call-dock")).toHaveClass("active-call-dock", "h-[clamp(300px,48vh,523px)]");
    expect(screen.queryByRole("button", { name: "Watch stream" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("focus-stream-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-call-screen-share-tile")).toHaveAttribute("data-state", "watchingInline");
    expect(screen.getByTestId("active-call-screen-share-tile")).toHaveClass(
      "h-[clamp(140px,14vw,190px)]",
      "max-h-[190px]",
      "w-[clamp(220px,24vw,330px)]",
      "max-w-[330px]",
    );
    expect(screen.getByTestId("participant-screen-video")).toHaveProperty("srcObject", stream);
    expect(screen.getByTestId("participant-screen-video")).toHaveClass("object-contain");
    expect(screen.getByRole("button", { name: "Expand You's screen" })).toBeInTheDocument();

    expect(screen.getAllByRole("button", { name: "Stop sharing" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Stop sharing" })[0]);

    expect(onStopScreenShare).toHaveBeenCalledTimes(1);
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
