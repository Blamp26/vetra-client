import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WatchStreamModal } from "./WatchStreamModal";

function makeStream(id: string): MediaStream {
  return { id } as MediaStream;
}

function renderModal(overrides: Partial<ComponentProps<typeof WatchStreamModal>> = {}) {
  const props: ComponentProps<typeof WatchStreamModal> = {
    stream: makeStream("screen"),
    sharerName: "Alice",
    isLocalSharer: false,
    remoteUsername: "Alice",
    isMuted: false,
    isScreenShareUpdating: false,
    onClose: vi.fn(),
    onStopScreenShare: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...render(<WatchStreamModal {...props} />),
  };
}

describe("WatchStreamModal", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  });

  it("renders the dark watch surface with a contained video", () => {
    const stream = makeStream("remote-screen");
    renderModal({ stream });

    const video = screen.getByTestId("watch-stream-video") as HTMLVideoElement;
    expect(screen.getByTestId("watch-stream-modal")).toBeInTheDocument();
    expect(screen.getByTestId("watch-stream-surface")).toHaveClass("bg-[#1e1f22]");
    expect(screen.getByTestId("watch-stream-stage")).toHaveClass("bg-black");
    expect(video).toHaveClass("object-contain");
    expect(video.srcObject).toBe(stream);
  });

  it("renders the participant strip", () => {
    renderModal();

    expect(screen.getByTestId("watch-stream-participants")).toHaveTextContent("You");
    expect(screen.getByTestId("watch-stream-participants")).toHaveTextContent("Alice");
  });

  it("close button closes only the modal", () => {
    const onClose = vi.fn();
    const onStopScreenShare = vi.fn();
    renderModal({ onClose, onStopScreenShare });

    fireEvent.click(screen.getByRole("button", { name: "Close stream" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStopScreenShare).not.toHaveBeenCalled();
  });

  it("clears srcObject on unmount and stream changes", () => {
    const firstStream = makeStream("first-screen");
    const secondStream = makeStream("second-screen");
    const { rerender, unmount } = renderModal({ stream: firstStream });
    const firstVideo = screen.getByTestId("watch-stream-video") as HTMLVideoElement;

    rerender(
      <WatchStreamModal
        stream={secondStream}
        sharerName="Alice"
        isLocalSharer={false}
        remoteUsername="Alice"
        isMuted={false}
        isScreenShareUpdating={false}
        onClose={vi.fn()}
        onStopScreenShare={vi.fn()}
      />,
    );

    expect(firstVideo.srcObject).toBe(secondStream);
    unmount();
    expect(firstVideo.srcObject).toBeNull();
  });

  it("shows Stop sharing only for the local sharer", () => {
    const { rerender } = renderModal({ isLocalSharer: false });

    expect(screen.queryByRole("button", { name: "Stop sharing" })).not.toBeInTheDocument();

    rerender(
      <WatchStreamModal
        stream={makeStream("local-screen")}
        sharerName="You"
        isLocalSharer
        remoteUsername="Alice"
        isMuted={false}
        isScreenShareUpdating={false}
        onClose={vi.fn()}
        onStopScreenShare={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Stop sharing" })).toBeInTheDocument();
  });

  it("local Stop sharing calls only the stop share action", () => {
    const onClose = vi.fn();
    const onStopScreenShare = vi.fn();
    renderModal({ isLocalSharer: true, onClose, onStopScreenShare });

    fireEvent.click(screen.getByRole("button", { name: "Stop sharing" }));

    expect(onStopScreenShare).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
