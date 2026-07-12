import type { Attachment } from "@/shared/types";
import { downloadDir, join } from "@tauri-apps/api/path";
import { STORAGE_KEYS, storage } from "@/shared/utils/storage";
import { getAttachmentDisplayName, resolveAttachmentUrl } from "./attachments";

type AttachmentDownloadOptions = {
  attachment: Attachment;
  authToken: string | null;
  signal?: AbortSignal;
  onProgress?: (progress: AttachmentDownloadProgress) => void;
};

export type AttachmentDownloadProgress = {
  loadedBytes: number;
  totalBytes: number | null;
};

const ATTACHMENT_DOWNLOADS_KEY = "vetra-attachment-downloads";
const TELEGRAM_DOWNLOAD_FOLDER = "Telegram Desktop";

function getAttachmentDownloadMap() {
  return storage.get<Record<string, string>>(ATTACHMENT_DOWNLOADS_KEY) ?? {};
}

function setAttachmentDownloadPath(attachmentId: string, path: string) {
  storage.set(ATTACHMENT_DOWNLOADS_KEY, {
    ...getAttachmentDownloadMap(),
    [attachmentId]: path,
  });
}

async function fetchAttachmentBlobInternal(
  url: string,
  authToken: string | null,
  options: Pick<AttachmentDownloadOptions, "signal" | "onProgress"> = {},
): Promise<Blob> {
  const response = await fetch(url, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    signal: options.signal,
  });

  if (!response.ok) {
    if (response.status === 401) {
      storage.remove(STORAGE_KEYS.TOKEN);
      storage.remove(STORAGE_KEYS.USER);
    }
    throw new Error(`Attachment request failed: ${response.status}`);
  }

  const totalBytesHeader = response.headers.get("content-length");
  const parsedTotalBytes = totalBytesHeader ? Number(totalBytesHeader) : NaN;
  const totalBytes = Number.isFinite(parsedTotalBytes) && parsedTotalBytes >= 0
    ? parsedTotalBytes
    : null;
  const reader = response.body?.getReader();

  if (!reader) {
    const blob = await response.blob();
    options.onProgress?.({ loadedBytes: blob.size, totalBytes: totalBytes ?? blob.size });
    return blob;
  }

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  options.onProgress?.({ loadedBytes: 0, totalBytes });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      loadedBytes += value.byteLength;
      options.onProgress?.({ loadedBytes, totalBytes });
    }
  } finally {
    if (options.signal?.aborted) {
      await reader.cancel().catch(() => undefined);
    }
  }

  return new Blob(chunks as BlobPart[], {
    type: response.headers.get("content-type") || "application/octet-stream",
  });
}

function revokeObjectUrlLater(url: string) {
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function sanitizeWindowsFileName(fileName: string) {
  const trimmed = fileName.trim() || "file";
  const extensionMatch = trimmed.match(/(\.[^.]*)$/);
  const baseName = (extensionMatch ? trimmed.slice(0, -extensionMatch[1].length) : trimmed)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[ .]+$/g, "") || "file";
  const extension = extensionMatch?.[1]
    ?.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[ .]+$/g, "");
  return `${baseName}${extension || ""}`;
}

async function getAutomaticDownloadDirectory() {
  const downloadsPath = await downloadDir();
  if (!downloadsPath) throw new Error("Downloads directory unavailable");
  const directory = await join(downloadsPath, TELEGRAM_DOWNLOAD_FOLDER);
  const { mkdir } = await import("@tauri-apps/plugin-fs");
  await mkdir(directory, { recursive: true });
  return directory;
}

function splitFileName(fileName: string) {
  const match = fileName.match(/^(.*?)(\.[^.]*)?$/);
  return { baseName: match?.[1] || "file", extension: match?.[2] || "" };
}

async function chooseAutomaticDownloadPath(
  directory: string,
  fileName: string,
  exists: (path: string) => Promise<boolean>,
) {
  const { baseName, extension } = splitFileName(fileName);
  let suffix = 0;
  while (true) {
    const candidateName = suffix === 0
      ? fileName
      : `${baseName} (${suffix})${extension}`;
    const candidatePath = await join(directory, candidateName);
    if (!(await exists(candidatePath))) return candidatePath;
    suffix += 1;
  }
}

export async function fetchAttachmentBlob(
  attachment: Attachment,
  authToken: string | null,
): Promise<Blob> {
  const url = resolveAttachmentUrl(attachment.url);

  if (!url) {
    throw new Error("Attachment URL is missing");
  }

  return fetchAttachmentBlobInternal(url, authToken);
}

export async function getAttachmentLocalState(attachment: Attachment): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const mappedPath = getAttachmentDownloadMap()[attachment.id];
  if (!mappedPath) return false;
  const { exists } = await import("@tauri-apps/plugin-fs");
  return exists(mappedPath);
}

export async function downloadAttachmentWithAuth({
  attachment,
  authToken,
  signal,
  onProgress,
}: AttachmentDownloadOptions): Promise<void> {
  const attachmentUrl = resolveAttachmentUrl(attachment.url);
  if (!attachmentUrl) throw new Error("Attachment URL is missing");

  if (isTauriRuntime()) {
    const [{ exists, writeFile }, { openPath }] = await Promise.all([
      import("@tauri-apps/plugin-fs"),
      import("@tauri-apps/plugin-opener"),
    ]);
    const mappedPath = getAttachmentDownloadMap()[attachment.id];

    if (mappedPath && await exists(mappedPath)) {
      await openPath(mappedPath);
      return;
    }

    const directory = await getAutomaticDownloadDirectory();
    const targetPath = mappedPath || await chooseAutomaticDownloadPath(
      directory,
      sanitizeWindowsFileName(getAttachmentDisplayName(attachment)),
      exists,
    );
    const blob = await fetchAttachmentBlobInternal(
      attachmentUrl,
      authToken,
      { signal, onProgress },
    );
    await writeFile(targetPath, new Uint8Array(await blob.arrayBuffer()));
    setAttachmentDownloadPath(attachment.id, targetPath);
    return;
  }

  const blob = await fetchAttachmentBlobInternal(
    attachmentUrl,
    authToken,
    { signal, onProgress },
  );
  const fileName = getAttachmentDisplayName(attachment);

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    revokeObjectUrlLater(objectUrl);
  }
}

export async function openAttachmentWithAuth({
  attachment,
  authToken,
}: AttachmentDownloadOptions): Promise<void> {
  const blob = await fetchAttachmentBlob(attachment, authToken);
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");

  if (!opened) {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }

  revokeObjectUrlLater(objectUrl);
}
