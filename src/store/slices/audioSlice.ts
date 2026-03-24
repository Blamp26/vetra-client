import type { StateCreator } from "zustand";

export interface AudioSlice {
  micEnabled: boolean;
  soundEnabled: boolean;
  micCascaded: boolean;
  lastVoluntaryMic: boolean;

  toggleMic: () => void;
  toggleSound: () => void;
}

const CASCADE_TOAST_KEY = "vetra_cascade_toast_shown";

export const createAudioSlice: StateCreator<any, [], [], AudioSlice> = (set, get) => ({
  micEnabled: true,
  soundEnabled: true,
  micCascaded: false,
  lastVoluntaryMic: true,

  toggleMic: () => {
    const { micEnabled, soundEnabled, micCascaded, socketManager } = get();
    // Cascade rule: mic cannot be toggled while sound is off.
    if (!soundEnabled || micCascaded) return;

    const next = !micEnabled;
    set({ micEnabled: next, lastVoluntaryMic: next });

    socketManager?.userChannel?.push(next ? "audio:unmute" : "audio:mute", {
      mic_enabled: next,
      sound_enabled: soundEnabled,
    });
  },

  toggleSound: () => {
    const { soundEnabled, micEnabled, lastVoluntaryMic, socketManager } = get();

    if (soundEnabled) {
      // Turning sound OFF cascades mic OFF and stores the user's last
      // voluntary mic choice so we can restore intent later.
      set({
        soundEnabled: false,
        micEnabled: false,
        micCascaded: true,
        lastVoluntaryMic: micEnabled,
      });

      socketManager?.userChannel?.push("audio:deafen", {
        mic_enabled: false,
        sound_enabled: false,
      });

      try {
        const shown = localStorage.getItem(CASCADE_TOAST_KEY);
        if (!shown) {
          localStorage.setItem(CASCADE_TOAST_KEY, "1");
          window.dispatchEvent(
            new CustomEvent("vetra:toast", {
              detail: {
                title: "Microphone muted",
                body: "Sound was disabled, so your mic was also muted. Re-enable sound to unmute.",
                durationMs: 4000,
              },
            })
          );
        }
      } catch {
        // ignore storage errors
      }
    } else {
      // Turning sound back ON restores the last voluntary mic state.
      // This is not auto-unmute from a UX perspective because restoration is
      // driven by remembered user intent, not by forcing mic=true.
      set({
        soundEnabled: true,
        micEnabled: lastVoluntaryMic,
        micCascaded: false,
      });

      socketManager?.userChannel?.push("audio:undeafen", {
        mic_enabled: lastVoluntaryMic,
        sound_enabled: true,
      });
    }
  },
});

