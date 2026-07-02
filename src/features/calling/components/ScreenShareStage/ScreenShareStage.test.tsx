import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenShareStage } from "./ScreenShareStage";

function makeStream(id: string): MediaStream {
  return { id } as MediaStream;
}

function renderStage(overrides: Partial<ComponentProps<typeof ScreenShareStage>> = {}) {
  const props: ComponentProps<typeof ScreenShareStage> = {
    remoteScreenStream: null,
    localScreenStream: null,
    isRemoteScreenLoading: false,
    isScreenShareUpdating: false,
    remoteUsername: "Alice",
    ...overrides,
  };

  return {
    props,
    ...render(<ScreenShareStage {...props} />),
  };
}

describe("ScreenShareStage", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  });

  it("renders the remote screen stream as the main contained video", () => {
    const stream = makeStream("remote-screen");

    renderStage({ remoteScreenStream: stream });

    const video = screen.getByTestId("remote-screen-view") as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    expect(video).toHaveClass("object-contain");
    expect(video.srcObject).toBe(stream);
    expect(screen.getByTestId("screen-share-owner")).toHaveTextContent("Alice is sharing");
  });

  it("renders the local stream as the main stage when no remote stream exists", () => {
    const stream = makeStream("local-screen");

    renderStage({ localScreenStream: stream });

    const video = screen.getByTestId("local-screen-view") as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    expect(video).toHaveClass("object-contain");
    expect(video.muted).toBe(true);
    expect(video.srcObject).toBe(stream);
    expect(screen.getByTestId("screen-share-owner")).toHaveTextContent("You are sharing");
  });

  it("shows a local preview when a remote stream is the main stage and local sharing is active", () => {
    const remoteStream = makeStream("remote-screen");
    const localStream = makeStream("local-screen");

    renderStage({
      remoteScreenStream: remoteStream,
      localScreenStream: localStream,
    });

    expect((screen.getByTestId("remote-screen-view") as HTMLVideoElement).srcObject).toBe(remoteStream);
    expect((screen.getByTestId("local-screen-preview") as HTMLVideoElement).srcObject).toBe(localStream);
  });

  it("shows updating and loading states without removing controls responsibility from the dock", () => {
    renderStage({ isRemoteScreenLoading: true, isScreenShareUpdating: true });

    expect(screen.getByTestId("remote-screen-loading")).toHaveTextContent("Waiting for shared screen");
    expect(screen.getByTestId("screen-share-updating-overlay")).toHaveTextContent("Updating screen share...");
  });

  it("clears srcObject when sharing stops", () => {
    const stream = makeStream("remote-screen");
    const { rerender } = renderStage({ remoteScreenStream: stream });
    const video = screen.getByTestId("remote-screen-view") as HTMLVideoElement;

    rerender(
      <ScreenShareStage
        remoteUsername="Alice"
        remoteScreenStream={null}
        localScreenStream={null}
        isRemoteScreenLoading={false}
        isScreenShareUpdating={false}
      />,
    );

    expect(video.srcObject).toBeNull();
    expect(screen.queryByTestId("remote-screen-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("screen-share-missing")).toBeInTheDocument();
  });

  it("does not leave a stale video element across repeated share and stop cycles", () => {
    const firstStream = makeStream("first-screen");
    const secondStream = makeStream("second-screen");
    const { rerender } = renderStage({ remoteScreenStream: firstStream });
    const firstVideo = screen.getByTestId("remote-screen-view") as HTMLVideoElement;

    rerender(
      <ScreenShareStage
        remoteUsername="Alice"
        remoteScreenStream={null}
        localScreenStream={null}
        isRemoteScreenLoading={false}
        isScreenShareUpdating={false}
      />,
    );
    rerender(
      <ScreenShareStage
        remoteUsername="Alice"
        remoteScreenStream={secondStream}
        localScreenStream={null}
        isRemoteScreenLoading={false}
        isScreenShareUpdating={false}
      />,
    );

    const secondVideo = screen.getByTestId("remote-screen-view") as HTMLVideoElement;
    expect(firstVideo.srcObject).toBeNull();
    expect(secondVideo.srcObject).toBe(secondStream);
  });

  it("hides the loading overlay once the video can play", () => {
    renderStage({ remoteScreenStream: makeStream("remote-screen") });

    expect(screen.getByTestId("screen-share-video-loading")).toBeInTheDocument();
    fireEvent.loadedData(screen.getByTestId("remote-screen-view"));
    expect(screen.queryByTestId("screen-share-video-loading")).not.toBeInTheDocument();
  });
});
