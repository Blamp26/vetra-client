import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  setCalls = 0;
  constructor(initial: Record<string, string> = {}) {
    Object.entries(initial).forEach(([key, value]) => this.values.set(key, value));
  }
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.setCalls += 1; this.values.set(key, value); }
}

let originalLocalStorage: PropertyDescriptor | undefined;
let testStorage: MemoryStorage;

function installStorage(initial: Record<string, string> = {}) {
  testStorage = new MemoryStorage(initial);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: testStorage });
}

async function loadStore(initial: Record<string, string> = {}) {
  vi.resetModules();
  installStorage(initial);
  return import("./mediaSettings");
}

function versioned(inputDeviceId: unknown = "default", outputDeviceId: unknown = "default") {
  return JSON.stringify({ version: 1, preferences: { inputDeviceId, outputDeviceId } });
}

describe("mediaSettingsStore", () => {
  beforeEach(() => {
    originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  });

  afterEach(() => {
    if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("uses defaults and hydrates synchronously", async () => {
    const { mediaSettingsStore } = await loadStore();
    expect(mediaSettingsStore.getSnapshot()).toEqual({
      preferences: { inputDeviceId: "default", outputDeviceId: "default" },
      hydrated: true,
    });
    expect(testStorage.getItem("vetra-media-settings")).toBe(versioned());
  });

  it("hydrates valid version one data and gives it precedence over legacy data", async () => {
    const { mediaSettingsStore } = await loadStore({
      "vetra-media-settings": versioned(" new-input ", "new-output"),
      "vetra-storage": JSON.stringify({ state: { selectedInputDeviceId: "old-input", unrelated: true } }),
    });
    expect(mediaSettingsStore.getSnapshot().preferences).toEqual({ inputDeviceId: "new-input", outputDeviceId: "new-output" });
    expect(JSON.parse(testStorage.getItem("vetra-storage")!).state).toEqual({ unrelated: true });
  });

  it.each([
    ["{", "default", "default"],
    [JSON.stringify({ version: 2, preferences: { inputDeviceId: "wrong" } }), "default", "default"],
    [JSON.stringify({ version: 1 }), "default", "default"],
  ])("uses defaults for malformed or unsupported data", async (payload, inputDeviceId, outputDeviceId) => {
    const { mediaSettingsStore } = await loadStore({ "vetra-media-settings": payload });
    expect(mediaSettingsStore.getSnapshot().preferences).toEqual({ inputDeviceId, outputDeviceId });
  });

  it("normalizes invalid IDs, notifies only on changes, and resets", async () => {
    const { mediaSettingsStore } = await loadStore();
    const listener = vi.fn();
    const unsubscribe = mediaSettingsStore.subscribe(listener);

    mediaSettingsStore.setInputDeviceId("  mic-1  ");
    mediaSettingsStore.setInputDeviceId("mic-1");
    mediaSettingsStore.setOutputDeviceId("   ");
    mediaSettingsStore.setOutputDeviceId(42 as unknown as string);
    expect(mediaSettingsStore.getSnapshot().preferences).toEqual({ inputDeviceId: "mic-1", outputDeviceId: "default" });
    expect(listener).toHaveBeenCalledTimes(1);

    mediaSettingsStore.reset();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(mediaSettingsStore.getSnapshot().preferences).toEqual({ inputDeviceId: "default", outputDeviceId: "default" });
    unsubscribe();
  });

  it("persists defaults and notifies once when reset changes preferences", async () => {
    const { mediaSettingsStore } = await loadStore();
    const listener = vi.fn();
    mediaSettingsStore.subscribe(listener);
    mediaSettingsStore.setInputDeviceId("mic");
    mediaSettingsStore.setOutputDeviceId("speaker");
    listener.mockClear();

    mediaSettingsStore.reset();

    expect(testStorage.getItem("vetra-media-settings")).toBe(versioned());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("persists defaults without notifying when reset is already at defaults", async () => {
    const { mediaSettingsStore } = await loadStore();
    testStorage.removeItem("vetra-media-settings");
    const writesBeforeReset = testStorage.setCalls;
    const listener = vi.fn();
    mediaSettingsStore.subscribe(listener);

    mediaSettingsStore.reset();

    expect(testStorage.setCalls).toBe(writesBeforeReset + 1);
    expect(testStorage.getItem("vetra-media-settings")).toBe(versioned());
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not persist or notify for unchanged normalized setters", async () => {
    const { mediaSettingsStore } = await loadStore({ "vetra-media-settings": versioned("mic", "speaker") });
    const writesBeforeSetters = testStorage.setCalls;
    const listener = vi.fn();
    mediaSettingsStore.subscribe(listener);

    mediaSettingsStore.setInputDeviceId(" mic ");
    mediaSettingsStore.setOutputDeviceId("speaker");

    expect(testStorage.setCalls).toBe(writesBeforeSetters);
    expect(listener).not.toHaveBeenCalled();
  });

  it("migrates both legacy IDs and removes only those fields", async () => {
    const { mediaSettingsStore } = await loadStore({
      "vetra-storage": JSON.stringify({ state: {
        selectedInputDeviceId: " legacy-input ",
        selectedOutputDeviceId: "legacy-output",
        theme: "dark",
        unrelated: { keep: true },
      }, version: 0 }),
    });
    expect(mediaSettingsStore.getSnapshot().preferences).toEqual({ inputDeviceId: "legacy-input", outputDeviceId: "legacy-output" });
    expect(testStorage.getItem("vetra-media-settings")).toBe(versioned("legacy-input", "legacy-output"));
    expect(JSON.parse(testStorage.getItem("vetra-storage")!)).toEqual({ state: { theme: "dark", unrelated: { keep: true } }, version: 0 });
  });

  it("migrates a single legacy ID and defaults the missing side", async () => {
    const { mediaSettingsStore } = await loadStore({
      "vetra-storage": JSON.stringify({ state: { selectedOutputDeviceId: "speaker" } }),
    });
    expect(mediaSettingsStore.getSnapshot().preferences).toEqual({ inputDeviceId: "default", outputDeviceId: "speaker" });
  });

  it("does not rewrite a malformed legacy payload", async () => {
    const malformed = "not-json";
    const { mediaSettingsStore } = await loadStore({ "vetra-storage": malformed });
    expect(mediaSettingsStore.getSnapshot().preferences.inputDeviceId).toBe("default");
    expect(testStorage.getItem("vetra-storage")).toBe(malformed);
  });

  it("completes safely when storage reads or writes fail", async () => {
    vi.resetModules();
    const getThrowing = { getItem: () => { throw new DOMException("denied", "SecurityError"); } } as unknown as Storage;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => getThrowing });
    const readFailure = await import("./mediaSettings");
    expect(readFailure.mediaSettingsStore.getSnapshot().hydrated).toBe(true);

    vi.resetModules();
    const writeThrowing = { getItem: () => null, setItem: () => { throw new DOMException("denied", "SecurityError"); } } as unknown as Storage;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: writeThrowing });
    const writeFailure = await import("./mediaSettings");
    expect(() => writeFailure.mediaSettingsStore.setInputDeviceId("mic")).not.toThrow();
    expect(writeFailure.mediaSettingsStore.getSnapshot().preferences.inputDeviceId).toBe("mic");
  });
});
