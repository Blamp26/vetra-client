import type { StateCreator } from "zustand";

export interface AudioSlice {
  micEnabled: boolean;
  soundEnabled: boolean;
  micCascaded: boolean;
  lastVoluntaryMic: boolean;
  
  // Device Selection
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  availableInputDevices: MediaDeviceInfo[];
  availableOutputDevices: MediaDeviceInfo[];

  toggleMic: () => void;
  toggleSound: () => void;
  setInputDevice: (deviceId: string) => void;
  setOutputDevice: (deviceId: string) => void;
  refreshDevices: () => Promise<void>;
}

const CASCADE_TOAST_KEY = "vetra_cascade_toast_shown";

export const createAudioSlice: StateCreator<any, [], [], AudioSlice> = (set, get) => ({
  micEnabled: true,
  soundEnabled: true,
  micCascaded: false,
  lastVoluntaryMic: true,
  
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  availableInputDevices: [],
  availableOutputDevices: [],

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

  setInputDevice: (deviceId: string) => set({ selectedInputDeviceId: deviceId }),
  setOutputDevice: (deviceId: string) => set({ selectedOutputDeviceId: deviceId }),

  refreshDevices: async () => {
    try {
      // Request permission if not already granted to get labels
      // We don't store the stream here, just use it to unlock labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      
      set({ 
        availableInputDevices: inputs,
        availableOutputDevices: outputs 
      });
    } catch (err) {
      console.error("Failed to enumerate audio devices:", err);
    }
  },
});
