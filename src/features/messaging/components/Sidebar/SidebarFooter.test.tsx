import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const { useAppStoreMock, toggleMicMock, toggleSoundMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  toggleMicMock: vi.fn(),
  toggleSoundMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));

vi.mock("@/features/profile/components/ProfileModal/ProfileModal", () => ({
  ProfileModal: ({ onClose }: { onClose: () => void }) => {
    const opener = document.activeElement;
    return (
      <div role="dialog" aria-label="Profile">
        <button
          type="button"
          onClick={() => {
            onClose();
            if (opener instanceof HTMLElement) opener.focus();
          }}
        >
          Close profile
        </button>
      </div>
    );
  },
}));

vi.mock("@/shared/components/ConfirmModal/ConfirmModal", () => ({
  ConfirmModal: ({ onConfirm }: { onConfirm: () => void }) => (
    <button onClick={onConfirm}>confirm hang up</button>
  ),
}));

import { SidebarFooter } from "./SidebarFooter";
import type { CallIssue, CallStatus } from "@/features/calling/hooks/useCall.types";

function renderFooter({
  callStatus = "idle",
  remoteUsername = "Alice",
  isScreenSharing = false,
  isScreenShareUpdating = false,
  callIssue = null,
  isIncomingActionPending = false,
  onAcceptCall = vi.fn(),
  onRejectCall = vi.fn(),
  onHangUp = vi.fn(),
  onCancelCall = vi.fn(),
  onMuteToggle = vi.fn(),
  callDirection,
  canCancelCall,
  canHangUpCall,
  onReturnToCall = vi.fn(),
  onOpenSettings = vi.fn(),
  isCollapsed = false,
  isMuted = false,
}: {
  callStatus?: CallStatus;
  remoteUsername?: string | null;
  isScreenSharing?: boolean;
  isScreenShareUpdating?: boolean;
  callIssue?: CallIssue | null;
  isIncomingActionPending?: boolean;
  onAcceptCall?: () => void;
  onRejectCall?: () => void;
  onHangUp?: () => void;
  onCancelCall?: () => void;
  onMuteToggle?: () => void;
  callDirection?: "incoming" | "outgoing" | null;
  canCancelCall?: boolean;
  canHangUpCall?: boolean;
  onReturnToCall?: () => void;
  onOpenSettings?: () => void;
  isCollapsed?: boolean;
  isMuted?: boolean;
} = {}) {
  return render(
    <SidebarFooter
      callStatus={callStatus}
      remoteUsername={remoteUsername}
      callSeconds={12}
      isMuted={isMuted}
      isScreenSharing={isScreenSharing}
      isScreenShareUpdating={isScreenShareUpdating}
      callIssue={callIssue}
      isIncomingActionPending={isIncomingActionPending}
      onMuteToggle={onMuteToggle}
      onHangUp={onHangUp}
      onCancelCall={onCancelCall}
      onAcceptCall={onAcceptCall}
      onRejectCall={onRejectCall}
      callDirection={callDirection}
      canCancelCall={canCancelCall}
      canHangUpCall={canHangUpCall}
      onOpenSettings={onOpenSettings}
      onReturnToCall={onReturnToCall}
      isCollapsed={isCollapsed}
    />,
  );
}

