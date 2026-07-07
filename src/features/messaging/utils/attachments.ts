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
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "application/pdf": [".pdf"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/ogg": [".ogv", ".ogg"],
} as const;

const MIME_TYPE_ALIASES: Record<string, keyof typeof ALLOWED_ATTACHMENT_TYPES> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
};

export const MESSAGE_ATTACHMENT_ACCEPT = Object.keys(
  ALLOWED_ATTACHMENT_TYPES,
).join(",");

type AttachmentLike = {
  attachment?: Attachment | null;
  attachments?: Attachment[] | null;
  media_file_id?: string | null;
  media_file_ids?: string[] | null;
  media_mime_type?: string | null;
  media_mime_types?: string[] | null;
};

type PreviewLike = AttachmentLike & {
  content?: string | null;
  preview?: string | null;
  attachment_kind?: AttachmentKind | null;
  attachment_name?: string | null;
  attachment_mime_type?: string | null;
};

function normalizeMimeType(mimeType?: string | null) {
  const normalized = mimeType?.toLowerCase().trim() || null;
  if (!normalized) return null;
  return MIME_TYPE_ALIASES[normalized] ?? normalized;
}

function getFileExtension(fileName?: string | null) {
  const match = fileName?.trim().toLowerCase().match(/(\.[a-z0-9]+)$/i);
  return match?.[1] ?? null;
}

function getMimeTypeFromExtension(extension?: string | null) {
  if (!extension) return null;

  for (const [mimeType, extensions] of Object.entries(ALLOWED_ATTACHMENT_TYPES)) {
    if (extensions.includes(extension as never)) {
      return mimeType as keyof typeof ALLOWED_ATTACHMENT_TYPES;
    }
  }

  return null;
}

export function resolveAttachmentMimeType(
  mimeType?: string | null,
  fileName?: string | null,
) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const extensionMimeType = getMimeTypeFromExtension(getFileExtension(fileName));

  if (
    normalizedMimeType &&
    normalizedMimeType in ALLOWED_ATTACHMENT_TYPES
  ) {
    return normalizedMimeType as keyof typeof ALLOWED_ATTACHMENT_TYPES;
  }

  if (extensionMimeType) {
    return extensionMimeType;
  }

  return null;
}

function normalizeAttachment(attachment: Attachment | null | undefined): Attachment | null {
  if (!attachment) return null;

  const url = resolveAttachmentUrl(attachment.url);
  if (!url) return null;

  return {
    ...attachment,
    url,
  };
}

function fallbackAttachmentName(kind: AttachmentKind) {
  if (kind === "photo") return "Photo";
  if (kind === "video") return "Video";
  return "File";
}

export function inferAttachmentKind(
  mimeType?: string | null,
  fileName?: string | null,
): AttachmentKind {
  const normalized = resolveAttachmentMimeType(mimeType, fileName);
  if (normalized?.startsWith("image/")) return "photo";
  if (normalized?.startsWith("video/")) return "video";
  return "file";
}

