import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const { useAppStoreMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));

vi.mock("@/features/profile/components/ProfileModal/ProfileModal", () => ({
  ProfileModal: () => null,
}));

vi.mock("@/shared/components/ConfirmModal/ConfirmModal", () => ({
  ConfirmModal: () => null,
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
}: {
  callStatus?: CallStatus;
  remoteUsername?: string | null;
  isScreenSharing?: boolean;
  isScreenShareUpdating?: boolean;
  callIssue?: CallIssue | null;
  isIncomingActionPending?: boolean;
  onAcceptCall?: () => void;
  onRejectCall?: () => void;
} = {}) {
  return render(
    <SidebarFooter
      callStatus={callStatus}
      remoteUsername={remoteUsername}
      callSeconds={12}
      isMuted={false}
      isScreenSharing={isScreenSharing}
      isScreenShareUpdating={isScreenShareUpdating}
      callIssue={callIssue}
      isIncomingActionPending={isIncomingActionPending}
      onMuteToggle={vi.fn()}
      onHangUp={vi.fn()}
      onAcceptCall={onAcceptCall}
      onRejectCall={onRejectCall}
      onOpenSettings={vi.fn()}
    />,
  );
}

describe("SidebarFooter call UX", () => {
  beforeEach(() => {
    useAppStoreMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        currentUser: { id: 1, username: "tester", display_name: "Tester", status: "online" },
        onlineUserIds: new Set([1]),
        userStatuses: {},
        micEnabled: true,
        soundEnabled: true,
        toggleMic: vi.fn(),
        toggleSound: vi.fn(),
      }),
    );
  });

  it("shows Calling... during an outgoing call", () => {
    renderFooter({ callStatus: "calling" });

    expect(screen.getByText("Calling...")).toBeInTheDocument();
  });

  it("shows Connected during an active call", () => {
    renderFooter({ callStatus: "active" });

    expect(screen.getByText("Connected")).toBeInTheDocument();
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
    expect(screen.getByText("Microphone permission denied.")).toBeInTheDocument();
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
});
