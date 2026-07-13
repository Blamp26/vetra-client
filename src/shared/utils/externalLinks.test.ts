import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSafeExternalUrl, openExternalUrl } from "./externalLinks";

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

  it("opens browser links in a new isolated tab", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await openExternalUrl("https://example.com/page");
    expect(open).toHaveBeenCalledWith("https://example.com/page", "_blank", "noopener,noreferrer");
  });
});
