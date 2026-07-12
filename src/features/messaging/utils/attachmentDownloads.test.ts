import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadAttachmentWithAuth,
  fetchAttachmentBlob,
  getAttachmentLocalState,
} from "./attachmentDownloads";

const { downloadDirMock, joinMock, existsMock, mkdirMock, writeFileMock, openPathMock } = vi.hoisted(() => ({
  downloadDirMock: vi.fn(),
  joinMock: vi.fn((...paths: string[]) => paths.join("/")),
  existsMock: vi.fn(),
  mkdirMock: vi.fn(),
  writeFileMock: vi.fn(),
  openPathMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({ downloadDir: downloadDirMock, join: joinMock }));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: existsMock, mkdir: mkdirMock, writeFile: writeFileMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: openPathMock }));

describe("attachmentDownloads", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:attachment");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    downloadDirMock.mockReset();
    joinMock.mockClear();
    existsMock.mockReset();
    mkdirMock.mockReset();
    writeFileMock.mockReset();
    openPathMock.mockReset();
    localStorage.clear();
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

  it("automatically writes to Downloads/Vetra Desktop without a dialog", async () => {
    const pdfBytes = new Uint8Array([112, 100, 102, 45, 98, 121, 116, 101, 115]);
    vi.mocked(fetch).mockResolvedValue(new Response(pdfBytes, { status: 200 }));
    downloadDirMock.mockResolvedValue("C:\\Users\\Tester\\Downloads");
    existsMock.mockResolvedValue(false);
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });

    await expect(downloadAttachmentWithAuth({
      attachment: {
        id: "media-file-tauri",
        url: "/api/v1/media/media-file-tauri",
        mime_type: "application/pdf",
        original_name: "report.pdf",
        file_size: 9,
        kind: "file",
      },
      authToken: "secret-token",
    })).resolves.toBeUndefined();

    expect(mkdirMock).toHaveBeenCalledWith("C:\\Users\\Tester\\Downloads/Vetra Desktop", { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(
      "C:\\Users\\Tester\\Downloads/Vetra Desktop/report.pdf",
      pdfBytes,
    );
    expect(openPathMock).not.toHaveBeenCalled();
    expect(document.querySelector("a")).toBeNull();
  });

  it("reports streamed loaded and total bytes before writing the complete file", async () => {
    downloadDirMock.mockResolvedValue("C:\\Users\\Tester\\Downloads");
    existsMock.mockResolvedValue(false);
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2]) })
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([3, 4, 5]) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-length": "5", "content-type": "application/pdf" }),
      body: { getReader: () => reader },
    } as unknown as Response);
    const progress: Array<{ loadedBytes: number; totalBytes: number | null }> = [];

    await downloadAttachmentWithAuth({
      attachment: {
        id: "media-file-progress",
        url: "/api/v1/media/media-file-progress",
        mime_type: "application/pdf",
        original_name: "progress.pdf",
        file_size: 5,
        kind: "file",
      },
      authToken: "secret-token",
      onProgress: (nextProgress) => progress.push(nextProgress),
    });

    expect(progress).toEqual([
      { loadedBytes: 0, totalBytes: 5 },
      { loadedBytes: 2, totalBytes: 5 },
      { loadedBytes: 5, totalBytes: 5 },
    ]);
    expect(writeFileMock).toHaveBeenCalledWith(
      "C:\\Users\\Tester\\Downloads/Vetra Desktop/progress.pdf",
      new Uint8Array([1, 2, 3, 4, 5]),
    );
  });

  it("reports loaded bytes without inventing a percentage when content length is missing", async () => {
    downloadDirMock.mockResolvedValue("C:\\Users\\Tester\\Downloads");
    existsMock.mockResolvedValue(false);
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: { getReader: () => reader },
    } as unknown as Response);
    const progress: Array<{ loadedBytes: number; totalBytes: number | null }> = [];

    await downloadAttachmentWithAuth({
      attachment: {
        id: "media-file-unknown-length",
        url: "/api/v1/media/media-file-unknown-length",
        mime_type: "application/pdf",
        original_name: "unknown.pdf",
        file_size: null,
        kind: "file",
      },
      authToken: "secret-token",
      onProgress: (nextProgress) => progress.push(nextProgress),
    });

    expect(progress).toEqual([
      { loadedBytes: 0, totalBytes: null },
      { loadedBytes: 3, totalBytes: null },
    ]);
  });

  it("does not write or map a file when the download is aborted", async () => {
    downloadDirMock.mockResolvedValue("C:\\Users\\Tester\\Downloads");
    existsMock.mockResolvedValue(false);
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetch).mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(downloadAttachmentWithAuth({
      attachment: {
        id: "media-file-aborted",
        url: "/api/v1/media/media-file-aborted",
        mime_type: "application/pdf",
        original_name: "aborted.pdf",
        file_size: 10,
        kind: "file",
      },
      authToken: "secret-token",
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("vetra-attachment-downloads")).toBeNull();
  });

  it("opens a mapped existing file without fetching it again", async () => {
    downloadDirMock.mockResolvedValue("C:\\Users\\Tester\\Downloads");
    existsMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(new Uint8Array([1, 2]), { status: 200 })));
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });

    const attachment = {
      id: "media-file-open",
      url: "/api/v1/media/media-file-open",
      mime_type: "application/pdf",
      original_name: "report.pdf",
      file_size: 2,
      kind: "file" as const,
    };
    await downloadAttachmentWithAuth({ attachment, authToken: "secret-token" });
    vi.mocked(fetch).mockClear();

    await expect(downloadAttachmentWithAuth({
      attachment,
      authToken: "secret-token",
    })).resolves.toBeUndefined();
    expect(openPathMock).toHaveBeenCalledWith("C:\\Users\\Tester\\Downloads/Vetra Desktop/report.pdf");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("invalidates legacy Telegram mappings without touching their files", async () => {
    downloadDirMock.mockResolvedValue("C:\\Users\\Test\\Downloads");
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    localStorage.setItem("vetra-attachment-downloads", JSON.stringify({
      legacyWindows: "C:\\Users\\Test\\Downloads\\Telegram Desktop\\file.pdf",
      legacyForward: "c:/users/test/downloads/telegram desktop/other.pdf",
    }));

    await expect(getAttachmentLocalState({
      id: "legacyWindows",
      url: "/api/v1/media/legacyWindows",
      mime_type: "application/pdf",
      original_name: "file.pdf",
      file_size: 1,
      kind: "file",
    })).resolves.toBe(false);
    await expect(getAttachmentLocalState({
      id: "legacyForward",
      url: "/api/v1/media/legacyForward",
      mime_type: "application/pdf",
      original_name: "other.pdf",
      file_size: 1,
      kind: "file",
    })).resolves.toBe(false);

    expect(localStorage.getItem("vetra-attachment-downloads")).toBe(JSON.stringify({}));
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("redownloads a legacy-mapped attachment into Vetra Desktop", async () => {
    downloadDirMock.mockResolvedValue("C:\\Users\\Test\\Downloads");
    existsMock.mockResolvedValue(false);
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    localStorage.setItem("vetra-attachment-downloads", JSON.stringify({
      legacy: "C:\\Users\\Test\\Downloads\\Telegram Desktop\\file.pdf",
    }));
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2]), { status: 200 }));

    await downloadAttachmentWithAuth({
      attachment: {
        id: "legacy",
        url: "/api/v1/media/legacy",
        mime_type: "application/pdf",
        original_name: "file.pdf",
        file_size: 2,
        kind: "file",
      },
      authToken: "secret-token",
    });

    const vetraPath = "C:\\Users\\Test\\Downloads/Vetra Desktop/file.pdf";
    expect(writeFileMock).toHaveBeenCalledWith(vetraPath, new Uint8Array([1, 2]));
    expect(JSON.parse(localStorage.getItem("vetra-attachment-downloads") || "{}")).toEqual({ legacy: vetraPath });
  });

  it("keeps a valid Vetra Desktop mapping downloaded when its file exists", async () => {
    downloadDirMock.mockResolvedValue("C:\\Users\\Test\\Downloads");
    existsMock.mockResolvedValue(true);
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    const vetraPath = "C:\\Users\\Test\\Downloads\\Vetra Desktop\\file.pdf";
    localStorage.setItem("vetra-attachment-downloads", JSON.stringify({ valid: vetraPath }));

    await expect(getAttachmentLocalState({
      id: "valid",
      url: "/api/v1/media/valid",
      mime_type: "application/pdf",
      original_name: "file.pdf",
      file_size: 1,
      kind: "file",
    })).resolves.toBe(true);
    expect(JSON.parse(localStorage.getItem("vetra-attachment-downloads") || "{}")).toEqual({ valid: vetraPath });
  });

  it("redownloads a deleted mapped file to the same path", async () => {
    downloadDirMock.mockResolvedValue("C:\\Users\\Tester\\Downloads");
    existsMock.mockResolvedValue(false);
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(new Uint8Array([1, 2]), { status: 200 })));
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });

    const attachment = {
      id: "media-file-redownload",
      url: "/api/v1/media/media-file-redownload",
      mime_type: "application/pdf",
      original_name: "deleted.pdf",
      file_size: 2,
      kind: "file" as const,
    };
    await downloadAttachmentWithAuth({ attachment, authToken: "secret-token" });
    writeFileMock.mockClear();
    await expect(downloadAttachmentWithAuth({ attachment, authToken: "secret-token" })).resolves.toBeUndefined();
    expect(writeFileMock).toHaveBeenCalledWith(
      "C:\\Users\\Tester\\Downloads/Vetra Desktop/deleted.pdf",
      new Uint8Array([1, 2]),
    );
  });

  it("adds a numeric suffix for an unrelated filename collision", async () => {
    downloadDirMock.mockResolvedValue("C:\\Users\\Tester\\Downloads");
    existsMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });

    await downloadAttachmentWithAuth({
      attachment: {
        id: "media-file-collision",
        url: "/api/v1/media/media-file-collision",
        mime_type: "application/pdf",
        original_name: "report.pdf",
        file_size: 1,
        kind: "file",
      },
      authToken: "secret-token",
    });
    expect(writeFileMock).toHaveBeenCalledWith(
      "C:\\Users\\Tester\\Downloads/Vetra Desktop/report (2).pdf",
      new Uint8Array([1]),
    );
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
