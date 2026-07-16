import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { mockCurrentWindow, mockGetCurrentWindow, fullscreenState, nativeEventHandlers, nativeWindowState, nativeCallOrder } = vi.hoisted(() => {
  const state = { value: false };
  const windowState = { resizable: true, maximized: false };
  const callOrder: string[] = [];
  const handlers = { resize: [] as Array<() => void>, focus: [] as Array<() => void> };
  const currentWindow = {
    setFullscreen: vi.fn(async (fullscreen: boolean) => { callOrder.push(`setFullscreen:${fullscreen}`); state.value = fullscreen; }),
    isFullscreen: vi.fn(async () => { callOrder.push("isFullscreen"); return state.value; }),
    isResizable: vi.fn(async () => { callOrder.push("isResizable"); return windowState.resizable; }),
    setResizable: vi.fn(async (resizable: boolean) => { callOrder.push(`setResizable:${resizable}`); windowState.resizable = resizable; }),
    isMaximized: vi.fn(async () => { callOrder.push("isMaximized"); return windowState.maximized; }),
    unmaximize: vi.fn(async () => { callOrder.push("unmaximize"); windowState.maximized = false; }),
    maximize: vi.fn(async () => { callOrder.push("maximize"); windowState.maximized = true; }),
    onResized: vi.fn(async (handler: () => void) => { handlers.resize.push(handler); return () => { handlers.resize = handlers.resize.filter((candidate) => candidate !== handler); }; }),
    onFocusChanged: vi.fn(async (handler: () => void) => { handlers.focus.push(handler); return () => { handlers.focus = handlers.focus.filter((candidate) => candidate !== handler); }; }),
  };
  return {
    mockCurrentWindow: currentWindow,
    mockGetCurrentWindow: vi.fn(() => currentWindow),
    fullscreenState: state,
    nativeEventHandlers: handlers,
    nativeWindowState: windowState,
    nativeCallOrder: callOrder,
  };
});

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: mockGetCurrentWindow }));
import { ActiveCallDock } from "./ActiveCallDock";

beforeEach(() => {
  vi.clearAllMocks();
  fullscreenState.value = false;
  nativeWindowState.resizable = true;
  nativeWindowState.maximized = false;
  nativeCallOrder.length = 0;
  nativeEventHandlers.resize = [];
  nativeEventHandlers.focus = [];
  mockCurrentWindow.setFullscreen.mockImplementation(async (fullscreen: boolean) => { nativeCallOrder.push(`setFullscreen:${fullscreen}`); fullscreenState.value = fullscreen; });
  mockCurrentWindow.isFullscreen.mockImplementation(async () => { nativeCallOrder.push("isFullscreen"); return fullscreenState.value; });
  mockCurrentWindow.isResizable.mockImplementation(async () => { nativeCallOrder.push("isResizable"); return nativeWindowState.resizable; });
  mockCurrentWindow.setResizable.mockImplementation(async (resizable: boolean) => { nativeCallOrder.push(`setResizable:${resizable}`); nativeWindowState.resizable = resizable; });
  mockCurrentWindow.isMaximized.mockImplementation(async () => { nativeCallOrder.push("isMaximized"); return nativeWindowState.maximized; });
  mockCurrentWindow.unmaximize.mockImplementation(async () => { nativeCallOrder.push("unmaximize"); nativeWindowState.maximized = false; });
  mockCurrentWindow.maximize.mockImplementation(async () => { nativeCallOrder.push("maximize"); nativeWindowState.maximized = true; });
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (X11; Linux x86_64)" });
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
});

