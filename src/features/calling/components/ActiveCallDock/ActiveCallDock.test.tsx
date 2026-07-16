import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ActiveCallDock } from "./ActiveCallDock";

function renderDock(overrides: Partial<ComponentProps<typeof ActiveCallDock>> = {}) {
  const props: ComponentProps<typeof ActiveCallDock> = {
    remoteUsername: "Alice", seconds: 65, isMuted: false, isScreenSharing: false,
    isScreenShareUpdating: false, isRemoteScreenLoading: false, callIssue: null,
    isRemoteScreenAvailable: false, isWatchingRemoteScreen: false,
    remoteScreenStream: null, localScreenStream: null,
    diagnostics: { connectionState: "connected", iceConnectionState: "connected", iceGatheringState: "complete", signalingState: "stable", selectedLocalCandidateType: "host" },
    onMuteToggle: vi.fn(), onStartScreenShare: vi.fn().mockResolvedValue(undefined),
    onStopScreenShare: vi.fn(), onWatchRemoteScreen: vi.fn().mockResolvedValue(undefined),
    onHangUp: vi.fn(), ...overrides,
  };
  return { props, ...render(<ActiveCallDock {...props} />) };
}
function stream(id: string) { return { id } as MediaStream; }
function expandShare() { fireEvent.click(screen.getByTestId("screen-share-framed-tile")); }

