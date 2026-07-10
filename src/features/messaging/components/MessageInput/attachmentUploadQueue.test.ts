import { describe, expect, it, vi } from "vitest";

import {
  AttachmentUploadError,
  getUploadRetryDelayMs,
  uploadAttachmentsBounded,
} from "./attachmentQueue";

describe("attachment upload queue", () => {
  it("preserves result order while limiting concurrent uploads", async () => {
    let active = 0;
    let maximumActive = 0;
    const upload = vi.fn(async (item: number) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return `media-${item}`;
    });

    await expect(uploadAttachmentsBounded([1, 2, 3, 4], upload, { concurrency: 2 }))
      .resolves.toEqual(["media-1", "media-2", "media-3", "media-4"]);
    expect(maximumActive).toBeLessThanOrEqual(2);
  });

  it("retries only the rate-limited file and honors Retry-After", async () => {
    const attempts = new Map<number, number>();
    const upload = vi.fn(async (item: number) => {
      const attempt = (attempts.get(item) ?? 0) + 1;
      attempts.set(item, attempt);
      if (item === 2 && attempt === 1) {
        throw new AttachmentUploadError("rate limited", 429, 0);
      }
      return `media-${item}`;
    });

    await expect(uploadAttachmentsBounded([1, 2], upload, { concurrency: 2 }))
      .resolves.toEqual(["media-1", "media-2"]);
    expect(attempts.get(1)).toBe(1);
    expect(attempts.get(2)).toBe(2);
  });

  it("keeps fallback retry delay bounded", () => {
    expect(getUploadRetryDelayMs(1, null, 0)).toBe(250);
    expect(getUploadRetryDelayMs(4, null, 1)).toBeLessThanOrEqual(5_000);
  });

  it("does not return partial results after a terminal upload failure", async () => {
    const upload = vi.fn(async (item: number) => {
      if (item === 2) throw new AttachmentUploadError("failed", 500);
      return `media-${item}`;
    });

    await expect(uploadAttachmentsBounded([1, 2, 3], upload, { concurrency: 1 }))
      .rejects.toMatchObject({ status: 500 });
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