afterEach(() => {
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

function emitNativeResize() { for (const handler of [...nativeEventHandlers.resize]) handler(); }
function emitNativeFocus() { for (const handler of [...nativeEventHandlers.focus]) handler(); }
function useWindowsRuntime() { Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }); }
function expectCallOrder(sequence: string[]) {
  let previousIndex = -1;
  for (const call of sequence) {
    const nextIndex = nativeCallOrder.indexOf(call, previousIndex + 1);
    expect(nextIndex, `missing ordered call ${call} in ${nativeCallOrder.join(", ")}`).toBeGreaterThan(previousIndex);
    previousIndex = nextIndex;
  }
}

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

  it("uses native Tauri fullscreen and never calls the browser Fullscreen API", async () => {
    const requestFullscreen = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: requestFullscreen });
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.mouseEnter(screen.getByTestId("screen-share-stage"));
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(mockCurrentWindow.setFullscreen).toHaveBeenCalledWith(true));
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(mockCurrentWindow.isResizable).not.toHaveBeenCalled();
    expect(mockCurrentWindow.setResizable).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    expect(screen.getByTestId("fullscreen-participant-strip")).toHaveClass("mt-5");
    expect(screen.getByTestId("fullscreen-participant-strip")).toBeInTheDocument();
    expect(screen.getAllByTestId("screen-share-framed-participant-tile")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Return to framed call|Expand share/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    await waitFor(() => expect(mockCurrentWindow.setFullscreen).toHaveBeenLastCalledWith(false));
  });

  it("removes Windows maximized and resizable state before entering fullscreen", async () => {
    useWindowsRuntime();
    nativeWindowState.maximized = true;
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    expectCallOrder(["isResizable", "isMaximized", "unmaximize", "setResizable:false", "setFullscreen:true", "isFullscreen"]);
    expect(nativeWindowState.resizable).toBe(false);
    expect(nativeWindowState.maximized).toBe(false);
  });

  it("does not unmaximize a non-maximized Windows window", async () => {
    useWindowsRuntime();
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    expect(mockCurrentWindow.unmaximize).not.toHaveBeenCalled();
    expectCallOrder(["isResizable", "isMaximized", "setResizable:false", "setFullscreen:true", "isFullscreen"]);
  });

  it("restores Windows resizable and maximized state after exit", async () => {
    useWindowsRuntime();
    nativeWindowState.maximized = true;
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    nativeCallOrder.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument());
    expectCallOrder(["setFullscreen:false", "isFullscreen", "setResizable:true", "maximize"]);
    expect(nativeWindowState.resizable).toBe(true);
    expect(nativeWindowState.maximized).toBe(true);
  });

  it("preserves a previously non-resizable Windows window after exit", async () => {
    useWindowsRuntime();
    nativeWindowState.resizable = false;
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument());
    expect(nativeWindowState.resizable).toBe(false);
    expect(mockCurrentWindow.setResizable).toHaveBeenCalledWith(false);
  });

  it("restores Windows state after failed fullscreen entry", async () => {
    useWindowsRuntime();
    nativeWindowState.maximized = true;
    mockCurrentWindow.setFullscreen.mockRejectedValueOnce(new Error("entry failed"));
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument());
    expect(nativeWindowState.resizable).toBe(true);
    expect(nativeWindowState.maximized).toBe(true);
    expect(document.getElementById("vetra-call-fullscreen-root")).not.toBeInTheDocument();
  });

  it("restores Windows state once after an external fullscreen exit", async () => {
    useWindowsRuntime();
    nativeWindowState.maximized = true;
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    nativeCallOrder.length = 0;
    mockCurrentWindow.setResizable.mockClear();
    mockCurrentWindow.maximize.mockClear();
    fullscreenState.value = false;
    emitNativeResize();
    emitNativeFocus();
    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).not.toBeInTheDocument());
    expect(nativeWindowState.resizable).toBe(true);
    expect(nativeWindowState.maximized).toBe(true);
    expect(mockCurrentWindow.setResizable).toHaveBeenCalledTimes(1);
    expect(mockCurrentWindow.maximize).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("screen-share-stage")).toBeInTheDocument();
  });

  it("restores Windows state during teardown", async () => {
    useWindowsRuntime();
    nativeWindowState.maximized = true;
    const { unmount } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    unmount();
    await waitFor(() => expect(nativeWindowState.resizable).toBe(true));
    expect(nativeWindowState.maximized).toBe(true);
    expect(mockCurrentWindow.setFullscreen).toHaveBeenLastCalledWith(false);
  });

  it("portals fullscreen share presentation directly under body and removes the normal stage", async () => {
    const { container } = renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));

    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).toBeInTheDocument());
    const root = document.getElementById("vetra-call-fullscreen-root");
    expect(root?.parentElement).toBe(document.body);
    expect(container.contains(root)).toBe(false);
    expect(document.querySelectorAll("#vetra-call-fullscreen-root")).toHaveLength(1);
    const surface = root?.firstElementChild as HTMLElement;
    expect(surface).toHaveClass("fullscreen-call-surface", "h-full", "min-h-0", "w-full", "flex-1", "border-0");
    expect(surface).not.toHaveClass("h-[clamp(300px,42vh,480px)]", "min-h-[300px]", "shrink-0", "border-b", "border-border");
    expect(within(root as HTMLElement).getByTestId("remote-screen-share-video")).toBeInTheDocument();
    expect(within(root as HTMLElement).getByTestId("fullscreen-participant-strip")).toBeInTheDocument();
    expect(within(root as HTMLElement).getByTestId("fullscreen-share-video-area")).toHaveClass("flex-1", "min-h-0");
    expect(within(root as HTMLElement).getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();
    expect(container.querySelector("[data-testid=screen-share-stage]")).not.toBeInTheDocument();
    expect(document.querySelectorAll("[data-testid=remote-screen-share-video]")).toHaveLength(1);
  });

  it("portals the voice participant grid and locks body overflow", async () => {
    const previousOverflow = document.body.style.overflow;
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));

    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).toBeInTheDocument());
    const root = document.getElementById("vetra-call-fullscreen-root") as HTMLElement;
    expect(root).toHaveClass("vetra-call-fullscreen-root");
    expect(root.firstElementChild).toHaveClass("fullscreen-call-surface", "h-full", "min-h-0", "w-full", "flex-1", "border-0");
    expect(root.firstElementChild).not.toHaveClass("h-[clamp(300px,42vh,480px)]", "min-h-[300px]", "shrink-0", "border-b", "border-border");
    expect(within(root).getByTestId("active-call-voice-surface")).toBeInTheDocument();
    expect(within(root).getByTestId("voice-call-tile-row")).toBeInTheDocument();
    expect(within(root).getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(within(root).getByRole("button", { name: "Exit fullscreen" }));
    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it("closes the portal when a native resize reports fullscreen has ended", async () => {
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).toBeInTheDocument());

    fullscreenState.value = false;
    emitNativeResize();
    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).not.toBeInTheDocument());
    expect(screen.getByTestId("screen-share-stage")).toBeInTheDocument();
    expect(mockCurrentWindow.setFullscreen).not.toHaveBeenCalledWith(false);
  });

  it("closes the portal when a native focus event reports fullscreen has ended", async () => {
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).toBeInTheDocument());

    fullscreenState.value = false;
    emitNativeFocus();
    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).not.toBeInTheDocument());
    expect(screen.getByTestId("active-call-voice-surface")).toBeInTheDocument();
  });

  it("keeps the portal when native resize and focus still report fullscreen", async () => {
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).toBeInTheDocument());
    mockCurrentWindow.isFullscreen.mockClear();

    fullscreenState.value = true;
    emitNativeResize();
    emitNativeFocus();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(mockCurrentWindow.isFullscreen).toHaveBeenCalledTimes(1);
    expect(document.getElementById("vetra-call-fullscreen-root")).toBeInTheDocument();
  });

  it("debounces duplicate native fullscreen events", async () => {
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).toBeInTheDocument());
    mockCurrentWindow.isFullscreen.mockClear();
    fullscreenState.value = false;

    emitNativeResize();
    emitNativeResize();
    emitNativeFocus();
    emitNativeFocus();
    await waitFor(() => expect(document.getElementById("vetra-call-fullscreen-root")).not.toBeInTheDocument());
    expect(mockCurrentWindow.isFullscreen).toHaveBeenCalledTimes(1);
  });

  it("removes native fullscreen listeners on unmount", async () => {
    const { unmount } = renderDock();
    await waitFor(() => expect(mockCurrentWindow.onResized).toHaveBeenCalledTimes(1));
    expect(nativeEventHandlers.resize).toHaveLength(1);
    expect(nativeEventHandlers.focus).toHaveLength(1);
    unmount();
    expect(nativeEventHandlers.resize).toHaveLength(0);
    expect(nativeEventHandlers.focus).toHaveLength(0);
  });

  it("keeps the same remote stream and does not watch again across fullscreen", async () => {
    const remote = stream("remote");
    const onWatchRemoteScreen = vi.fn().mockResolvedValue(undefined);
    renderDock({ remoteScreenStream: remote, isRemoteScreenAvailable: true, isWatchingRemoteScreen: true, onWatchRemoteScreen });
    expandShare();
    const videoBefore = screen.getByTestId("remote-screen-share-video");
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    expect(document.querySelectorAll("[data-testid=remote-screen-share-video]")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    await waitFor(() => expect(screen.getByTestId("remote-screen-share-video")).toBeInTheDocument());
    expect(onWatchRemoteScreen).not.toHaveBeenCalled();
    expect((screen.getByTestId("remote-screen-share-video") as HTMLVideoElement).getAttribute("aria-label")).toBe(videoBefore.getAttribute("aria-label"));
  });

  it("keeps the portal viewport contract in the stylesheet", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    expect(styles).toMatch(/\.vetra-call-fullscreen-root[\s\S]*position:\s*fixed/);
    expect(styles).toMatch(/\.vetra-call-fullscreen-root[\s\S]*z-index:\s*2147483647/);
    expect(styles).toMatch(/\.vetra-call-fullscreen-root[\s\S]*width:\s*100dvw/);
    expect(styles).toMatch(/\.vetra-call-fullscreen-root[\s\S]*height:\s*100dvh/);
    expect(styles).toMatch(/\.vetra-call-fullscreen-root[\s\S]*display:\s*flex/);
    expect(styles).toMatch(/\.vetra-call-fullscreen-root[\s\S]*flex-direction:\s*column/);
    expect(styles).toMatch(/\.vetra-call-fullscreen-root\s*>\s*\.fullscreen-call-surface[\s\S]*flex:\s*1\s+1\s+0%/);
  });

  it("exits native fullscreen from Escape and keeps the voice grid presentation", async () => {
    renderDock();

    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));

    await waitFor(() => expect(mockCurrentWindow.setFullscreen).toHaveBeenCalledWith(true));
    expect(screen.getByTestId("active-call-voice-surface")).toHaveClass("fullscreen-voice-participants");
    expect(screen.getByTestId("voice-call-tile-row")).toBeInTheDocument();
    expect(screen.queryByTestId("fullscreen-participant-strip")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(mockCurrentWindow.setFullscreen).toHaveBeenLastCalledWith(false));
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

  it("does not apply fullscreen state when native enter rejects", async () => {
    mockCurrentWindow.setFullscreen.mockRejectedValueOnce(new Error("unsupported"));
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.mouseEnter(screen.getByTestId("screen-share-stage"));
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument());
    expect(screen.getByTestId("screen-share-stage")).not.toHaveClass("fullscreen-share-layout");
  });

  it("synchronizes native state when exit rejects", async () => {
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    mockCurrentWindow.setFullscreen.mockRejectedValueOnce(new Error("exit failed"));
    mockCurrentWindow.isFullscreen.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    await waitFor(() => expect(mockCurrentWindow.isFullscreen).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();
  });

  it("exits native fullscreen when the call ends", async () => {
    const { rerender, props } = renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    rerender(<ActiveCallDock {...props} callStatus="ended" />);
    await waitFor(() => expect(mockCurrentWindow.setFullscreen).toHaveBeenLastCalledWith(false));
  });

  it("exits native fullscreen during cleanup when the call owns it", async () => {
    const { unmount } = renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument());
    unmount();
    await waitFor(() => expect(mockCurrentWindow.setFullscreen).toHaveBeenLastCalledWith(false));
  });

  it("keeps the viewport-filling fullscreen contract on the call stage", async () => {
    renderDock({ remoteScreenStream: stream("remote"), isRemoteScreenAvailable: true, isWatchingRemoteScreen: true });
    expandShare();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(screen.getByTestId("screen-share-stage")).toHaveClass("fullscreen-share-layout", "screen-share-stage--fullscreen"));
    expect(screen.getByTestId("screen-share-stage")).toHaveClass("flex", "flex-col");
  });

  it("keeps the native fullscreen capability and title-bar drag permission", () => {
    const capability = readFileSync("src-tauri/capabilities/default.json", "utf8");
    expect(capability).toContain("core:window:allow-set-fullscreen");
    expect(capability).toContain("core:window:allow-is-resizable");
    expect(capability).toContain("core:window:allow-set-resizable");
    expect(capability).toContain("core:window:allow-start-dragging");
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
