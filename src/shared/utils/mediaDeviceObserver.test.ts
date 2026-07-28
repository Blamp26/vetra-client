import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshDevices: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/store", () => ({
  getState: () => ({ refreshDevices: mocks.refreshDevices }),
}));

vi.mock("@/store/slices/audioSlice", () => ({
  invalidateAudioDeviceRefreshes: mocks.invalidate,
}));

import { startMediaDeviceObserver, subscribeMediaDeviceRefresh } from "./mediaDeviceObserver";

describe("mediaDeviceObserver", () => {
  let addEventListener: ReturnType<typeof vi.fn>;
  let removeEventListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    mocks.refreshDevices.mockReset().mockResolvedValue({ committed: true });
    mocks.invalidate.mockReset();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { addEventListener, removeEventListener },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps one listener across Strict Mode-style setup and cleanup", () => {
    const firstStop = startMediaDeviceObserver();
    firstStop();
    const secondStop = startMediaDeviceObserver();

    expect(addEventListener).toHaveBeenCalledTimes(2);
    expect(removeEventListener).toHaveBeenCalledTimes(1);

    secondStop();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  });

  it("makes every owner cleanup independently idempotent", () => {
    const firstStop = startMediaDeviceObserver();
    const secondStop = startMediaDeviceObserver();

    firstStop();
    firstStop();
    expect(removeEventListener).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();

    secondStop();
    secondStop();
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });

  it("refreshes through the store and publishes only committed results", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMediaDeviceRefresh(listener);
    const stop = startMediaDeviceObserver();
    const deviceChange = addEventListener.mock.calls[0][1] as () => void;

    deviceChange();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.refreshDevices).toHaveBeenCalledWith(expect.objectContaining({ source: "initial", observerScope: expect.any(Symbol) }));
    expect(mocks.refreshDevices).toHaveBeenCalledWith(expect.objectContaining({ source: "devicechange", observerScope: expect.any(Symbol) }));
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    stop();
  });

  it("does not publish a late result after shutdown", async () => {
    let resolveRefresh!: (result: { committed: boolean }) => void;
    mocks.refreshDevices.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    const listener = vi.fn();
    const unsubscribe = subscribeMediaDeviceRefresh(listener);
    const stop = startMediaDeviceObserver();

    stop();
    resolveRefresh({ committed: true });
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("invalidates only the stopped observer scope", () => {
    const stop = startMediaDeviceObserver();
    stop();

    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate.mock.calls[0][0]).toEqual(expect.any(Symbol));
  });

  it("does not let an old observer lifetime publish after a new lifetime starts", async () => {
    let resolveA!: (result: { committed: boolean; inputCount: number }) => void;
    let resolveB!: (result: { committed: boolean; inputCount: number }) => void;
    mocks.refreshDevices.mockImplementation((options: { source: string }) => {
      if (options.source === "devicechange") {
        return new Promise((resolve) => {
          if (!resolveA) resolveA = resolve;
          else resolveB = resolve;
        });
      }
      return Promise.resolve({ committed: false });
    });
    const listener = vi.fn();
    const unsubscribe = subscribeMediaDeviceRefresh(listener);

    const stopA = startMediaDeviceObserver();
    const changeA = addEventListener.mock.calls[0][1] as () => void;
    changeA();
    const scopeA = mocks.refreshDevices.mock.calls.find((call) => call[0].source === "devicechange")?.[0].observerScope;
    stopA();

    const stopB = startMediaDeviceObserver();
    const changeB = addEventListener.mock.calls[1][1] as () => void;
    changeB();
    const scopeB = mocks.refreshDevices.mock.calls[mocks.refreshDevices.mock.calls.length - 1]?.[0].observerScope;
    expect(scopeB).not.toBe(scopeA);

    resolveA({ committed: true, inputCount: 1 });
    resolveB({ committed: true, inputCount: 2 });
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ inputCount: 2 }));
    expect(mocks.invalidate).toHaveBeenCalledWith(scopeA);
    expect(mocks.invalidate).not.toHaveBeenCalledWith(scopeB);
    unsubscribe();
    stopB();
  });

  it("is safe when mediaDevices is absent", () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    const stop = startMediaDeviceObserver();

    expect(() => stop()).not.toThrow();
    expect(() => stop()).not.toThrow();
    expect(addEventListener).not.toHaveBeenCalled();
    expect(removeEventListener).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });
});
