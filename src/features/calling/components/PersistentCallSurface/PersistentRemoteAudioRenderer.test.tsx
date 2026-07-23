import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { selectedOutputDeviceId } = vi.hoisted(() => ({ selectedOutputDeviceId: { value: "speakers-1" } }));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: { selectedOutputDeviceId: string }) => unknown) =>
    selector({ selectedOutputDeviceId: selectedOutputDeviceId.value }),
}));

import { PersistentRemoteAudioRenderer } from "./PersistentRemoteAudioRenderer";

describe("PersistentRemoteAudioRenderer output routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    const mediaPrototype = HTMLMediaElement.prototype as { setSinkId?: unknown };
    delete mediaPrototype.setSinkId;
  });

  it("routes remote audio to the selected output and updates when it changes", async () => {
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { configurable: true, value: setSinkId });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const { rerender } = render(<PersistentRemoteAudioRenderer stream={{} as MediaStream} />);
    await waitFor(() => expect(setSinkId).toHaveBeenCalledWith("speakers-1"));

    selectedOutputDeviceId.value = "default";
    rerender(<PersistentRemoteAudioRenderer stream={{} as MediaStream} />);
    await waitFor(() => expect(setSinkId).toHaveBeenCalledWith("default"));
  });

  it("continues using system-default playback when output routing is unsupported", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<PersistentRemoteAudioRenderer stream={{} as MediaStream} />);

    await waitFor(() => expect(play).toHaveBeenCalled());
  });
});
