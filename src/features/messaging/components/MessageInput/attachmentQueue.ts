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

export function getAttachmentSendUnitType(unit: AttachmentSendUnit) {
  if (unit.kind === "photo") {
    return unit.attachments.length > 1 ? "photo_album" : "single_photo";
  }

  return "document";
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
    return `Send ${attachments.length} Photo${attachments.length === 1 ? "" : "s"}`;
  }

  const allFiles = attachments.every((attachment) => attachment.kind !== "photo");
  if (allFiles) {
    const fileCount = attachments.length;
    return `Send ${fileCount} File${fileCount === 1 ? "" : "s"}`;
  }

  return `Send ${attachments.length} Item${attachments.length === 1 ? "" : "s"}`;
}

export function getAttachmentReviewSendLabel(
  isSending: boolean,
): string {
  if (isSending) return "Sending...";
  return "Send";
}
