import { useSyncExternalStore } from "react";
import { storage, STORAGE_KEYS } from "./storage";

const MEDIA_SETTINGS_VERSION = 1;
const DEFAULT_DEVICE_ID = "default";

export type MediaDevicePreferences = {
  inputDeviceId: string;
  outputDeviceId: string;
};

export type MediaSettingsSnapshot = {
  preferences: MediaDevicePreferences;
  hydrated: boolean;
};

export interface MediaSettingsStore {
  getSnapshot(): MediaSettingsSnapshot;
  subscribe(listener: () => void): () => void;
  setInputDeviceId(deviceId: string): void;
  setOutputDeviceId(deviceId: string): void;
  reset(): void;
}

type PersistedMediaSettings = {
  version: number;
  preferences: {
    inputDeviceId?: unknown;
    outputDeviceId?: unknown;
  };
};

function normalizeDeviceId(deviceId: unknown): string {
  if (typeof deviceId !== "string") return DEFAULT_DEVICE_ID;
  const normalized = deviceId.trim();
  return normalized.length > 0 ? normalized : DEFAULT_DEVICE_ID;
}

function defaultPreferences(): MediaDevicePreferences {
  return { inputDeviceId: DEFAULT_DEVICE_ID, outputDeviceId: DEFAULT_DEVICE_ID };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readVersionedPreferences(value: unknown): MediaDevicePreferences | null {
  if (!isRecord(value) || value.version !== MEDIA_SETTINGS_VERSION || !isRecord(value.preferences)) {
    return null;
  }

  return {
    inputDeviceId: normalizeDeviceId(value.preferences.inputDeviceId),
    outputDeviceId: normalizeDeviceId(value.preferences.outputDeviceId),
  };
}

function readLegacyPreferences(value: unknown): MediaDevicePreferences | null {
  if (!isRecord(value) || !isRecord(value.state)) return null;
  return {
    inputDeviceId: normalizeDeviceId(value.state.selectedInputDeviceId),
    outputDeviceId: normalizeDeviceId(value.state.selectedOutputDeviceId),
  };
}

function removeLegacyDeviceFields(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.state)) return null;
  const state = { ...value.state };
  delete state.selectedInputDeviceId;
  delete state.selectedOutputDeviceId;
  return { ...value, state };
}

function persistedPayload(preferences: MediaDevicePreferences): PersistedMediaSettings {
  return {
    version: MEDIA_SETTINGS_VERSION,
    preferences,
  };
}

function hydratePreferences(): MediaDevicePreferences {
  const stored = storage.get<unknown>(STORAGE_KEYS.MEDIA_SETTINGS);
  const versioned = readVersionedPreferences(stored);
  const legacyPayload = storage.get<unknown>(STORAGE_KEYS.APP_STATE);
  const legacy = readLegacyPreferences(legacyPayload);
  const preferences = versioned ?? legacy ?? defaultPreferences();

  storage.set(STORAGE_KEYS.MEDIA_SETTINGS, persistedPayload(preferences));

  if (legacyPayload !== null && removeLegacyDeviceFields(legacyPayload) !== null) {
    storage.set(STORAGE_KEYS.APP_STATE, removeLegacyDeviceFields(legacyPayload));
  }

  return preferences;
}

let preferences = hydratePreferences();
let snapshot: MediaSettingsSnapshot = { preferences, hydrated: true };
const listeners = new Set<() => void>();

function update(next: MediaDevicePreferences, persistUnchanged = false): void {
  if (next.inputDeviceId === preferences.inputDeviceId && next.outputDeviceId === preferences.outputDeviceId) {
    if (persistUnchanged) storage.set(STORAGE_KEYS.MEDIA_SETTINGS, persistedPayload(preferences));
    return;
  }
  preferences = next;
  snapshot = { preferences, hydrated: true };
  storage.set(STORAGE_KEYS.MEDIA_SETTINGS, persistedPayload(preferences));
  listeners.forEach((listener) => listener());
}

export const mediaSettingsStore: MediaSettingsStore = {
  getSnapshot: () => snapshot,
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setInputDeviceId: (deviceId) => update({ ...preferences, inputDeviceId: normalizeDeviceId(deviceId) }),
  setOutputDeviceId: (deviceId) => update({ ...preferences, outputDeviceId: normalizeDeviceId(deviceId) }),
  reset: () => update(defaultPreferences(), true),
};

export function useMediaSettings(): MediaSettingsSnapshot {
  return useSyncExternalStore(
    mediaSettingsStore.subscribe,
    mediaSettingsStore.getSnapshot,
    mediaSettingsStore.getSnapshot,
  );
}
