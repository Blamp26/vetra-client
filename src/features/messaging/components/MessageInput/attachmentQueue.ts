import type { AttachmentKind } from "@/shared/types";

export interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  previewUrl: string | null;
}

export interface AttachmentSendUnit {
  kind: "photo" | "file";
  attachments: PendingAttachment[];
}

export function buildAttachmentSendUnits(
  attachments: PendingAttachment[],
): AttachmentSendUnit[] {
  const units: AttachmentSendUnit[] = [];

  for (let index = 0; index < attachments.length; ) {
    const current = attachments[index];
    if (current.kind !== "photo") {
      units.push({ kind: "file", attachments: [current] });
      index += 1;
      continue;
    }

    const photoRun: PendingAttachment[] = [];
    while (index < attachments.length && attachments[index].kind === "photo") {
      photoRun.push(attachments[index]);
      index += 1;
    }

    for (let chunkStart = 0; chunkStart < photoRun.length; chunkStart += 9) {
      units.push({
        kind: "photo",
        attachments: photoRun.slice(chunkStart, chunkStart + 9),
      });
    }
  }

  return units;
}

export function getAttachmentReviewTitle(
  attachments: PendingAttachment[],
): string {
  if (attachments.length === 0) return "Send Attachments";

  const allPhotos = attachments.every((attachment) => attachment.kind === "photo");
  if (allPhotos) {
    return attachments.length === 1 ? "Send Photo" : "Send Photos";
  }

  const allFiles = attachments.every((attachment) => attachment.kind === "file");
  if (allFiles) return "Send Files";

  return "Send Attachments";
}

export function getAttachmentReviewSendLabel(
  attachments: PendingAttachment[],
  isSending: boolean,
): string {
  if (isSending) return "Sending...";

  const title = getAttachmentReviewTitle(attachments);
  if (title === "Send Photo") return "Send Photo";
  if (title === "Send Photos") return "Send Photos";
  if (title === "Send Files") return "Send Files";
  return "Send Attachments";
}
