import { describe, expect, it } from "vitest";
import { formatUnreadCount } from "./unread";

describe("formatUnreadCount", () => {
  it("hides zero through the caller's badge condition", () => {
    expect(formatUnreadCount(0)).toBe("0");
  });

  it("keeps exact values through 999", () => {
    expect(formatUnreadCount(1)).toBe("1");
    expect(formatUnreadCount(999)).toBe("999");
  });

  it("caps only the visual representation above 999", () => {
    expect(formatUnreadCount(1000)).toBe("999+");
    expect(formatUnreadCount(100000)).toBe("999+");
  });
});
