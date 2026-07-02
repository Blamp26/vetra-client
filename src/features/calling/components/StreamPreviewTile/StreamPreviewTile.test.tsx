import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StreamPreviewTile } from "./StreamPreviewTile";

function makeStream(id: string): MediaStream {
  return { id } as MediaStream;
}

describe("StreamPreviewTile", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  });

  it("renders a dark preview placeholder with sharer label and Watch button", () => {
    render(
      <StreamPreviewTile
        stream={makeStream("screen")}
        sharerName="Alice"
        isLocalSharer={false}
        onWatch={vi.fn()}
      />,
    );

    expect(screen.getByTestId("stream-preview-tile")).toBeInTheDocument();
    expect(screen.getByTestId("stream-preview-area")).toHaveClass("bg-zinc-950");
    expect(screen.getByTestId("stream-preview-label")).toHaveTextContent(
      "Alice is sharing their screen",
    );
    expect(screen.getByRole("button", { name: "Watch" })).toBeInTheDocument();
  });

  it("renders local sharing copy", () => {
    render(
      <StreamPreviewTile
        stream={makeStream("screen")}
        sharerName="You"
        isLocalSharer
        onWatch={vi.fn()}
      />,
    );

    expect(screen.getByTestId("stream-preview-label")).toHaveTextContent(
      "You are sharing your screen",
    );
  });

  it("calls onWatch", () => {
    const onWatch = vi.fn();
    render(
      <StreamPreviewTile
        stream={makeStream("screen")}
        sharerName="Alice"
        isLocalSharer={false}
        onWatch={onWatch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    expect(onWatch).toHaveBeenCalledTimes(1);
  });

  it("cleans up preview video when preview attachment is enabled", () => {
    const firstStream = makeStream("first");
    const secondStream = makeStream("second");
    const { rerender, unmount } = render(
      <StreamPreviewTile
        stream={firstStream}
        sharerName="Alice"
        isLocalSharer={false}
        onWatch={vi.fn()}
        attachPreviewVideo
      />,
    );
    const video = screen.getByTestId("stream-preview-video") as HTMLVideoElement;

    expect(video.srcObject).toBe(firstStream);
    rerender(
      <StreamPreviewTile
        stream={secondStream}
        sharerName="Alice"
        isLocalSharer={false}
        onWatch={vi.fn()}
        attachPreviewVideo
      />,
    );
    expect(video.srcObject).toBe(secondStream);
    unmount();
    expect(video.srcObject).toBeNull();
  });
});
