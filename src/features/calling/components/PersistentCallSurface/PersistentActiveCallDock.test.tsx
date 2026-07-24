import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
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
      {props.screenShareAvailable && <button>screen share</button>}
    </div>
  ),
}));

describe("PersistentActiveCallDock", () => {
  it("drives the existing dock with persistent state and actions", () => {
    const toggleMute = vi.fn(() => true);
    const hangup = vi.fn(async () => ({ ok: true }));
    const runtime = {
      presentation: { getSnapshot: () => activePresentation, subscribe: () => () => undefined, hangup },
      media: { getSnapshot: () => ({ remoteAudioStream: null, localIssue: null, isMuted: true, canToggleMute: true, peerConnectionState: "connected" }), subscribe: () => () => undefined, toggleMute },
    } as any;
    render(<PersistentCallProvider runtime={runtime}><PersistentActiveCallDock currentUser={{ id: 1, public_id: "me", display_name: "Me" } as any} remoteUser={null} /></PersistentCallProvider>);

    expect(screen.getByTestId("active-call-dock-probe")).toHaveTextContent("Morfactive");
    expect(screen.queryByRole("button", { name: "screen share" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "mute" }));
    fireEvent.click(screen.getByRole("button", { name: "hangup" }));
    expect(toggleMute).toHaveBeenCalledTimes(1);
    expect(hangup).toHaveBeenCalledTimes(1);
  });
});
