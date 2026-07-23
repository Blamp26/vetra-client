import { render, screen } from "@testing-library/react";
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
