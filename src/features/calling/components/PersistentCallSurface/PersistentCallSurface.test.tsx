import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { PersistentCallProvider } from "../../context/PersistentCallContext";
import { PersistentCallSurface } from "./PersistentCallSurface";

function renderSurface(phase: "connecting" | "active", canToggleMute: boolean) {
  let mediaListener: ((snapshot: any) => void) | null = null;
  const media = {
    getSnapshot: () => ({ state: "signaling_ready", remoteAudioStream: null, localIssue: null, isMuted: false, canToggleMute }),
    subscribe: (listener: (snapshot: any) => void) => { mediaListener = listener; return () => { mediaListener = null; }; },
    toggleMute: vi.fn(),
  } as any;
  const presentation = {
    getSnapshot: () => ({
      phase,
      callId: "33333333-3333-4333-8333-333333333333",
      peerUsername: "Alice",
      statusLabel: phase === "active" ? "Active" : "Connecting",
      callIssue: null,
      recoverableError: null,
      canCancel: false,
      canHangup: true,
      incomingModal: { visible: false },
    }),
    subscribe: () => () => undefined,
    startCall: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    cancelCall: vi.fn(),
    hangup: vi.fn(),
    retryPendingAction: vi.fn(),
  } as any;
  render(
    <PersistentCallProvider runtime={{ presentation, media }}>
      <PersistentCallSurface>{null}</PersistentCallSurface>
    </PersistentCallProvider>,
  );
  return { media, emitMedia: mediaListener };
}

describe("PersistentCallSurface mute control", () => {
  it("keeps mute disabled until a local microphone track exists", () => {
    renderSurface("connecting", false);
    expect(screen.getByRole("button", { name: "Mute microphone" })).toBeDisabled();
  });

  it("exposes mute in connecting and active phases through the context action", () => {
    const { media } = renderSurface("active", true);
    const mute = screen.getByRole("button", { name: "Mute microphone" });
    expect(mute).toBeEnabled();
    mute.click();
    expect(media.toggleMute).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Hang up call" })).toBeInTheDocument();
  });
});

describe("PersistentCallSurface audio recovery", () => {
  it("offers user playback recovery after autoplay rejection and hides it after success", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new Error("autoplay blocked"))
      .mockResolvedValue(undefined);
    const remoteAudioStream = {} as MediaStream;
    const media = {
      getSnapshot: () => ({ state: "signaling_ready", remoteAudioStream, localIssue: null, isMuted: false, canToggleMute: true }),
      subscribe: () => () => undefined,
      toggleMute: vi.fn(),
    } as any;
    const presentation = {
      getSnapshot: () => ({ phase: "active", callId: "33333333-3333-4333-8333-333333333333", peerUsername: "Alice", statusLabel: "Active", callIssue: null, recoverableError: null, canCancel: false, canHangup: true, incomingModal: { visible: false } }),
      subscribe: () => () => undefined,
      startCall: vi.fn(), accept: vi.fn(), decline: vi.fn(), cancelCall: vi.fn(), hangup: vi.fn(), retryPendingAction: vi.fn(),
    } as any;
    render(<PersistentCallProvider runtime={{ presentation, media }}><PersistentCallSurface>{null}</PersistentCallSurface></PersistentCallProvider>);

    await waitFor(() => expect(screen.getByRole("button", { name: "Enable audio" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Enable audio" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Enable audio" })).not.toBeInTheDocument());
    expect(play).toHaveBeenCalledTimes(2);
    play.mockRestore();
  });
});

describe("PersistentCallSurface terminal results", () => {
  function renderTerminal(terminalLabel: string | null, statusLabel = "Call finished") {
    const media = {
      getSnapshot: () => ({ state: "idle", remoteAudioStream: null, localIssue: null, isMuted: false, canToggleMute: false }),
      subscribe: () => () => undefined,
      toggleMute: vi.fn(),
    } as any;
    const presentation = {
      getSnapshot: () => ({
        phase: "terminal",
        callId: "33333333-3333-4333-8333-333333333333",
        peerUsername: "Alice",
        statusLabel,
        terminalLabel,
        callIssue: null,
        recoverableError: null,
        canCancel: false,
        canHangup: false,
        incomingModal: { visible: false },
      }),
      subscribe: () => () => undefined,
      startCall: vi.fn(), accept: vi.fn(), decline: vi.fn(), cancelCall: vi.fn(), hangup: vi.fn(), retryPendingAction: vi.fn(),
    } as any;
    render(<PersistentCallProvider runtime={{ presentation, media }}><PersistentCallSurface>{null}</PersistentCallSurface></PersistentCallProvider>);
  }

  it.each([
    ["unavailable", "Call unavailable"],
    ["undelivered", "Call not delivered"],
    ["busy", "User unavailable"],
    ["declined", "Call declined"],
    ["cancelled", "Call cancelled"],
    ["no_answer", "No answer"],
    ["connection_failed", "Connection failed"],
    ["ended", "Call ended"],
  ] as const)("renders the canonical %s result", (_state, terminalLabel) => {
    renderTerminal(terminalLabel);
    expect(screen.getByText(terminalLabel)).toBeInTheDocument();
    expect(screen.queryByText("Call finished")).not.toBeInTheDocument();
  });

  it("keeps status labels for non-terminal phases", () => {
    renderSurface("active", true);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("falls back safely to statusLabel when a terminal label is absent", () => {
    renderTerminal(null);
    expect(screen.getByText("Call finished")).toBeInTheDocument();
  });
});
