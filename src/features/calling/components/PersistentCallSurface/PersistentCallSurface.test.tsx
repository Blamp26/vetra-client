import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistentCallProvider } from "../../context/PersistentCallContext";
import { PersistentCallSurface } from "./PersistentCallSurface";
import { mediaSettingsStore } from "@/shared/utils/mediaSettings";

afterEach(() => {
  mediaSettingsStore.reset();
  Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
});

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

  it("persists the persistent output fallback through mediaSettingsStore", async () => {
    const setSinkId = vi.fn()
      .mockRejectedValueOnce(new DOMException("not found", "NotFoundError"))
      .mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { configurable: true, value: setSinkId });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const setOutputDeviceId = vi.spyOn(mediaSettingsStore, "setOutputDeviceId");
    mediaSettingsStore.setOutputDeviceId("speakers-1");
    const remoteAudioStream = {} as MediaStream;

    renderSurface({ mediaOverrides: { getSnapshot: () => ({ state: "signaling_ready", remoteAudioStream, localIssue: null, isMuted: false, canToggleMute: true, peerConnectionState: "connected" }) } });

    await waitFor(() => expect(setOutputDeviceId).toHaveBeenCalledWith("default"));
  });

  it("does not persist or notify when persistent default routing fails", async () => {
    const setSinkId = vi.fn().mockRejectedValue(new DOMException("missing output", "NotFoundError"));
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { configurable: true, value: setSinkId });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const setOutputDeviceId = vi.spyOn(mediaSettingsStore, "setOutputDeviceId");
    mediaSettingsStore.setOutputDeviceId("speakers-1");
    setOutputDeviceId.mockClear();
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    const remoteAudioStream = {} as MediaStream;

    renderSurface({ mediaOverrides: { getSnapshot: () => ({ state: "signaling_ready", remoteAudioStream, localIssue: null, isMuted: false, canToggleMute: true, peerConnectionState: "connected" }) } });

    await waitFor(() => expect(setSinkId).toHaveBeenCalledTimes(2));
    expect(setSinkId).toHaveBeenNthCalledWith(1, "speakers-1");
    expect(setSinkId).toHaveBeenNthCalledWith(2, "default");
    expect(setOutputDeviceId.mock.calls.map(([deviceId]) => deviceId)).not.toContain("default");
    expect(mediaSettingsStore.getSnapshot().preferences.outputDeviceId).toBe("speakers-1");
    expect(dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "vetra:toast" }));
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
