import { describe, expect, it } from "vitest";
import { getDefaultApiBaseUrl } from "./base";

describe("getDefaultApiBaseUrl", () => {
  it("uses the current origin for same-origin deployments", () => {
    expect(getDefaultApiBaseUrl({ origin: "http://146.120.249.160" })).toBe(
      "http://146.120.249.160/api/v1",
    );
  });
});
