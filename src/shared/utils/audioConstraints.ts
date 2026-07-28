export interface AudioPreferencesSnapshot {
  inputDeviceId: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferencesSnapshot = {
  inputDeviceId: "default",
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

  if (preferences.inputDeviceId !== "default") {
    audio.deviceId = { exact: preferences.inputDeviceId };
  }

  return { audio, video: false };
}