export function classifyPendingAttachment(file: File): {
  kind: AttachmentKind;
  mimeType: string;
} | null {
  const mimeType = resolveAttachmentMimeType(file.type, file.name);
  if (!mimeType) return null;

  return {
    kind: inferAttachmentKind(mimeType, file.name),
    mimeType,
  };
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

export function getMessageAttachments(source: AttachmentLike): Attachment[] {
  const normalizedAttachments = source.attachments
    ?.map((attachment) => normalizeAttachment(attachment))
    .filter((attachment): attachment is Attachment => attachment !== null) ?? [];
  const singleAttachment = normalizeAttachment(source.attachment);
  const groupedMediaFileIds =
    source.media_file_ids?.filter((mediaFileId): mediaFileId is string => Boolean(mediaFileId)) ?? [];

  if (groupedMediaFileIds.length > 1) {
    const attachmentsById = new Map<string, Attachment>();

    normalizedAttachments.forEach((attachment) => {
      attachmentsById.set(attachment.id, attachment);
    });

    if (singleAttachment && !attachmentsById.has(singleAttachment.id)) {
      attachmentsById.set(singleAttachment.id, singleAttachment);
    }

    const fallbackMimeType =
      resolveAttachmentMimeType(
        source.media_mime_type ??
          normalizedAttachments[0]?.mime_type ??
          singleAttachment?.mime_type,
      ) ??
      "image/jpeg";

    return groupedMediaFileIds.map((mediaFileId, index) => {
      const existingAttachment = attachmentsById.get(mediaFileId);
      if (existingAttachment) return existingAttachment;

      const mimeType =
        resolveAttachmentMimeType(
          source.media_mime_types?.[index] ??
            source.media_mime_type ??
            singleAttachment?.mime_type ??
            normalizedAttachments[index]?.mime_type ??
            fallbackMimeType,
        ) ?? fallbackMimeType;

      return {
        id: mediaFileId,
        url: `${API_BASE_URL}/media/${mediaFileId}`,
        mime_type: mimeType,
        original_name: null,
        file_size: null,
        kind: inferAttachmentKind(mimeType),
      };
    });
  }

  if (normalizedAttachments.length > 0) {
    return normalizedAttachments;
  }

  if (singleAttachment) return [singleAttachment];

  if (groupedMediaFileIds.length === 1) {
    const mimeType =
      resolveAttachmentMimeType(source.media_mime_types?.[0] ?? source.media_mime_type) ||
      "application/octet-stream";

    return [{
      id: groupedMediaFileIds[0],
      url: `${API_BASE_URL}/media/${groupedMediaFileIds[0]}`,
      mime_type: mimeType,
      original_name: null,
      file_size: null,
      kind: inferAttachmentKind(mimeType),
    }];
  }

  if (!source.media_file_id) return [];

  const mimeType =
    resolveAttachmentMimeType(source.media_mime_type) || "application/octet-stream";

  return [{
    id: source.media_file_id,
    url: `${API_BASE_URL}/media/${source.media_file_id}`,
    mime_type: mimeType,
    original_name: null,
    file_size: null,
    kind: inferAttachmentKind(mimeType),
  }];
}

export function getMessageAttachment(source: AttachmentLike): Attachment | null {
  return getMessageAttachments(source)[0] ?? null;
}

export function isMessageForwardable(message: AttachmentLike): boolean {
  return getMessageAttachments(message).length === 0;
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
  const attachments = getMessageAttachments(source);
  if (attachments.length > 1) {
    const allPhotos = attachments.every((attachment) => attachment.kind === "photo");
    if (allPhotos) return "Photos";

    const allVideos = attachments.every((attachment) => attachment.kind === "video");
    if (allVideos) return "Videos";

    return "Files";
  }

  const attachment = attachments[0] ?? null;
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
  const attachments = getMessageAttachments(message);
  const attachment = attachments[0] ?? null;

  return {
    id: message.id,
    content: message.content,
    preview: getPreviewText(message, "Attachment"),
    inserted_at: message.inserted_at,
    sender_id: message.sender_id,
    sender_public_id: message.sender_public_id,
    status: message.status,
    media_file_id: message.media_file_id ?? null,
    media_file_ids: message.media_file_ids ?? (attachments.length > 1 ? attachments.map((item) => item.id) : null),
    media_mime_type: message.media_mime_type ?? null,
    media_mime_types: message.media_mime_types ?? (attachments.length > 1 ? attachments.map((item) => item.mime_type) : null),
    attachment,
    attachments: attachments.length > 0 ? attachments : null,
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
    media_file_ids: null,
    media_mime_type: summary.media_type ?? summary.attachment_mime_type ?? null,
    media_mime_types: null,
    attachment: null,
    attachments: null,
    attachment_kind: summary.attachment_kind ?? null,
    attachment_name: summary.attachment_name ?? null,
    attachment_size: summary.attachment_size ?? null,
    attachment_mime_type: summary.attachment_mime_type ?? summary.media_type ?? null,
  };
}

export function validateAttachmentFile(file: File): string | null {
  const rawMimeType = normalizeMimeType(file.type);
  const extension = getFileExtension(file.name);
  const mimeType = resolveAttachmentMimeType(file.type, file.name);

  if (!mimeType || !extension) {
    return "Unsupported file type. Allowed: PNG, JPG, JPEG, GIF, WEBP, AVIF, HEIC, HEIF, PDF, MP4, WEBM, OGG.";
  }

  if (
    rawMimeType &&
    rawMimeType in ALLOWED_ATTACHMENT_TYPES &&
    !ALLOWED_ATTACHMENT_TYPES[rawMimeType as keyof typeof ALLOWED_ATTACHMENT_TYPES].includes(extension as never)
  ) {
    return "File extension does not match the selected file type.";
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `File is too large. Max ${formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)}.`;
  }

  return null;
}
