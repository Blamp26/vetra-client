import type { Attachment } from "@/shared/types";
import { STORAGE_KEYS, storage } from "@/shared/utils/storage";
import { getAttachmentDisplayName, resolveAttachmentUrl } from "./attachments";

type AttachmentDownloadOptions = {
  attachment: Attachment;
  authToken: string | null;
};

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

function getSaveFilter(attachment: Attachment) {
  const fileName = getAttachmentDisplayName(attachment);
  const extension = fileName.match(/\.([a-z0-9]+)$/i)?.[1];
  return extension
    ? [{ name: attachment.mime_type || "File", extensions: [extension] }]
    : undefined;
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
  const blob = await fetchAttachmentBlob(attachment, authToken);
  const fileName = getAttachmentDisplayName(attachment);

  if (isTauriRuntime()) {
    const [{ save }, { writeFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const destination = await save({
      defaultPath: fileName,
      filters: getSaveFilter(attachment),
    });
    if (!destination) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(destination, bytes);
    return;
  }

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
