import type { Attachment } from "@/shared/types";
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
    throw new Error(`Attachment request failed: ${response.status}`);
  }

  return response.blob();
}

function revokeObjectUrlLater(url: string) {
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = getAttachmentDisplayName(attachment);
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
