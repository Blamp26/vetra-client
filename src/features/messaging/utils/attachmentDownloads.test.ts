import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadAttachmentWithAuth,
  fetchAttachmentBlob,
} from "./attachmentDownloads";

describe("attachmentDownloads", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:attachment");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fetches attachments with bearer auth", async () => {
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    const response = new Response(blob, { status: 200 });

    vi.mocked(fetch).mockResolvedValue(response);

    await fetchAttachmentBlob(
      {
        id: "media-file-1",
        url: "/api/v1/media/media-file-1",
        mime_type: "application/pdf",
        original_name: "report.pdf",
        file_size: 5678,
        kind: "file",
      },
      "secret-token",
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/media\/media-file-1$/),
      {
        headers: { Authorization: "Bearer secret-token" },
      },
    );
  });

  it("downloads file attachments through an authenticated fetch", async () => {
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    const response = new Response(blob, { status: 200 });
    const originalCreateElement = document.createElement.bind(document);
    const anchor = originalCreateElement("a");
    const click = vi.fn();

    Object.defineProperty(anchor, "click", {
      value: click,
      configurable: true,
    });

    vi.mocked(fetch).mockResolvedValue(response);
    vi.spyOn(document, "createElement").mockImplementation(
      ((tagName: string): HTMLElement =>
        tagName === "a"
          ? anchor
          : originalCreateElement(tagName)) as typeof document.createElement,
    );
    vi.spyOn(window, "setTimeout").mockImplementation(
      ((handler: TimerHandler) => {
        if (typeof handler === "function") handler();
        return 0 as unknown as number;
      }) as typeof window.setTimeout,
    );

    await downloadAttachmentWithAuth({
      attachment: {
        id: "media-file-2",
        url: "/api/v1/media/media-file-2",
        mime_type: "application/pdf",
        original_name: "report.pdf",
        file_size: 5678,
        kind: "file",
      },
      authToken: "secret-token",
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/media\/media-file-2$/),
      {
        headers: { Authorization: "Bearer secret-token" },
      },
    );
    expect(click).toHaveBeenCalledTimes(1);
  });
});
