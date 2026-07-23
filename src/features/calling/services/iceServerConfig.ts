const DEFAULT_STUN_URL = "stun:stun.l.google.com:19302";

function readEnvValue(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildIceServers(env: ImportMetaEnv = import.meta.env): RTCIceServer[] {
  const stunUrl = readEnvValue(env.VITE_WEBRTC_STUN_URL) ?? DEFAULT_STUN_URL;
  const turnUrl = readEnvValue(env.VITE_WEBRTC_TURN_URL);
  const turnUsername = readEnvValue(env.VITE_WEBRTC_TURN_USERNAME);
  const turnCredential = readEnvValue(env.VITE_WEBRTC_TURN_CREDENTIAL);

  const iceServers: RTCIceServer[] = [{ urls: stunUrl }];

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
  }

  return iceServers;
}