describe("ActiveCallDock", () => {
  it("renders a substantial one-to-one voice stage instead of the rejected 88px header", () => {
    renderDock();
    const dock = screen.getByTestId("active-call-dock");
    expect(dock).toHaveClass("active-call-dock--voice", "h-[clamp(300px,42vh,480px)]");
    expect(dock).not.toHaveClass("h-[88px]");
    expect(screen.getByTestId("active-call-voice-surface")).toBeInTheDocument();
    const tileRow = screen.getByTestId("voice-call-tile-row");
    const tiles = within(tileRow).getAllByTestId("active-call-voice-participant-tile");
    expect(tiles).toHaveLength(2);
    expect(tileRow).toHaveClass("grid", "grid-cols-2", "max-w-[760px]");
    for (const tile of tiles) {
      expect(tile).toHaveClass("voice-participant-tile", "aspect-video", "min-w-0");
      expect(tile).not.toHaveClass("flex-1");
      expect(within(tile).getByTestId("voice-participant-avatar")).toBeInTheDocument();
      expect(within(tile).getByTestId("voice-participant-label")).toBeInTheDocument();
    }
    expect(tileRow.compareDocumentPosition(screen.getByTestId("active-call-dock-controls")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId("voice-participant-label")[0]).toHaveTextContent("You");
    expect(screen.getAllByTestId("voice-participant-label")[1]).toHaveTextContent("Alice");
    expect(screen.getAllByTestId("voice-participant-avatar")).toHaveLength(2);
    expect(screen.getByTestId("active-call-dock-status")).toHaveTextContent("01:05");
    expect(screen.getByTestId("active-call-dock-status")).toHaveTextContent("Connected");
    expect(screen.queryByTestId("call-grid-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("active-call-dock-surface")).not.toBeInTheDocument();
    expect(screen.queryByTestId("webrtc-diagnostics")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-call-dock-controls")).toHaveClass("voice-call-controls-wrap");
    expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share screen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hang Up" })).toBeInTheDocument();
  });

  it("renders default screen sharing as a framed tile layout", () => {
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    const dock = screen.getByTestId("active-call-dock");
    expect(dock).toHaveClass("active-call-dock--framed", "h-[clamp(300px,42vh,480px)]");
    expect(screen.getByTestId("screen-share-framed-layout")).toBeInTheDocument();
    const row = screen.getByTestId("screen-share-framed-row");
    expect(row).toHaveClass("grid", "grid-cols-3", "max-w-[1120px]");
    expect(within(row).getByTestId("screen-share-framed-tile")).toHaveClass("screen-share-framed-tile", "aspect-video", "min-w-0");
    expect(within(row).getByTestId("screen-share-framed-video")).toHaveClass("object-contain");
    const participantTiles = within(row).getAllByTestId("screen-share-framed-participant-tile");
    expect(participantTiles).toHaveLength(2);
    for (const tile of [within(row).getByTestId("screen-share-framed-tile"), ...participantTiles]) {
      expect(tile).toHaveClass("screen-share-framed-tile", "aspect-video", "min-w-0");
      expect(tile).not.toHaveClass("col-span-2");
    }
    expect(screen.getByTestId("active-call-dock-controls")).toBeInTheDocument();
    expect(row.compareDocumentPosition(screen.getByTestId("active-call-dock-controls")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Expand share" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("screen-share-stage")).not.toBeInTheDocument();
    expect(screen.queryByTestId("call-grid-view")).not.toBeInTheDocument();
  });

  it("renders an available remote share as a keyboard-accessible placeholder and opens expanded viewing", async () => {
    const onWatchRemoteScreen = vi.fn(() => new Promise<void>(() => undefined));
    renderDock({ isRemoteScreenAvailable: true, onWatchRemoteScreen });
    const tile = screen.getByTestId("screen-share-framed-tile");
    expect(tile).toHaveAttribute("aria-label", "Watch Alice's screen share");
    expect(within(tile).getByText("Screen sharing")).toBeInTheDocument();
    expect(within(tile).getByText("Watch stream")).toBeInTheDocument();
    expect(screen.queryByTestId("screen-share-framed-video")).not.toBeInTheDocument();
    expect(within(tile).getByText("Alice")).toHaveClass("remote-screen-placeholder__username");
    expect(within(tile).getByText("Screen sharing")).toHaveClass("text-white/65");
    expect(within(tile).getByText("Watch stream")).toHaveClass("text-white");

    fireEvent.keyDown(tile, { key: "Enter" });
    fireEvent.click(tile);
    await waitFor(() => expect(onWatchRemoteScreen).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("screen-share-stage")).toBeInTheDocument();
  });

  it("prevents duplicate remote watch clicks while the request is pending", () => {
    const onWatchRemoteScreen = vi.fn(() => new Promise<void>(() => undefined));
    renderDock({ isRemoteScreenAvailable: true, onWatchRemoteScreen });
    const tile = screen.getByTestId("screen-share-framed-tile");
    fireEvent.click(tile);
    fireEvent.click(tile);
    expect(onWatchRemoteScreen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("screen-share-stage")).toBeInTheDocument();
  });

  it("keeps the watched remote stream when returning from expanded in-call viewing", async () => {
    renderDock({
      isRemoteScreenAvailable: true,
      isWatchingRemoteScreen: true,
      remoteScreenStream: stream("remote"),
    });
    fireEvent.click(screen.getByTestId("screen-share-framed-tile"));
    fireEvent.click(screen.getByTestId("screen-share-stage"));
    await waitFor(() => expect(screen.getByTestId("screen-share-framed-video")).toBeInTheDocument());
  });

  it("keeps controls hidden by default and exposes the visible-state contract on hover", () => {
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    expect(screen.getByTestId("screen-share-stage")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Return to framed call|Expand share/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("screen-share-framed-layout")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument();
    const stage = screen.getByTestId("screen-share-stage");
    expect(stage).toHaveAttribute("data-controls-visible", "false");
    expect(screen.getByTestId("active-call-dock-controls")).toHaveClass("stage-controls");
    fireEvent.mouseEnter(stage);
    expect(stage).toHaveAttribute("data-controls-visible", "true");
    fireEvent.mouseLeave(stage);
    expect(stage).toHaveAttribute("data-controls-visible", "false");
  });

  it("reveals the same controls contract through keyboard focus", () => {
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    const stage = screen.getByTestId("screen-share-stage");
    fireEvent.focus(stage);
    expect(stage).toHaveAttribute("data-controls-visible", "true");
    fireEvent.blur(stage, { relatedTarget: document.body });
    expect(stage).toHaveAttribute("data-controls-visible", "false");
  });

  it("keeps a local preview secondary when both streams exist", () => {
    renderDock({ remoteScreenStream: stream("remote"), localScreenStream: stream("local"), isScreenSharing: true, isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    expect(screen.getByTestId("local-screen-share-pip")).toHaveClass("h-[90px]", "w-[160px]");
  });

  it("uses the Fullscreen API and synchronizes browser exit", async () => {
    let fullscreenElement: Element | null = null;
    const requestFullscreen = vi.fn(function(this: Element) { fullscreenElement = this; document.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); });
    const exitFullscreen = vi.fn(() => { fullscreenElement = null; document.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.mouseEnter(screen.getByTestId("screen-share-stage"));
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    expect(screen.getByTestId("fullscreen-participant-strip")).toHaveClass("mt-5");
    expect(screen.getByTestId("fullscreen-participant-strip")).toBeInTheDocument();
    expect(screen.getAllByTestId("screen-share-framed-participant-tile")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Return to framed call|Expand share/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    await waitFor(() => expect(exitFullscreen).toHaveBeenCalledTimes(1));
  });

  it("offers a balanced participant fullscreen layout for voice-only calls", async () => {
    let fullscreenElement: Element | null = null;
    const requestFullscreen = vi.fn(function(this: Element) { fullscreenElement = this; document.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
    renderDock();

    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));

    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("active-call-voice-surface")).toHaveClass("fullscreen-voice-participants");
    expect(screen.getByTestId("voice-call-tile-row")).toBeInTheDocument();
    expect(screen.queryByTestId("fullscreen-participant-strip")).not.toBeInTheDocument();
  });

  it("keeps the call dock height stable while entering and leaving expanded share mode", async () => {
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    const initialDock = screen.getByTestId("active-call-dock");
    expect(initialDock).toHaveClass("h-[clamp(300px,42vh,480px)]", "shrink-0");

    fireEvent.click(screen.getByTestId("screen-share-framed-tile"));
    expect(screen.getByTestId("active-call-dock")).toHaveClass("h-[clamp(300px,42vh,480px)]", "shrink-0");

    fireEvent.click(screen.getByTestId("screen-share-stage"));
    await waitFor(() => expect(screen.getByTestId("screen-share-framed-layout")).toBeInTheDocument());
    expect(screen.getByTestId("active-call-dock")).toHaveClass("h-[clamp(300px,42vh,480px)]", "shrink-0");
  });

  it("handles fullscreenerror without leaving a stale fullscreen state", async () => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: vi.fn(() => { document.dispatchEvent(new Event("fullscreenerror")); return Promise.reject(new Error("unsupported")); }) });
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.mouseEnter(screen.getByTestId("screen-share-stage"));
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument());
  });

  it("clears fullscreen state when the screen share stream ends", async () => {
    const { rerender, props } = renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    rerender(<ActiveCallDock {...props} remoteScreenStream={null} isRemoteScreenLoading={false} isRemoteScreenAvailable={false} isWatchingRemoteScreen={false} />);
    await waitFor(() => expect(screen.getByTestId("active-call-voice-surface")).toBeInTheDocument());
  });

  it("keeps the screen-share button disabled while updating", () => {
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true, isScreenShareUpdating: true });
    expect(screen.getByRole("button", { name: "Updating screen share" })).toBeDisabled();
  });

  it("preserves mute, share and hang-up controls", async () => {
    const onMuteToggle = vi.fn(); const onStartScreenShare = vi.fn().mockResolvedValue(undefined); const onHangUp = vi.fn();
    renderDock({ onMuteToggle, onStartScreenShare, onHangUp });
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    fireEvent.click(screen.getByRole("button", { name: "Share screen" }));
    fireEvent.click(screen.getByRole("button", { name: "Hang Up" }));
    expect(onMuteToggle).toHaveBeenCalledTimes(1);
    expect(onStartScreenShare).toHaveBeenCalledTimes(1);
    expect(onHangUp).toHaveBeenCalledTimes(1);
  });

  it("stops local sharing through the same control", () => {
    const onStopScreenShare = vi.fn();
    renderDock({ isScreenSharing: true, localScreenStream: stream("local"), onStopScreenShare });
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
    expect(onStopScreenShare).toHaveBeenCalledTimes(1);
  });

  it("shows normalized call issues without rebuilding the dashboard", () => {
    renderDock({ callIssue: { tone: "error", message: "One side is already in a call." } });
    expect(screen.getByTestId("call-issue-banner")).toHaveTextContent("One side is already in a call.");
    expect(screen.queryByTestId("call-grid-view")).not.toBeInTheDocument();
  });

  it("does not make diagnostics part of the production call layout", () => {
    renderDock({ diagnostics: { connectionState: "failed", iceConnectionState: "failed", iceGatheringState: "complete", signalingState: "closed", selectedLocalCandidateType: "relay" } });
    expect(screen.queryByTestId("webrtc-diagnostics")).not.toBeInTheDocument();
  });
});
