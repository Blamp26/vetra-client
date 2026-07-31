import { describe, expect, it } from "vitest";
import { isReservedBroadcastRootName, RESERVED_BROADCAST_ROOT_NAMES } from "./rootNames";

describe("broadcast root-name policy", () => {
  it("matches the confirmed web route inventory case-insensitively", () => {
    expect(RESERVED_BROADCAST_ROOT_NAMES).toEqual(["api", "assets", "invite"]);
    expect(isReservedBroadcastRootName("InViTe")).toBe(true);
    expect(isReservedBroadcastRootName("news_channel")).toBe(false);
  });
});
