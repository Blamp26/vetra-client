import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const storeState = vi.hoisted(() => ({
  soundEnabled: true,
  outputVolume: 1,
  callUserVolumes: {} as Record<string, number>,
  mutedCallUserIds: {} as Record<string, boolean>,
  mediaPreferences: { inputDeviceId: "default", outputDeviceId: "speakers-1" },
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock("@/shared/utils/mediaSettings", () => ({
  useMediaSettings: () => ({ preferences: storeState.mediaPreferences, hydrated: true }),
}));

import { PersistentRemoteAudioRenderer } from "./PersistentRemoteAudioRenderer";

describe("PersistentRemoteAudioRenderer output routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    storeState.mediaPreferences.outputDeviceId = "speakers-1";
    storeState.soundEnabled = true;
    storeState.outputVolume = 1;
    storeState.callUserVolumes = {};
    storeState.mutedCallUserIds = {};
    const mediaPrototype = HTMLMediaElement.prototype as { setSinkId?: unknown };
    delete mediaPrototype.setSinkId;
  });

  it("routes remote audio to the selected output and updates when it changes", async () => {
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { configurable: true, value: setSinkId });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const stream = {} as MediaStream;
    const { rerender } = render(<PersistentRemoteAudioRenderer stream={stream} />);
    const audio = () => screen.getByTestId("persistent-remote-audio") as HTMLAudioElement;
    await waitFor(() => expect(setSinkId).toHaveBeenCalledWith("speakers-1"));
    expect(audio().srcObject).toBe(stream);

    storeState.mediaPreferences.outputDeviceId = "default";
    rerender(<PersistentRemoteAudioRenderer stream={stream} />);
    await waitFor(() => expect(setSinkId).toHaveBeenCalledWith("default"));
    expect(audio().srcObject).toBe(stream);
  });

  it("reports a missing selected output and retries default once", async () => {
    const setSinkId = vi.fn()
      .mockRejectedValueOnce(new DOMException("The object can not be found here", "NotFoundError"))
      .mockResolvedValue(undefined);
    const onOutputDeviceFallback = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { configurable: true, value: setSinkId });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const stream = {} as MediaStream;
    render(
      <PersistentRemoteAudioRenderer
        stream={stream}
        onOutputDeviceFallback={onOutputDeviceFallback}
      />,
    );

    await waitFor(() => expect(onOutputDeviceFallback).toHaveBeenCalledWith("speakers-1"));
    expect((screen.getByTestId("persistent-remote-audio") as HTMLAudioElement).srcObject).toBe(stream);
    expect(onOutputDeviceFallback).toHaveBeenCalledTimes(1);
    expect(setSinkId).toHaveBeenNthCalledWith(1, "speakers-1");
    expect(setSinkId).toHaveBeenNthCalledWith(2, "default");
  });

  it("does not retry default for a second failure of the same selected device", async () => {
    const setSinkId = vi.fn().mockRejectedValue(new DOMException("not found", "NotFoundError"));
    const onOutputDeviceFallback = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { configurable: true, value: setSinkId });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(
      <PersistentRemoteAudioRenderer
        stream={{} as MediaStream}
        onOutputDeviceFallback={onOutputDeviceFallback}
      />,
    );

    await waitFor(() => expect(setSinkId).toHaveBeenCalledTimes(2));
    expect(onOutputDeviceFallback).not.toHaveBeenCalled();
    expect(setSinkId).toHaveBeenCalledTimes(2);
  });

  it("detaches the old stream on replacement and on unmount", async () => {
    const firstStream = {} as MediaStream;
    const secondStream = {} as MediaStream;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { rerender, unmount } = render(<PersistentRemoteAudioRenderer stream={firstStream} />);
    const audio = () => screen.getByTestId("persistent-remote-audio") as HTMLAudioElement;

    await waitFor(() => expect(audio().srcObject).toBe(firstStream));
    const element = audio();
    rerender(<PersistentRemoteAudioRenderer stream={secondStream} />);
    await waitFor(() => expect(audio().srcObject).toBe(secondStream));
    unmount();
    expect(element.srcObject).toBeNull();
  });

  it("does not loop when the default fallback also fails", async () => {
    const setSinkId = vi.fn()
      .mockRejectedValue(new DOMException("not found", "NotFoundError"));
    const onOutputDeviceFallback = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { configurable: true, value: setSinkId });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(
      <PersistentRemoteAudioRenderer
        stream={{} as MediaStream}
        onOutputDeviceFallback={onOutputDeviceFallback}
      />,
    );

    await waitFor(() => expect(setSinkId).toHaveBeenCalledTimes(2));
    expect(onOutputDeviceFallback).not.toHaveBeenCalled();
    await waitFor(() => expect(setSinkId).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setSinkId).toHaveBeenCalledTimes(2);
  });

  it("keeps default and security failures diagnostics-only", async () => {
    const setSinkId = vi.fn().mockRejectedValue(new DOMException("The operation is insecure", "SecurityError"));
    const onOutputDeviceFallback = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { configurable: true, value: setSinkId });

    render(
      <PersistentRemoteAudioRenderer
        stream={{} as MediaStream}
        onOutputDeviceFallback={onOutputDeviceFallback}
      />,
    );

    await waitFor(() => expect(setSinkId).toHaveBeenCalled());
    expect(onOutputDeviceFallback).not.toHaveBeenCalled();
  });

  it("continues using system-default playback when output routing is unsupported", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<PersistentRemoteAudioRenderer stream={{} as MediaStream} />);

    await waitFor(() => expect(play).toHaveBeenCalled());
  });

  it("uses default peer preferences and the global output volume", async () => {
    storeState.outputVolume = 0.72;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<PersistentRemoteAudioRenderer stream={{} as MediaStream} peerAudioPreferenceKey="string:peer-a" />);

    await waitFor(() => {
      const audio = screen.getByTestId("persistent-remote-audio") as HTMLAudioElement;
      expect(audio.volume).toBeCloseTo(0.72);
      expect(audio.muted).toBe(false);
    });
  });

  it.each([
    [35, 1, 0.35],
    [50, 0.6, 0.3],
  ])("applies peer volume %s with global volume %s", async (peerVolume, globalVolume, expected) => {
    storeState.outputVolume = globalVolume;
    storeState.callUserVolumes["string:peer-a"] = peerVolume;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<PersistentRemoteAudioRenderer stream={{} as MediaStream} peerAudioPreferenceKey="string:peer-a" />);

    await waitFor(() => expect((screen.getByTestId("persistent-remote-audio") as HTMLAudioElement).volume).toBeCloseTo(expected));
  });

  it("mutes and unmutes the selected peer without detaching the stream or replaying", async () => {
    const stream = {} as MediaStream;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    storeState.callUserVolumes["string:peer-a"] = 35;
    const { rerender } = render(<PersistentRemoteAudioRenderer stream={stream} peerAudioPreferenceKey="string:peer-a" />);
    const audio = () => screen.getByTestId("persistent-remote-audio") as HTMLAudioElement;
    await waitFor(() => expect(audio().volume).toBeCloseTo(0.35));
    expect(audio().srcObject).toBe(stream);
    expect(play).toHaveBeenCalledTimes(1);

    storeState.mutedCallUserIds["string:peer-a"] = true;
    rerender(<PersistentRemoteAudioRenderer stream={stream} peerAudioPreferenceKey="string:peer-a" />);
    await waitFor(() => {
      expect(audio().volume).toBe(0);
      expect(audio().muted).toBe(true);
    });
    expect(audio().srcObject).toBe(stream);
    expect(play).toHaveBeenCalledTimes(1);

    delete storeState.mutedCallUserIds["string:peer-a"];
    rerender(<PersistentRemoteAudioRenderer stream={stream} peerAudioPreferenceKey="string:peer-a" />);
    await waitFor(() => expect(audio().volume).toBeCloseTo(0.35));
    expect(audio().muted).toBe(false);
    expect(audio().srcObject).toBe(stream);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("silences volume zero and call-local deafen", async () => {
    storeState.callUserVolumes["string:peer-a"] = 0;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { rerender } = render(<PersistentRemoteAudioRenderer stream={{} as MediaStream} peerAudioPreferenceKey="string:peer-a" />);
    const audio = () => screen.getByTestId("persistent-remote-audio") as HTMLAudioElement;
    await waitFor(() => {
      expect(audio().volume).toBe(0);
      expect(audio().muted).toBe(true);
    });

    storeState.callUserVolumes["string:peer-a"] = 100;
    rerender(<PersistentRemoteAudioRenderer stream={{} as MediaStream} peerAudioPreferenceKey="string:peer-a" deafened />);
    await waitFor(() => {
      expect(audio().volume).toBe(1);
      expect(audio().muted).toBe(true);
    });
  });

  it("uses the serialized peer key and does not share preferences across call rollover", async () => {
    storeState.callUserVolumes["string:peer-a"] = 25;
    storeState.callUserVolumes["string:peer-b"] = 80;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { rerender } = render(<PersistentRemoteAudioRenderer stream={{} as MediaStream} peerAudioPreferenceKey="string:peer-a" />);
    const audio = () => screen.getByTestId("persistent-remote-audio") as HTMLAudioElement;
    await waitFor(() => expect(audio().volume).toBeCloseTo(0.25));

    rerender(<PersistentRemoteAudioRenderer stream={{} as MediaStream} peerAudioPreferenceKey="string:peer-b" />);
    await waitFor(() => expect(audio().volume).toBeCloseTo(0.8));
  });

  it("keeps current and newly arriving streams attached while deafened", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const firstStream = {} as MediaStream;
    const secondStream = {} as MediaStream;
    const { rerender } = render(<PersistentRemoteAudioRenderer stream={firstStream} deafened />);
    const audio = () => screen.getByTestId("persistent-remote-audio") as HTMLAudioElement;
    await waitFor(() => expect(audio().srcObject).toBe(firstStream));
    expect(audio().muted).toBe(true);

    rerender(<PersistentRemoteAudioRenderer stream={secondStream} deafened />);
    await waitFor(() => expect(audio().srcObject).toBe(secondStream));
    expect(audio().muted).toBe(true);
  });

  it("falls back to an unmuted full peer volume when the key is unavailable", async () => {
    storeState.outputVolume = 0.6;
    storeState.soundEnabled = true;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<PersistentRemoteAudioRenderer stream={{} as MediaStream} />);

    await waitFor(() => {
      const audio = screen.getByTestId("persistent-remote-audio") as HTMLAudioElement;
      expect(audio.volume).toBeCloseTo(0.6);
      expect(audio.muted).toBe(false);
    });
  });
});
