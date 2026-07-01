import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { CallSurface } from "./CallSurface";

function renderSurface(overrides: Partial<ComponentProps<typeof CallSurface>> = {}) {
  const props: ComponentProps<typeof CallSurface> = {
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

  render(<CallSurface {...props} />);
  return props;
}

describe("CallSurface", () => {
  it("renders a large active call shell with status and controls", () => {
    renderSurface();

    expect(screen.getByTestId("call-surface")).toBeInTheDocument();
    expect(screen.getByText("Voice call")).toBeInTheDocument();
    expect(screen.getAllByText("Alice")).toHaveLength(2);
    expect(screen.getByTestId("call-surface-status")).toHaveTextContent("Connected");
    expect(screen.getByTestId("call-surface-controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share screen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hang Up" })).toBeInTheDocument();
  });

  it("disables the screen-share control while an update is in flight", () => {
    renderSurface({ isScreenShareUpdating: true });

    expect(
      screen.getByRole("button", { name: "Updating screen share" }),
    ).toBeDisabled();
    expect(screen.getByTestId("call-surface-status")).toHaveTextContent(
      "Updating screen share...",
    );
  });

  it("calls the existing hangup action from the bottom controls", () => {
    const onHangUp = vi.fn();
    renderSurface({ onHangUp });

    fireEvent.click(screen.getByRole("button", { name: "Hang Up" }));

    expect(onHangUp).toHaveBeenCalledTimes(1);
  });
});
