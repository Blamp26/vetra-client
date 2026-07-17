import { describe, expect, it } from "vitest";
import { serializeResourceRef } from "./resourceRef";

describe("serializeResourceRef", () => {
  it("preserves type identity for numeric and string references", () => {
    expect(serializeResourceRef(7)).toBe("number:7");
    expect(serializeResourceRef("7")).toBe("string:7");
  });
});
