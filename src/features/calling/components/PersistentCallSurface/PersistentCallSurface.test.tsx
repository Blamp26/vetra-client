import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { PersistentCallProvider } from "../../context/PersistentCallContext";
import { PersistentCallSurface } from "./PersistentCallSurface";

function renderSurface({ phase = "active", presentationOverrides = {}, mediaOverrides = {} }: {
  phase?: string;
  presentationOverrides?: Record<string, unknown>;
  mediaOverrides?: Record<string, unknown>;
} = {}) {
  const media = {
    getSnapshot: () => ({ state: "signaling_ready", remoteAudioStream: null, localIssue: null, isMuted: false, canToggleMute: true, peerConnectionState: "connected" }),
    subscribe: () => () => undefined,
    toggleMute: vi.fn(),
    ...mediaOverrides,
  } as any;
  const presentation = {
    getSnapshot: () => ({
      phase,
      callId: "33333333-3333-4333-8333-333333333333",
      participantRole: "initiator",
      peerPublicId: "44444444-4444-4444-8444-444444444444",
      peerUsername: "Morf",
      statusLabel: "Active",
      terminalLabel: null,
      timestamps: null,
      terminalState: null,
      pendingAction: null,
      callIssue: null,
      recoverableError: null,
      canCancel: false,
      canHangup: true,
      incomingModal: { visible: false, callerDisplayName: "", presentationKey: null },
      ...presentationOverrides,
    }),
    subscribe: () => () => undefined,
    startCall: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    cancelCall: vi.fn(),
    hangup: vi.fn(),
    retryPendingAction: vi.fn(),
  } as any;
  const result = render(<PersistentCallProvider runtime={{ presentation, media }}><PersistentCallSurface>{null}</PersistentCallSurface></PersistentCallProvider>);
  return { media, presentation, ...result };
}

describe("PersistentCallSurface", () => {
  it.each(["calling", "ringing", "connecting", "active", "terminal"] as const)("does not render the temporary card during %s", (phase) => {
    renderSurface({ phase });
    expect(screen.queryByTestId("persistent-call-surface")).not.toBeInTheDocument();
  });

  it("keeps persistent remote audio rendering and autoplay recovery", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new Error("autoplay blocked"))
      .mockResolvedValue(undefined);
    const remoteAudioStream = {} as MediaStream;
    const { media } = renderSurface({ mediaOverrides: { getSnapshot: () => ({ state: "signaling_ready", remoteAudioStream, localIssue: null, isMuted: false, canToggleMute: true, peerConnectionState: "connected" }) } });

    expect(screen.getByTestId("persistent-remote-audio")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Enable audio" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Enable audio" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Enable audio" })).not.toBeInTheDocument());
    expect(media.toggleMute).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(2);
    play.mockRestore();
  });

  it("renders exactly one correlated incoming modal and no modal for outgoing presentation", () => {
    const incomingModal = {
      visible: true,
      callerDisplayName: "Morf",
      presentationKey: "33333333-3333-4333-8333-333333333333",
      isPending: false,
      onPresented: vi.fn(),
      onAccept: vi.fn(),
      onDecline: vi.fn(),
    };
    const incoming = renderSurface({ phase: "incoming", presentationOverrides: { participantRole: "recipient", incomingModal } });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    incoming.unmount();
    renderSurface({ phase: "ringing", presentationOverrides: { participantRole: "initiator" } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
