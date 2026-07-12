import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadAttachmentWithAuth,
  fetchAttachmentBlob,
} from "./attachmentDownloads";

const { saveMock, writeFileMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: writeFileMock }));

describe("attachmentDownloads", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:attachment");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    saveMock.mockReset();
    writeFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
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
    expect(anchor.download).toBe("report.pdf");
    expect(anchor.parentElement).toBeNull();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("uses the native save dialog and filesystem in Tauri", async () => {
    const pdfBytes = new Uint8Array([112, 100, 102, 45, 98, 121, 116, 101, 115]);
    vi.mocked(fetch).mockResolvedValue(new Response(pdfBytes, { status: 200 }));
    saveMock.mockResolvedValue("C:\\Users\\Tester\\report.pdf");
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });

    await downloadAttachmentWithAuth({
      attachment: {
        id: "media-file-tauri",
        url: "/api/v1/media/media-file-tauri",
        mime_type: "application/pdf",
        original_name: "report.pdf",
        file_size: 9,
        kind: "file",
      },
      authToken: "secret-token",
    });

    expect(saveMock).toHaveBeenCalledWith({
      defaultPath: "report.pdf",
      filters: [{ name: "application/pdf", extensions: ["pdf"] }],
    });
    expect(writeFileMock).toHaveBeenCalledWith(
      "C:\\Users\\Tester\\report.pdf",
      pdfBytes,
    );
    expect(document.querySelector("a")).toBeNull();
  });

  it("treats a canceled native save dialog as a successful no-op", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(new Blob(["pdf"]), { status: 200 }));
    saveMock.mockResolvedValue(null);
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });

    await expect(downloadAttachmentWithAuth({
      attachment: {
        id: "media-file-cancel",
        url: "/api/v1/media/media-file-cancel",
        mime_type: "application/pdf",
        original_name: "cancel.pdf",
        file_size: 3,
        kind: "file",
      },
      authToken: "secret-token",
    })).resolves.toBeUndefined();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("clears the persisted session and never writes on a 401", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{\"detail\":\"expired\"}", { status: 401 }));

    await expect(fetchAttachmentBlob({
      id: "media-file-401",
      url: "/api/v1/media/media-file-401",
      mime_type: "application/pdf",
      original_name: "expired.pdf",
      file_size: 0,
      kind: "file",
    }, "secret-token")).rejects.toThrow("401");
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
