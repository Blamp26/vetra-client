import { describe, expect, it } from "vitest";

import {
  buildAttachmentSendUnits,
  chunkVisualAttachments,
  getAttachmentReviewTitle,
  type PendingAttachment,
} from "./attachmentQueue";

function makeAttachment(
  id: string,
  kind: PendingAttachment["kind"],
): PendingAttachment {
  const extension =
    kind === "photo" ? "png" : kind === "video" ? "mp4" : "pdf";
  const mimeType =
    kind === "photo" ? "image/png" : kind === "video" ? "video/mp4" : "application/pdf";

  return {
    id,
    file: new File([new Uint8Array(16)], `${id}.${extension}`),
    name: `${id}.${extension}`,
    mimeType,
    size: 16,
    kind,
    previewUrl: kind === "photo" ? `blob:${id}` : null,
  };
}

describe("attachmentQueue helpers", () => {
  it.each([
    [0, []],
    [1, [1]],
    [9, [9]],
    [10, [9, 1]],
    [12, [9, 3]],
    [18, [9, 9]],
    [20, [9, 9, 2]],
  ])("chunks %i visual attachments as %j", (count, expected) => {
    const chunks = chunkVisualAttachments(Array.from({ length: count }, (_, index) => index + 1));
    expect(chunks.map((chunk) => chunk.length)).toEqual(expected);
    expect(chunks.flat()).toEqual(Array.from({ length: count }, (_, index) => index + 1));
  });

  it("builds exactly one photo album unit for two photos", () => {
    const units = buildAttachmentSendUnits([
      makeAttachment("photo-1", "photo"),
      makeAttachment("photo-2", "photo"),
    ]);

    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe("visual");
    expect(units[0].attachments).toHaveLength(2);
  });

  it("builds exactly one photo album unit for four photos", () => {
    const units = buildAttachmentSendUnits(
      Array.from({ length: 4 }, (_, index) => makeAttachment(`photo-${index + 1}`, "photo")),
    );

    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe("visual");
    expect(units[0].attachments.map((attachment) => attachment.id)).toEqual([
      "photo-1",
      "photo-2",
      "photo-3",
      "photo-4",
    ]);
  });

  it("builds exactly one photo album unit for nine photos", () => {
    const units = buildAttachmentSendUnits(
      Array.from({ length: 9 }, (_, index) => makeAttachment(`photo-${index + 1}`, "photo")),
    );

    expect(units).toHaveLength(1);
    expect(units[0].attachments).toHaveLength(9);
  });

  it("splits ten photos into 9 plus 1 while preserving order", () => {
    const units = buildAttachmentSendUnits(
      Array.from({ length: 10 }, (_, index) => makeAttachment(`photo-${index + 1}`, "photo")),
    );

    expect(units).toHaveLength(2);
    expect(units[0].attachments.map((attachment) => attachment.id)).toEqual([
      "photo-1",
      "photo-2",
      "photo-3",
      "photo-4",
      "photo-5",
      "photo-6",
      "photo-7",
      "photo-8",
      "photo-9",
    ]);
    expect(units[1].attachments.map((attachment) => attachment.id)).toEqual(["photo-10"]);
  });

  it("splits twelve photos into 9 plus 3", () => {
    const units = buildAttachmentSendUnits(
      Array.from({ length: 12 }, (_, index) => makeAttachment(`photo-${index + 1}`, "photo")),
    );

    expect(units).toHaveLength(2);
    expect(units[0].attachments).toHaveLength(9);
    expect(units[1].attachments).toHaveLength(3);
  });

  it("groups mixed photo and video runs into one visual album unit", () => {
    const units = buildAttachmentSendUnits([
      makeAttachment("photo-1", "photo"),
      makeAttachment("video-2", "video"),
      makeAttachment("photo-3", "photo"),
    ]);

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      kind: "visual",
    });
    expect(units[0].attachments.map((attachment) => attachment.id)).toEqual([
      "photo-1",
      "video-2",
      "photo-3",
    ]);
  });

  it("splits ten visual media items into 9 plus 1 while preserving order", () => {
    const units = buildAttachmentSendUnits([
      ...Array.from({ length: 5 }, (_, index) => makeAttachment(`photo-${index + 1}`, "photo")),
      ...Array.from({ length: 5 }, (_, index) => makeAttachment(`video-${index + 6}`, "video")),
    ]);

    expect(units).toHaveLength(2);
    expect(units[0].kind).toBe("visual");
    expect(units[0].attachments).toHaveLength(9);
    expect(units[1].kind).toBe("visual");
    expect(units[1].attachments.map((attachment) => attachment.id)).toEqual(["video-10"]);
  });

  it("groups contiguous documents while preserving separate photo runs", () => {
    const units = buildAttachmentSendUnits([
      makeAttachment("file-1", "file"),
      makeAttachment("photo-1", "photo"),
      makeAttachment("video-2", "video"),
      makeAttachment("file-2", "file"),
      makeAttachment("photo-3", "photo"),
    ]);

    expect(units.map((unit) => ({
      kind: unit.kind,
      ids: unit.attachments.map((attachment) => attachment.id),
    }))).toEqual([
      { kind: "file", ids: ["file-1"] },
      { kind: "visual", ids: ["photo-1", "video-2"] },
      { kind: "file", ids: ["file-2"] },
      { kind: "visual", ids: ["photo-3"] },
    ]);
  });

  it("groups two or more ordinary documents into one ordered file unit", () => {
    const units = buildAttachmentSendUnits([
      makeAttachment("file-1", "file"),
      makeAttachment("file-2", "file"),
      makeAttachment("file-3", "file"),
    ]);

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ kind: "file" });
    expect(units[0].attachments.map((attachment) => attachment.id)).toEqual([
      "file-1",
      "file-2",
      "file-3",
    ]);
  });

  it("builds Telegram-like modal titles for photo and mixed selections", () => {
    expect(getAttachmentReviewTitle([makeAttachment("photo-1", "photo")])).toBe("Send 1 Photo");
    expect(getAttachmentReviewTitle([
      makeAttachment("photo-1", "photo"),
      makeAttachment("photo-2", "photo"),
    ])).toBe("Send 2 Photos");
    expect(getAttachmentReviewTitle([
      makeAttachment("file-1", "file"),
    ])).toBe("Send 1 File");
    expect(getAttachmentReviewTitle([
      makeAttachment("file-1", "file"),
      makeAttachment("photo-1", "photo"),
    ])).toBe("Send 2 Items");
  });
});
