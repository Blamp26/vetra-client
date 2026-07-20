import { isUuid } from "../protocol/directedCallProtocol";
import { STORAGE_KEYS, storage } from "@/shared/utils/storage";

function generateDeviceId(): string {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID().toLowerCase();
  }

  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  throw new Error("A cryptographically suitable UUID source is unavailable");
}

export function getOrCreateDirectedCallDeviceId(): string {
  const stored = storage.getString(STORAGE_KEYS.DIRECTED_CALL_DEVICE_ID);
  if (stored && isUuid(stored)) {
    const normalized = stored.toLowerCase();
    if (normalized !== stored) {
      storage.setString(STORAGE_KEYS.DIRECTED_CALL_DEVICE_ID, normalized);
    }
    return normalized;
  }

  if (stored) {
    storage.remove(STORAGE_KEYS.DIRECTED_CALL_DEVICE_ID);
  }

  const deviceId = generateDeviceId();
  storage.setString(STORAGE_KEYS.DIRECTED_CALL_DEVICE_ID, deviceId);
  return deviceId;
}
