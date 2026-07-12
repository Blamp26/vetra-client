import type { Attachment } from "@/shared/types";
import { downloadDir, join } from "@tauri-apps/api/path";
import { STORAGE_KEYS, storage } from "@/shared/utils/storage";
import { getAttachmentDisplayName, resolveAttachmentUrl } from "./attachments";

type AttachmentDownloadOptions = {
  attachment: Attachment;
  authToken: string | null;
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
): Promise<Blob> {
  const response = await fetch(url, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });

  if (!response.ok) {
    if (response.status === 401) {
      storage.remove(STORAGE_KEYS.TOKEN);
      storage.remove(STORAGE_KEYS.USER);
    }
    throw new Error(`Attachment request failed: ${response.status}`);
  }

  return response.blob();
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

export async function downloadAttachmentWithAuth({
  attachment,
  authToken,
}: AttachmentDownloadOptions): Promise<void> {
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
    const blob = await fetchAttachmentBlob(attachment, authToken);
    await writeFile(targetPath, new Uint8Array(await blob.arrayBuffer()));
    setAttachmentDownloadPath(attachment.id, targetPath);
    return;
  }

  const blob = await fetchAttachmentBlob(attachment, authToken);
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
