import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PersistentCallProvider } from "../../context/PersistentCallContext";
import { PersistentActiveCallDock } from "./PersistentActiveCallDock";

const activePresentation = {
  phase: "active",
  callId: "11111111-1111-4111-8111-111111111111",
  participantRole: "initiator",
  peerPublicId: "22222222-2222-4222-8222-222222222222",
  peerUsername: "Morf",
  statusLabel: "Active",
  terminalLabel: null,
  timestamps: { active_at: "2026-01-01T00:00:00.000Z" },
  terminalState: null,
  pendingAction: null,
  callIssue: null,
  recoverableError: null,
  canCancel: false,
  canHangup: true,
  incomingModal: { visible: false, callerDisplayName: "", presentationKey: null },
} as any;

vi.mock("../ActiveCallDock", () => ({
  ActiveCallDock: (props: any) => (
    <div data-testid="active-call-dock-probe">
      <span>{props.remoteUsername}</span>
      <span>{props.callStatus}</span>
      <span>{props.seconds}</span>
      <button onClick={props.onMuteToggle}>mute</button>
      <button onClick={props.onHangUp}>hangup</button>
      {props.screenShareAvailable && <button onClick={props.isScreenSharing ? props.onStopScreenShare : props.onStartScreenShare}>screen share</button>}
      <output data-testid="screen-share-props">{JSON.stringify({
        screenShareAvailable: props.screenShareAvailable,
        isScreenSharing: props.isScreenSharing,
        isRemoteScreenAvailable: props.isRemoteScreenAvailable,
        isWatchingRemoteScreen: props.isWatchingRemoteScreen,
        hasLocalStream: Boolean(props.localScreenStream),
        hasRemoteStream: Boolean(props.remoteScreenStream),
        callStatus: props.callStatus,
      })}</output>
    </div>
  ),
}));

describe("PersistentActiveCallDock", () => {
  beforeAll(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia: vi.fn() },
    });
  });

  it("drives the existing dock with persistent state and actions", () => {
    const toggleMute = vi.fn(() => true);
    const hangup = vi.fn(async () => ({ ok: true }));
    const startScreenShare = vi.fn(async () => true);
    const stopScreenShare = vi.fn(async () => true);
    const runtime = {
      presentation: { getSnapshot: () => activePresentation, subscribe: () => () => undefined, hangup },
      media: { getSnapshot: () => ({ remoteAudioStream: null, localIssue: null, isMuted: true, canToggleMute: true, peerConnectionState: "connected", projection: { state: "active" }, isLocalScreenShareActive: true, localScreenShareStream: {} as MediaStream, remoteScreenShareStream: {} as MediaStream }), subscribe: () => () => undefined, toggleMute, startScreenShare, stopScreenShare },
    } as any;
    render(<PersistentCallProvider runtime={runtime}><PersistentActiveCallDock currentUser={{ id: 1, public_id: "me", display_name: "Me" } as any} remoteUser={null} /></PersistentCallProvider>);

    expect(screen.getByTestId("active-call-dock-probe")).toHaveTextContent("Morfactive");
    expect(screen.getByTestId("screen-share-props")).toHaveTextContent(JSON.stringify({ screenShareAvailable: true, isScreenSharing: true, isRemoteScreenAvailable: true, isWatchingRemoteScreen: true, hasLocalStream: true, hasRemoteStream: true, callStatus: "active" }));
    fireEvent.click(screen.getByRole("button", { name: "screen share" }));
    fireEvent.click(screen.getByRole("button", { name: "mute" }));
    fireEvent.click(screen.getByRole("button", { name: "hangup" }));
    expect(toggleMute).toHaveBeenCalledTimes(1);
    expect(hangup).toHaveBeenCalledTimes(1);
    expect(stopScreenShare).toHaveBeenCalledTimes(1);
    expect(startScreenShare).not.toHaveBeenCalled();
  });

  it("does not expose screen sharing when the persistent capability is unavailable", () => {
    const runtime = {
      presentation: { getSnapshot: () => activePresentation, subscribe: () => () => undefined },
      media: { getSnapshot: () => ({ remoteAudioStream: null, localIssue: null, isMuted: false, canToggleMute: true, peerConnectionState: "connected", projection: { state: "idle" }, isLocalScreenShareActive: false, localScreenShareStream: null, remoteScreenShareStream: null }), subscribe: () => () => undefined },
    } as any;

    render(<PersistentCallProvider runtime={runtime}><PersistentActiveCallDock currentUser={{ id: 1, public_id: "me", display_name: "Me" } as any} remoteUser={null} /></PersistentCallProvider>);

    expect(screen.queryByRole("button", { name: "screen share" })).not.toBeInTheDocument();
    expect(screen.getByTestId("screen-share-props")).toHaveTextContent(JSON.stringify({ screenShareAvailable: false, isScreenSharing: false, isRemoteScreenAvailable: false, isWatchingRemoteScreen: false, hasLocalStream: false, hasRemoteStream: false, callStatus: "active" }));
  });

  it("delegates starting screen share to the persistent action", () => {
    const startScreenShare = vi.fn(async () => true);
    const runtime = {
      presentation: { getSnapshot: () => activePresentation, subscribe: () => () => undefined },
      media: { getSnapshot: () => ({ remoteAudioStream: null, localIssue: null, isMuted: false, canToggleMute: true, peerConnectionState: "connected", projection: { state: "active" }, isLocalScreenShareActive: false, localScreenShareStream: null, remoteScreenShareStream: null }), subscribe: () => () => undefined, startScreenShare },
    } as any;

    render(<PersistentCallProvider runtime={runtime}><PersistentActiveCallDock currentUser={{ id: 1, public_id: "me", display_name: "Me" } as any} remoteUser={null} /></PersistentCallProvider>);

    fireEvent.click(screen.getByRole("button", { name: "screen share" }));
    expect(startScreenShare).toHaveBeenCalledTimes(1);
  });
});
