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
    expect(screen.getByTestId("active-call-dock-stage")).toBeInTheDocument();
    expect(screen.getAllByTestId("active-call-participant-tile")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share screen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hang Up" })).toBeInTheDocument();
  });

  it("keeps controls inside the dock overlay rather than in a sibling strip", () => {
    renderDock();

    const dock = screen.getByTestId("active-call-dock");
    const controls = screen.getByTestId("active-call-dock-controls");
    const stage = screen.getByTestId("active-call-dock-stage");

    expect(dock).toContainElement(controls);
    expect(dock).toContainElement(stage);
    expect(controls.parentElement).toBe(dock);
    expect(controls).toHaveClass("absolute");
    expect(controls).not.toHaveClass("bg-card/50");
    expect(dock.className).not.toMatch(/gradient|backdrop|shadow/);
    expect(controls.className).not.toMatch(/backdrop|shadow/);
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
