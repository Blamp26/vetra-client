import { API_BASE_URL } from "@/api/base";
import type {
  Attachment,
  AttachmentKind,
  Message,
  PreviewMessage,
  RoomMessageSummary,
} from "@/shared/types";

export const MAX_ATTACHMENT_SIZE_BYTES = 15_000_000;

const ALLOWED_ATTACHMENT_TYPES = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "application/pdf": [".pdf"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/ogg": [".ogv", ".ogg"],
} as const;

export const MESSAGE_ATTACHMENT_ACCEPT = Object.keys(
  ALLOWED_ATTACHMENT_TYPES,
).join(",");

type AttachmentLike = {
  attachment?: Attachment | null;
  media_file_id?: string | null;
  media_mime_type?: string | null;
};

type PreviewLike = AttachmentLike & {
  content?: string | null;
  preview?: string | null;
  attachment_kind?: AttachmentKind | null;
  attachment_name?: string | null;
  attachment_mime_type?: string | null;
};

function normalizeMimeType(mimeType?: string | null) {
  return mimeType?.toLowerCase().trim() || null;
}

function fallbackAttachmentName(kind: AttachmentKind) {
  if (kind === "photo") return "Photo";
  if (kind === "video") return "Video";
  return "File";
}

export function inferAttachmentKind(
  mimeType?: string | null,
): AttachmentKind {
  const normalized = normalizeMimeType(mimeType);
  if (normalized?.startsWith("image/")) return "photo";
  if (normalized?.startsWith("video/")) return "video";
  return "file";
}

export function resolveAttachmentUrl(url?: string | null): string | null {
  if (!url) return null;

  try {
    return new URL(url).toString();
  } catch {
    const apiBase = API_BASE_URL.replace(/\/+$/, "");
    const apiOrigin = new URL(apiBase).origin;

    if (url.startsWith("/")) {
      return `${apiOrigin}${url}`;
    }

    return `${apiBase}/${url.replace(/^\/+/, "")}`;
  }
}

export function getMessageAttachment(source: AttachmentLike): Attachment | null {
  if (source.attachment) {
    const url = resolveAttachmentUrl(source.attachment.url);
    if (!url) return null;

    return {
      ...source.attachment,
      url,
    };
  }

  if (!source.media_file_id) return null;

  return {
    id: source.media_file_id,
    url: `${API_BASE_URL}/media/${source.media_file_id}`,
    mime_type:
      normalizeMimeType(source.media_mime_type) || "application/octet-stream",
    original_name: null,
    file_size: null,
    kind: inferAttachmentKind(source.media_mime_type),
  };
}

export function isMessageForwardable(message: AttachmentLike): boolean {
  return getMessageAttachment(message) == null;
}

export function getAttachmentKindLabel(kind: AttachmentKind): string {
  if (kind === "photo") return "Photo";
  if (kind === "video") return "Video";
  return "File";
}

export function getAttachmentDisplayName(
  attachment: Attachment | null,
): string {
  if (!attachment) return "Attachment";
  return attachment.original_name || fallbackAttachmentName(attachment.kind);
}

export function getAttachmentTypeLabel(
  attachment: Attachment | null,
): string | null {
  if (!attachment) return null;
  if (attachment.mime_type === "application/pdf") return "PDF";
  if (attachment.kind === "photo") return "Photo";
  if (attachment.kind === "video") return "Video";
  return attachment.mime_type || "File";
}

export function formatAttachmentSize(fileSize?: number | null): string {
  if (fileSize == null || Number.isNaN(fileSize)) return "Unknown size";

  if (fileSize < 1024) return `${fileSize} B`;
  if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(1)} KB`;
  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentOnlyPreview(source: PreviewLike): string | null {
  const attachment = getMessageAttachment(source);
  const kind = attachment?.kind ?? source.attachment_kind ?? inferAttachmentKind(source.attachment_mime_type ?? source.media_mime_type);
  const name = attachment?.original_name ?? source.attachment_name ?? null;

  if (kind === "photo") return "Photo";
  if (kind === "video") return "Video";
  if (name) return `File: ${name}`;
  return attachment || source.attachment_kind || source.media_file_id || source.attachment_mime_type || source.media_mime_type
    ? "File"
    : null;
}

export function getPreviewText(
  source: PreviewLike | null | undefined,
  emptyFallback = "No messages yet",
): string {
  if (!source) return emptyFallback;

  const preview = source.preview?.trim();
  if (preview) return preview;

  const content = source.content?.trim();
  if (content) return content;

  return attachmentOnlyPreview(source) || emptyFallback;
}

export function buildPreviewMessage(
  message: Message,
): PreviewMessage {
  const attachment = getMessageAttachment(message);

  return {
    id: message.id,
    content: message.content,
    preview: getPreviewText(message, "Attachment"),
    inserted_at: message.inserted_at,
    sender_id: message.sender_id,
    sender_public_id: message.sender_public_id,
    status: message.status,
    media_file_id: message.media_file_id ?? null,
    media_mime_type: message.media_mime_type ?? null,
    attachment,
    attachment_kind: attachment?.kind ?? null,
    attachment_name: attachment?.original_name ?? null,
    attachment_size: attachment?.file_size ?? null,
    attachment_mime_type: attachment?.mime_type ?? message.media_mime_type ?? null,
  };
}

export function buildPreviewMessageFromSummary(
  summary: RoomMessageSummary,
): PreviewMessage {
  return {
    id: summary.message_id,
    content: summary.preview,
    preview: summary.preview,
    inserted_at: summary.inserted_at,
    sender_id: summary.sender_id,
    sender_public_id: summary.sender_public_id,
    status: "sent",
    media_file_id: null,
    media_mime_type: summary.media_type ?? summary.attachment_mime_type ?? null,
    attachment: null,
    attachment_kind: summary.attachment_kind ?? null,
    attachment_name: summary.attachment_name ?? null,
    attachment_size: summary.attachment_size ?? null,
    attachment_mime_type: summary.attachment_mime_type ?? summary.media_type ?? null,
  };
}

export function validateAttachmentFile(file: File): string | null {
  const mimeType = normalizeMimeType(file.type);
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;

  if (!mimeType || !(mimeType in ALLOWED_ATTACHMENT_TYPES)) {
    return "Unsupported file type. Allowed: PNG, JPG, GIF, PDF, MP4, WEBM, OGG.";
  }

  if (!ALLOWED_ATTACHMENT_TYPES[mimeType as keyof typeof ALLOWED_ATTACHMENT_TYPES].includes(extension as never)) {
    return "File extension does not match the selected file type.";
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `File is too large. Max ${formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)}.`;
  }

  return null;
}
