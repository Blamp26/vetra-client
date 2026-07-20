import { describe, expect, it, vi } from "vitest";
import { parseCallRuntimeMode } from "./callRuntimeMode";

describe("call runtime mode", () => {
  it.each([
    [undefined, "legacy"],
    [null, "legacy"],
    ["", "legacy"],
    ["legacy", "legacy"],
    ["persistent", "persistent"],
    ["PERSISTENT", "disabled"],
    ["true", "disabled"],
    ["disabled", "disabled"],
  ])("resolves %s to %s", (value, expected) => {
    expect(parseCallRuntimeMode(value)).toBe(expected);
  });

  it("does not read the retired boolean gate", async () => {
    const module = await import("./callRuntimeMode");
    expect(module.parseCallRuntimeMode(undefined)).toBe("legacy");
    expect((import.meta.env as Record<string, unknown>).VITE_ENABLE_DIRECTED_CALL_SESSION).toBeUndefined();
  });

  it("diagnoses an invalid explicit mode once in development", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    parseCallRuntimeMode("invalid-test-mode");
    parseCallRuntimeMode("invalid-test-mode");
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});
