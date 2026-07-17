import type { StateCreator } from "zustand";
import { storage } from "@/shared/utils/storage";

export interface AudioSlice {
  micEnabled: boolean;
  soundEnabled: boolean;
  micCascaded: boolean;
  lastVoluntaryMic: boolean;
  outputVolume: number;
  callUserVolumes: Record<string, number>;
  mutedCallUserIds: Record<string, true>;
  
  // Device Selection
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  availableInputDevices: MediaDeviceInfo[];
  availableOutputDevices: MediaDeviceInfo[];

  toggleMic: () => void;
  toggleSound: () => void;
  setOutputVolume: (volume: number) => void;
  setCallUserVolume: (userKey: string, volume: number) => void;
  setCallUserMuted: (userKey: string, muted: boolean) => void;
  setInputDevice: (deviceId: string) => void;
  setOutputDevice: (deviceId: string) => void;
  setNoiseSuppression: (enabled: boolean) => void;
  setEchoCancellation: (enabled: boolean) => void;
  setAutoGainControl: (enabled: boolean) => void;
  refreshDevices: (options?: {
    requestPermission?: boolean;
  }) => Promise<{
    permissionState: "granted" | "denied" | "not-requested" | "unavailable";
    labelsAvailable: boolean;
    inputCount: number;
    outputCount: number;
  }>;
}

const CASCADE_TOAST_KEY = "vetra_cascade_toast_shown";

export const createAudioSlice: StateCreator<any, [], [], AudioSlice> = (set, get) => ({
  micEnabled: true,
  soundEnabled: true,
  micCascaded: false,
  lastVoluntaryMic: true,
  outputVolume: 1,
  callUserVolumes: {},
  mutedCallUserIds: {},
  
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
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
        const shown = storage.getString(CASCADE_TOAST_KEY);
        if (!shown) {
          storage.setString(CASCADE_TOAST_KEY, "1");
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

  setOutputVolume: (volume: number) => set({
    outputVolume: Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1)),
  }),
  setCallUserVolume: (userKey, volume) => set((state: AudioSlice) => ({
    callUserVolumes: {
      ...state.callUserVolumes,
      [userKey]: Math.min(100, Math.max(0, Number.isFinite(volume) ? Math.round(volume) : 100)),
    },
  })),
  setCallUserMuted: (userKey, muted) => set((state: AudioSlice) => {
    const next = { ...state.mutedCallUserIds };
    if (muted) next[userKey] = true;
    else delete next[userKey];
    return { mutedCallUserIds: next };
  }),
  setInputDevice: (deviceId: string) => set({ selectedInputDeviceId: deviceId }),
  setOutputDevice: (deviceId: string) => set({ selectedOutputDeviceId: deviceId }),
  setNoiseSuppression: (enabled: boolean) => set({ noiseSuppression: enabled }),
  setEchoCancellation: (enabled: boolean) => set({ echoCancellation: enabled }),
  setAutoGainControl: (enabled: boolean) => set({ autoGainControl: enabled }),

  refreshDevices: async (options) => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) {
      return {
        permissionState: "unavailable" as const,
        labelsAvailable: false,
        inputCount: 0,
        outputCount: 0,
      };
    }

    let permissionState: "granted" | "denied" | "not-requested" | "unavailable" = "not-requested";

    try {
      if (options?.requestPermission) {
        const stream = await mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        permissionState = "granted";
      }

      const devices = await mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === "audioinput");
      const outputs = devices.filter((device) => device.kind === "audiooutput");
      const labelsAvailable = devices.some((device) => device.label.trim().length > 0);

      set({
        availableInputDevices: inputs,
        availableOutputDevices: outputs,
      });

      return {
        permissionState,
        labelsAvailable,
        inputCount: inputs.length,
        outputCount: outputs.length,
      };
    } catch (err) {
      console.error("Failed to enumerate audio devices:", err);
      set({
        availableInputDevices: [],
        availableOutputDevices: [],
      });

      if (
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError")
      ) {
        permissionState = "denied";
      } else if (!mediaDevices.getUserMedia) {
        permissionState = "unavailable";
      }

      return {
        permissionState,
        labelsAvailable: false,
        inputCount: 0,
        outputCount: 0,
      };
    }
  },
});
