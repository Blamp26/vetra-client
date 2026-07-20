import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/shared/utils/storage";
import { getOrCreateDirectedCallDeviceId } from "./directedCallDevice";

const firstDeviceId = "11111111-1111-4111-8111-111111111111";
const secondDeviceId = "22222222-2222-4222-8222-222222222222";

describe("directed call device identity", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => firstDeviceId) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates and persists one cryptographic UUID for the client profile", () => {
    const created = getOrCreateDirectedCallDeviceId();

    expect(created).toBe(firstDeviceId);
    expect(localStorage.getItem(STORAGE_KEYS.DIRECTED_CALL_DEVICE_ID)).toBe(firstDeviceId);
  });

  it("reuses the stored UUID across calls", () => {
    localStorage.setItem(STORAGE_KEYS.DIRECTED_CALL_DEVICE_ID, firstDeviceId);
    const randomUUID = vi.fn(() => secondDeviceId);
    vi.stubGlobal("crypto", { randomUUID });

    expect(getOrCreateDirectedCallDeviceId()).toBe(firstDeviceId);
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it("replaces malformed stored values safely", () => {
    localStorage.setItem(STORAGE_KEYS.DIRECTED_CALL_DEVICE_ID, "not-a-device-id");

    expect(getOrCreateDirectedCallDeviceId()).toBe(firstDeviceId);
    expect(localStorage.getItem(STORAGE_KEYS.DIRECTED_CALL_DEVICE_ID)).toBe(firstDeviceId);
  });
});
