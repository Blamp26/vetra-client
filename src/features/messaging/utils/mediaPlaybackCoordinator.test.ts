import { describe, expect, it, vi } from "vitest";
import { claimMediaAudio, releaseMediaAudio } from "./mediaPlaybackCoordinator";

describe("media playback coordinator", () => {
  it("keeps voice and audio playback mutually exclusive", () => {
    const first = document.createElement("audio");
    const second = document.createElement("audio");
    const firstPause = vi.spyOn(first, "pause").mockImplementation(() => {});

    claimMediaAudio(first);
    claimMediaAudio(second);
    expect(firstPause).toHaveBeenCalledTimes(1);

    releaseMediaAudio(second);
    claimMediaAudio(first);
    expect(firstPause).toHaveBeenCalledTimes(1);
  });
});
