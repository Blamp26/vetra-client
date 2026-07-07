import type { Message } from "@/shared/types";

const DEBUG_STORAGE_KEY = "vetraDebugAttachments";
const DEBUG_WINDOW_KEY = "__VETRA_ATTACHMENT_DEBUG__";
const DEBUG_HISTORY_LIMIT = 400;

let debugIdCounter = 0;

export interface AttachmentDebugMeta {
  batchId: string;
  sendUnitId?: string | null;
  localAttachmentIds?: string[];
  unitIndex?: number;
  selectedAttachmentCount?: number;
}

export interface AttachmentDebugEntry {
  timestamp: string;
  event: string;
  batchId: string | null;
  sendUnitId: string | null;
  level: "info" | "warn";
  payload: Record<string, unknown>;
}

declare global {
  interface Window {
    __VETRA_ATTACHMENT_DEBUG__?: AttachmentDebugEntry[];
  }
}

function hasWindow() {
  return typeof window !== "undefined";
}

function readLocalStorageFlag() {
  if (!hasWindow()) return false;

  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isAttachmentDebugEnabled() {
  return import.meta.env.VITE_DEBUG_ATTACHMENTS === "1" || readLocalStorageFlag();
}

function nextDebugId(prefix: string) {
  debugIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${debugIdCounter.toString(36)}`;
}

export function createAttachmentBatchId() {
  return nextDebugId("attachment-batch");
}

export function createAttachmentSendUnitId(batchId: string, unitIndex: number) {
  return `${batchId}:unit-${unitIndex + 1}`;
}

function getDebugHistory() {
  if (!hasWindow()) return null;

  const existing = window[DEBUG_WINDOW_KEY];
  if (Array.isArray(existing)) return existing;

  window[DEBUG_WINDOW_KEY] = [];
  return window[DEBUG_WINDOW_KEY]!;
}

function pushDebugHistory(entry: AttachmentDebugEntry) {
  const history = getDebugHistory();
  if (!history) return;

  history.push(entry);
  if (history.length > DEBUG_HISTORY_LIMIT) {
    history.splice(0, history.length - DEBUG_HISTORY_LIMIT);
  }
}

export function summarizeUnknownShape(value: unknown): Record<string, unknown> {
  if (value == null) {
    return { type: String(value) };
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
    };
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      type: "object",
      keys: Object.keys(record).sort(),
      id: typeof record.id === "string" || typeof record.id === "number" ? record.id : undefined,
      media_file_id: typeof record.media_file_id === "string" ? record.media_file_id : undefined,
      media_file_ids_length: Array.isArray(record.media_file_ids) ? record.media_file_ids.length : undefined,
      mediaFileId: typeof record.mediaFileId === "string" ? record.mediaFileId : undefined,
      mediaFileIds_length: Array.isArray(record.mediaFileIds) ? record.mediaFileIds.length : undefined,
      attachments_length: Array.isArray(record.attachments) ? record.attachments.length : undefined,
    };
  }

  return {
    type: typeof value,
    value: String(value),
  };
}

export function summarizeMessageMedia(message: Partial<Message> & Record<string, unknown>) {
  const rawAttachmentsLength = Array.isArray(message.attachments)
    ? message.attachments.length
    : message.attachment
      ? 1
      : 0;
  const rawMediaFileIds = Array.isArray(message.media_file_ids)
    ? message.media_file_ids.filter((value): value is string => typeof value === "string")
    : [];
  const rawCamelMediaFileIds = Array.isArray(message.mediaFileIds)
    ? message.mediaFileIds.filter((value): value is string => typeof value === "string")
    : [];
  const normalizedMediaIds = rawMediaFileIds.length > 0
    ? rawMediaFileIds
    : rawCamelMediaFileIds;

  return {
    messageId:
      typeof message.id === "string" || typeof message.id === "number"
        ? message.id
        : null,
    media_file_id:
      typeof message.media_file_id === "string" ? message.media_file_id : null,
    media_file_ids: rawMediaFileIds,
    mediaFileId:
      typeof message.mediaFileId === "string" ? message.mediaFileId : null,
    mediaFileIds: rawCamelMediaFileIds,
    rawAttachmentsLength,
    normalizedMediaIds,
    isAlbum: normalizedMediaIds.length > 1,
  };
}

export function summarizeAttachmentLike(
  attachment: {
    id?: string | null;
    localAttachmentId?: string | null;
    name?: string | null;
    mimeType?: string | null;
    mime_type?: string | null;
    size?: number | null;
    file_size?: number | null;
    kind?: string | null;
    type?: string | null;
  },
) {
  return {
    localAttachmentId: attachment.localAttachmentId ?? attachment.id ?? null,
    name: attachment.name ?? null,
    mimeType: attachment.mimeType ?? attachment.mime_type ?? attachment.type ?? null,
    size: attachment.size ?? attachment.file_size ?? null,
    kind: attachment.kind ?? null,
  };
}

export function logAttachmentDebug(
  event: string,
  payload: Record<string, unknown>,
  options: {
    batchId?: string | null;
    sendUnitId?: string | null;
    level?: "info" | "warn";
    table?: Array<Record<string, unknown>>;
  } = {},
) {
  if (!isAttachmentDebugEnabled()) return;

  const entry: AttachmentDebugEntry = {
    timestamp: new Date().toISOString(),
    event,
    batchId: options.batchId ?? null,
    sendUnitId: options.sendUnitId ?? null,
    level: options.level ?? "info",
    payload,
  };

  pushDebugHistory(entry);

  const label = [
    "[VETRA attachments]",
    event,
    entry.batchId ? `batch=${entry.batchId}` : null,
    entry.sendUnitId ? `unit=${entry.sendUnitId}` : null,
  ].filter(Boolean).join(" ");

  if (entry.level === "warn") {
    console.warn(label, payload);
    if (options.table && options.table.length > 0) {
      console.table(options.table);
    }
    return;
  }

  console.groupCollapsed(label);
  console.log(payload);
  if (options.table && options.table.length > 0) {
    console.table(options.table);
  }
  console.groupEnd();
}
