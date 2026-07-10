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
  kind: "visual" | "file";
  attachments: PendingAttachment[];
}

export const MAX_VISUAL_ATTACHMENTS_PER_MESSAGE = 9;
export const UPLOAD_CONCURRENCY = 3;
export const MAX_UPLOAD_ATTEMPTS = 4;
const UPLOAD_BACKOFF_BASE_MS = 250;
const UPLOAD_BACKOFF_MAX_MS = 5_000;

function isVisualAttachment(kind: AttachmentKind) {
  return kind === "photo" || kind === "video";
}

export class AttachmentUploadError extends Error {
  status: number | null;
  retryAfterMs: number | null;

  constructor(message: string, status: number | null = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = "AttachmentUploadError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function chunkVisualAttachments<T>(attachments: T[], maxPerMessage = MAX_VISUAL_ATTACHMENTS_PER_MESSAGE): T[][] {
  if (maxPerMessage <= 0) throw new Error("maxPerMessage must be positive");

  const chunks: T[][] = [];
  for (let index = 0; index < attachments.length; index += maxPerMessage) {
    chunks.push(attachments.slice(index, index + maxPerMessage));
  }
  return chunks;
}

export function parseRetryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - now);
}

export function getUploadRetryDelayMs(
  retryNumber: number,
  retryAfterMs: number | null,
  random = Math.random(),
): number {
  if (retryAfterMs !== null) return Math.max(0, retryAfterMs);

  const backoff = Math.min(
    UPLOAD_BACKOFF_MAX_MS,
    UPLOAD_BACKOFF_BASE_MS * (2 ** Math.max(0, retryNumber - 1)),
  );
  return Math.min(UPLOAD_BACKOFF_MAX_MS, backoff + Math.round(Math.max(0, random) * 100));
}

function abortError() {
  return new DOMException("Upload cancelled", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function uploadAttachmentsBounded<T>(
  items: T[],
  upload: (item: T, index: number, signal: AbortSignal) => Promise<string>,
  options: {
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<string[]> {
  if (items.length === 0) return [];

  const concurrency = Math.max(1, Math.min(options.concurrency ?? UPLOAD_CONCURRENCY, items.length));
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const results: string[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;
  let failure: unknown = null;

  const uploadWithRetry = async (item: T, index: number) => {
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
      throwIfAborted(controller.signal);
      try {
        return await upload(item, index, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        const uploadError = error instanceof AttachmentUploadError ? error : null;
        if (uploadError?.status !== 429 || attempt === MAX_UPLOAD_ATTEMPTS) throw error;
        await waitForRetry(
          getUploadRetryDelayMs(attempt, uploadError.retryAfterMs),
          controller.signal,
        );
      }
    }

    throw new Error("Upload retry loop ended unexpectedly");
  };

  const worker = async () => {
    while (true) {
      throwIfAborted(controller.signal);
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      try {
        results[index] = await uploadWithRetry(items[index], index);
        completed += 1;
        options.onProgress?.(completed, items.length);
      } catch (error) {
        failure ??= error;
        controller.abort();
        throw error;
      }
    }
  };

  let workerError: unknown = null;
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } catch (error) {
    // Prefer the original upload failure over abort errors from sibling workers.
    workerError = failure ?? error;
  } finally {
    options.signal?.removeEventListener("abort", abortFromCaller);
  }

  if (workerError) throw workerError;
  if (failure) throw failure;
  return results;
}

export function getAttachmentSendUnitType(unit: AttachmentSendUnit) {
  if (unit.kind === "visual") {
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
    if (!isVisualAttachment(current.kind)) {
      units.push({ kind: "file", attachments: [current] });
      index += 1;
      continue;
    }

    const visualRun: PendingAttachment[] = [];
    while (index < attachments.length && isVisualAttachment(attachments[index].kind)) {
      visualRun.push(attachments[index]);
      index += 1;
    }

    for (const chunk of chunkVisualAttachments(visualRun)) {
      units.push({
        kind: "visual",
        attachments: chunk,
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

  const allFiles = attachments.every((attachment) => !isVisualAttachment(attachment.kind));
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
