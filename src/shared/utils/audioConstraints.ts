export interface AudioPreferencesSnapshot {
  selectedInputDeviceId: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferencesSnapshot = {
  selectedInputDeviceId: "default",
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

export function buildMicrophoneConstraints(
  preferences: AudioPreferencesSnapshot,
): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {
    noiseSuppression: preferences.noiseSuppression,
    echoCancellation: preferences.echoCancellation,
    autoGainControl: preferences.autoGainControl,
  };

  if (preferences.selectedInputDeviceId !== "default") {
    audio.deviceId = { exact: preferences.selectedInputDeviceId };
  }

  return { audio, video: false };
}
