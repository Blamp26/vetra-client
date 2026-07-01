import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ActiveCallDock } from "./ActiveCallDock";

function renderDock(overrides: Partial<ComponentProps<typeof ActiveCallDock>> = {}) {
  const props: ComponentProps<typeof ActiveCallDock> = {
    remoteUsername: "Alice",
    seconds: 65,
    isMuted: false,
    isScreenSharing: false,
    isScreenShareUpdating: false,
    isRemoteScreenLoading: false,
    callIssue: null,
    remoteScreenStream: null,
    localScreenStream: null,
    diagnostics: {
      connectionState: "connected",
      iceConnectionState: "connected",
      iceGatheringState: "complete",
      signalingState: "stable",
      selectedLocalCandidateType: "host",
    },
    onMuteToggle: vi.fn(),
    onStartScreenShare: vi.fn(),
    onStopScreenShare: vi.fn(),
    onHangUp: vi.fn(),
    ...overrides,
  };

  render(<ActiveCallDock {...props} />);
  return props;
}

describe("ActiveCallDock", () => {
  it("renders a docked active call panel with status and controls", () => {
    renderDock();

    expect(screen.getByTestId("active-call-dock")).toBeInTheDocument();
    expect(screen.getByText("Voice call")).toBeInTheDocument();
    expect(screen.getAllByText("Alice")).toHaveLength(2);
    expect(screen.getByTestId("active-call-dock-status")).toHaveTextContent("Connected");
    expect(screen.getByTestId("active-call-dock-controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share screen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hang Up" })).toBeInTheDocument();
  });

  it("disables the screen-share control while an update is in flight", () => {
    renderDock({ isScreenShareUpdating: true });

    expect(
      screen.getByRole("button", { name: "Updating screen share" }),
    ).toBeDisabled();
    expect(screen.getByTestId("active-call-dock-status")).toHaveTextContent(
      "Updating screen share...",
    );
  });

  it("calls the existing hangup action from the dock controls", () => {
    const onHangUp = vi.fn();
    renderDock({ onHangUp });

    fireEvent.click(screen.getByRole("button", { name: "Hang Up" }));

    expect(onHangUp).toHaveBeenCalledTimes(1);
  });
});
