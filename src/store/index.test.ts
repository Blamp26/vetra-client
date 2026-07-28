import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getHistoryMock } = vi.hoisted(() => ({
  getHistoryMock: vi.fn(),
}));

vi.mock('@/api/directedCallHistory', () => ({
  directedCallHistoryApi: { getHistory: getHistoryMock },
}));

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

let originalLocalStorage: PropertyDescriptor | undefined;
let testStorage: MemoryStorage;

function installStorage(initial: Record<string, string> = {}) {
  testStorage = new MemoryStorage(initial);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: testStorage,
  });
}

function persistedPayload() {
  return JSON.parse(testStorage.getItem('vetra-storage') ?? '{}') as {
    state?: Record<string, unknown>;
  };
}

const historyEntry = {
  call_id: '11111111-1111-1111-1111-111111111111',
  status: 'completed',
  peer: { user_id: 'peer-public', username: 'peer' },
  created_at: '2026-07-22T12:00:00.000000Z',
  ended_at: '2026-07-22T12:00:02.000000Z',
  duration_ms: 2000,
};

describe('store startup', () => {
  beforeEach(() => {
    vi.resetModules();
    originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    installStorage();
    getHistoryMock.mockReset();
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('does not crash when localStorage access throws SecurityError', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });

    const store = await import('./index');

    expect(store.getState()).toBeDefined();
  });

  it('persists only the existing unrelated allowlisted fields', async () => {
    getHistoryMock.mockResolvedValue([historyEntry]);
    const store = await import('./index');

    await store.getState().refreshDirectedCallHistory();

    expect(persistedPayload().state).toEqual({
      theme: 'light',
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    });
    expect(persistedPayload().state).not.toHaveProperty('directedCallHistoryEntriesByCallId');
    expect(persistedPayload().state).not.toHaveProperty('directedCallHistoryOrderedCallIds');
    expect(persistedPayload().state).not.toHaveProperty('directedCallHistoryLoading');
    expect(persistedPayload().state).not.toHaveProperty('directedCallHistoryError');
    expect(persistedPayload().state).not.toHaveProperty('directedCallHistoryRequestGeneration');
  });

  it('hydrates a real partialized payload without restoring history state', async () => {
    getHistoryMock.mockResolvedValue([historyEntry]);
    const sourceStore = await import('./index');
    sourceStore.getState().setTheme('dark');
    const mediaSettings = await import('@/shared/utils/mediaSettings');
    mediaSettings.mediaSettingsStore.setInputDeviceId('input-device');
    mediaSettings.mediaSettingsStore.setOutputDeviceId('output-device');
    sourceStore.getState().setNoiseSuppression(false);
    sourceStore.getState().setEchoCancellation(false);
    sourceStore.getState().setAutoGainControl(false);
    await sourceStore.getState().refreshDirectedCallHistory();

    const persisted = testStorage.getItem('vetra-storage');
    const persistedMediaSettings = testStorage.getItem('vetra-media-settings');
    expect(persisted).not.toBeNull();
    expect(persistedMediaSettings).not.toBeNull();

    vi.resetModules();
    installStorage({ 'vetra-storage': persisted!, 'vetra-media-settings': persistedMediaSettings! });
    const hydratedStore = await import('./index');
    const state = hydratedStore.getState();

    expect({
      theme: state.theme,
      noiseSuppression: state.noiseSuppression,
      echoCancellation: state.echoCancellation,
      autoGainControl: state.autoGainControl,
    }).toEqual({
      theme: 'dark',
      noiseSuppression: false,
      echoCancellation: false,
      autoGainControl: false,
    });
    expect((await import('@/shared/utils/mediaSettings')).mediaSettingsStore.getSnapshot().preferences).toEqual({
      inputDeviceId: 'input-device',
      outputDeviceId: 'output-device',
    });
    expect(state.directedCallHistoryEntriesByCallId).toEqual({});
    expect(state.directedCallHistoryOrderedCallIds).toEqual([]);
    expect(state.directedCallHistoryLoading).toBe(false);
    expect(state.directedCallHistoryError).toBeNull();
    expect(state.directedCallHistoryRequestGeneration).toBe(0);
  });
});
