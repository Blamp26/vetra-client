import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSafeExternalUrl, normalizeExternalUrl, openExternalUrl } from "./externalLinks";

describe("external links", () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.restoreAllMocks();
  });

  it("allows only HTTP and HTTPS", () => {
    expect(isSafeExternalUrl("https://example.com")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:4000/test")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/plain,x")).toBe(false);
    expect(isSafeExternalUrl("file:///tmp/a")).toBe(false);
  });

  it.each([
    ["example.com", "https://example.com/"],
    ["www.example.com", "https://www.example.com/"],
    ["sub.example.com/path?x=1#part", "https://sub.example.com/path?x=1#part"],
    ["146.120.249.160:8080/path", "https://146.120.249.160:8080/path"],
    ["localhost:4000/test", "https://localhost:4000/test"],
    ["http://example.com", "http://example.com/"],
    ["https://example.com", "https://example.com/"],
  ])("normalizes %s to %s", (value, expected) => {
    expect(normalizeExternalUrl(value)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/plain,x",
    "file:///tmp/file",
    "not an address",
    "example..com",
    "example.com:bad",
    "   ",
  ])("rejects unsafe or malformed input %s", (value) => {
    expect(normalizeExternalUrl(value)).toBeNull();
  });

  it("opens browser links in a new isolated tab", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await openExternalUrl("https://example.com/page");
    expect(open).toHaveBeenCalledWith("https://example.com/page", "_blank", "noopener,noreferrer");
  });
});
