import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusStreamView, FullscreenStreamView } from "./FocusStreamView";

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: { outputVolume: number; setOutputVolume: () => void }) => unknown) =>
    selector({ outputVolume: 1, setOutputVolume: vi.fn() }),
}));

const baseProps = {
  stream: {} as MediaStream,
  streamId: "share-1",
  sharerName: "Alice",
  isLocalSharer: false,
  participants: [{ id: "alice", name: "Alice", label: "Alice" }],
  muted: false,
  effectiveMuted: true,
  deafened: true,
  canToggleMute: true,
  canToggleDeafen: true,
  isScreenSharing: false,
  isScreenShareUpdating: false,
  onExitFocus: vi.fn(),
  onMuteToggle: vi.fn(),
  onDeafenToggle: vi.fn(),
  onStartScreenShare: vi.fn().mockResolvedValue(undefined),
  onStopScreenShare: vi.fn(),
  onHangUp: vi.fn(),
  onEnterFullscreen: vi.fn(),
};

describe("FocusStreamView audio controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  it("uses effective mute and invokes only the deafen action", () => {
    render(<FocusStreamView {...baseProps} />);

    const microphone = screen.getByRole("button", { name: "Microphone muted while deafened" });
    const deafen = screen.getByRole("button", { name: "Undeafen" });
    expect(microphone).toHaveAttribute("aria-pressed", "true");
    expect(deafen).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(deafen);
    expect(baseProps.onDeafenToggle).toHaveBeenCalledTimes(1);
    expect(baseProps.onMuteToggle).not.toHaveBeenCalled();
  });

  it("uses the same effective mute and deafen contract in fullscreen", () => {
    render(
      <FullscreenStreamView
        {...baseProps}
        onExitTrueFullscreen={vi.fn()}
      />,
    );

    const microphone = screen.getByRole("button", { name: "Microphone muted while deafened" });
    const deafen = screen.getByRole("button", { name: "Undeafen" });
    expect(microphone).toHaveAttribute("aria-pressed", "true");
    expect(deafen).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(deafen);
    expect(baseProps.onDeafenToggle).toHaveBeenCalledTimes(1);
    expect(baseProps.onMuteToggle).not.toHaveBeenCalled();
  });
});