describe("SidebarFooter call UX", () => {
  beforeEach(() => {
    toggleMicMock.mockReset();
    toggleSoundMock.mockReset();
    useAppStoreMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        currentUser: { id: 1, username: "tester", display_name: "Tester", status: "online" },
        onlineUserIds: new Set([1]),
        userStatuses: {},
        micEnabled: true,
        soundEnabled: true,
        toggleMic: toggleMicMock,
        toggleSound: toggleSoundMock,
      }),
    );
  });

  it("shows Calling... during an outgoing call", () => {
    renderFooter({ callStatus: "calling" });

    expect(screen.getByText("Calling...")).toBeInTheDocument();
  });

  it("keeps outgoing ringing directional and uses cancel", () => {
    const onCancelCall = vi.fn();
    renderFooter({ callStatus: "calling", callDirection: "outgoing", canCancelCall: true, onCancelCall });

    expect(screen.getByText("Calling...")).toBeInTheDocument();
    expect(screen.getByText("Ringing Alice")).toBeInTheDocument();
    expect(screen.queryByText("INCOMING CALL")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Accept call")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Decline call")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Cancel call"));
    expect(onCancelCall).toHaveBeenCalledTimes(1);
  });

  it("renders incoming actions only with incoming direction and callbacks", () => {
    const onAcceptCall = vi.fn();
    const onRejectCall = vi.fn();
    renderFooter({ callStatus: "ringing", callDirection: "incoming", onAcceptCall, onRejectCall });

    expect(screen.getByText("Incoming call")).toBeInTheDocument();
    expect(screen.getByText("Alice is calling")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Accept call"));
    fireEvent.click(screen.getByTitle("Decline call"));
    expect(onAcceptCall).toHaveBeenCalledTimes(1);
    expect(onRejectCall).toHaveBeenCalledTimes(1);
  });

  it("shows Connected during an active call", () => {
    renderFooter({ callStatus: "active" });

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("renders the current user presence status in the footer", () => {
    renderFooter();

    expect(screen.getByRole("button", { name: "Open profile for Tester" })).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-footer-status")).toHaveTextContent("Online");
  });

  it("keeps the ordinary profile and settings footer visible without call runtime state", () => {
    renderFooter({ callStatus: "idle" });

    expect(screen.getByTestId("sidebar-footer-identity-row")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open profile for Tester" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open settings" })).toBeInTheDocument();
    expect(screen.queryByText("Calling...")).not.toBeInTheDocument();
  });

  it("renders the connected call block as a return-to-call navigation control", () => {
    const onReturnToCall = vi.fn();
    renderFooter({ callStatus: "active", onReturnToCall });

    const returnButton = screen.getByRole("button", {
      name: "Return to call with Alice",
    });

    expect(returnButton).toHaveClass("rounded-[12px]");
    fireEvent.click(returnButton);

    expect(onReturnToCall).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard activation for the connected call block", () => {
    const onReturnToCall = vi.fn();
    renderFooter({ callStatus: "active", onReturnToCall });

    const returnButton = screen.getByRole("button", {
      name: "Return to call with Alice",
    });

    fireEvent.keyDown(returnButton, { key: "Enter" });
    fireEvent.keyDown(returnButton, { key: " " });

    expect(onReturnToCall).toHaveBeenCalledTimes(2);
  });

  it("shows Updating screen share... while a screen-share transaction is in flight", () => {
    renderFooter({
      callStatus: "active",
      isScreenShareUpdating: true,
    });

    expect(screen.getByText("Updating screen share...")).toBeInTheDocument();
  });

  it("shows Call failed with a user-friendly message", () => {
    renderFooter({
      callStatus: "failed",
      callIssue: { tone: "error", message: "Microphone permission denied." },
    });

    expect(screen.getByText("Call failed")).toBeInTheDocument();
    expect(screen.getByText("Microphone access was denied.")).toBeInTheDocument();
  });

  it("disables Accept and Decline while an incoming action is pending", () => {
    const onAcceptCall = vi.fn();
    const onRejectCall = vi.fn();
    renderFooter({
      callStatus: "ringing",
      isIncomingActionPending: true,
      onAcceptCall,
      onRejectCall,
    });

    const accept = screen.getByTitle("Accept call");
    const decline = screen.getByTitle("Decline call");

    expect(accept).toBeDisabled();
    expect(decline).toBeDisabled();

    fireEvent.click(accept);
    fireEvent.click(decline);

    expect(onAcceptCall).not.toHaveBeenCalled();
    expect(onRejectCall).not.toHaveBeenCalled();
  });

  it("keeps hangup separate from return-to-call navigation", () => {
    const onHangUp = vi.fn();
    const onReturnToCall = vi.fn();
    renderFooter({ callStatus: "active", onHangUp, onReturnToCall });

    fireEvent.click(screen.getByTitle("Hang up"));
    fireEvent.click(screen.getByRole("button", { name: "confirm hang up" }));

    expect(onHangUp).toHaveBeenCalledTimes(1);
    expect(onReturnToCall).not.toHaveBeenCalled();
  });

  it("keeps the footer mute control separate from return-to-call navigation", () => {
    const onMuteToggle = vi.fn();
    const onReturnToCall = vi.fn();
    renderFooter({ callStatus: "active", onMuteToggle, onReturnToCall });

    fireEvent.click(screen.getByRole("button", { name: "Mute microphone" }));

    expect(toggleMicMock).toHaveBeenCalledTimes(1);
    expect(onMuteToggle).toHaveBeenCalledTimes(1);
    expect(onReturnToCall).not.toHaveBeenCalled();
  });

  it("keeps footer quick controls aligned as compact buttons", () => {
    renderFooter();

    expect(screen.getByRole("button", { name: "Mute microphone" })).toHaveClass("vt-icon-button--compact");
    expect(screen.getByRole("button", { name: "Mute sound" })).toHaveClass("vt-icon-button--compact");
    expect(screen.getByRole("button", { name: "Open settings" })).toHaveClass("vt-icon-button--compact");
  });

  it("keeps the profile identity as one accessible trigger and restores focus after closing", () => {
    renderFooter();

    const profileTrigger = screen.getByRole("button", { name: "Open profile for Tester" });
    profileTrigger.focus();
    fireEvent.click(profileTrigger);

    expect(screen.getByRole("dialog", { name: "Profile" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close profile" }));

    expect(profileTrigger).toHaveFocus();
  });

  it("uses state-specific microphone and sound labels", () => {
    useAppStoreMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        currentUser: { id: 1, username: "tester", display_name: "Tester", status: "online" },
        onlineUserIds: new Set([1]),
        userStatuses: {},
        micEnabled: false,
        soundEnabled: false,
        toggleMic: toggleMicMock,
        toggleSound: toggleSoundMock,
      }),
    );

    renderFooter({ callStatus: "active", isMuted: true });

    expect(screen.getByRole("button", { name: "Unmute microphone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore call audio output" })).toBeInTheDocument();
  });

  it("keeps settings wired to the existing handler", () => {
    const onOpenSettings = vi.fn();
    renderFooter({ onOpenSettings });

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("retains all routine controls while collapsed without identity text", () => {
    renderFooter({ isCollapsed: true });

    expect(screen.getByRole("button", { name: "Open profile for Tester" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute microphone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute sound" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open settings" })).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-footer-status")).not.toBeInTheDocument();
  });

  it("removes the nested identity card treatment", () => {
    const identityRow = renderFooter().getByTestId("sidebar-footer-identity-row");

    expect(identityRow).not.toHaveClass("border");
    expect(identityRow).not.toHaveClass("bg-card/90");
  });
});
