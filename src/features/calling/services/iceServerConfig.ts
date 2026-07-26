const DEFAULT_STUN_URL = "stun:stun.l.google.com:19302";

export interface RtcConfigurationSource {
  getConfiguration(): Promise<RTCConfiguration>;
}

export class RtcConfigurationError extends Error {
  constructor() {
    super("RTC configuration unavailable");
    this.name = "RtcConfigurationError";
  }
}

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

function cloneIceServer(server: RTCIceServer): RTCIceServer {
  const urls = Array.isArray(server.urls) ? [...server.urls] : server.urls;
  return {
    urls,
    ...(server.username !== undefined ? { username: server.username } : {}),
    ...(server.credential !== undefined ? { credential: server.credential } : {}),
  };
}

function isValidIceServer(server: unknown): server is RTCIceServer {
  if (!server || typeof server !== "object") return false;
  const candidate = server as RTCIceServer;
  const urls = candidate.urls;
  const validUrls = typeof urls === "string"
    ? urls.trim().length > 0
    : Array.isArray(urls) && urls.length > 0 && urls.every((url) => typeof url === "string" && url.trim().length > 0);
  return validUrls
    && (candidate.username === undefined || typeof candidate.username === "string")
    && (candidate.credential === undefined || typeof candidate.credential === "string");
}

function cloneRtcConfiguration(configuration: RTCConfiguration): RTCConfiguration {
  if (!configuration || typeof configuration !== "object") throw new RtcConfigurationError();
  if (configuration.iceServers !== undefined
    && (!Array.isArray(configuration.iceServers) || !configuration.iceServers.every(isValidIceServer))) {
    throw new RtcConfigurationError();
  }

  return {
    ...configuration,
    ...(configuration.iceServers
      ? { iceServers: configuration.iceServers.map(cloneIceServer) }
      : {}),
    ...(configuration.certificates ? { certificates: [...configuration.certificates] } : {}),
  };
}

export function createDefaultRtcConfigurationSource(
  env: ImportMetaEnv = import.meta.env,
): RtcConfigurationSource {
  return {
    async getConfiguration(): Promise<RTCConfiguration> {
      return cloneRtcConfiguration({ iceServers: buildIceServers(env) });
    },
  };
}

export async function resolveRtcConfiguration(
  source: RtcConfigurationSource,
): Promise<RTCConfiguration> {
  try {
    return cloneRtcConfiguration(await source.getConfiguration());
  } catch {
    throw new RtcConfigurationError();
  }
}
