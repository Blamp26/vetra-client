import { describe, expect, it } from "vitest";

import {
  buildAttachmentSendUnits,
  getAttachmentReviewTitle,
  type PendingAttachment,
} from "./attachmentQueue";

function makeAttachment(
  id: string,
  kind: PendingAttachment["kind"],
): PendingAttachment {
  return {
    id,
    file: new File([new Uint8Array(16)], `${id}.${kind === "photo" ? "png" : "pdf"}`),
    name: `${id}.${kind === "photo" ? "png" : "pdf"}`,
    mimeType: kind === "photo" ? "image/png" : "application/pdf",
    size: 16,
    kind,
    previewUrl: kind === "photo" ? `blob:${id}` : null,
  };
}

describe("attachmentQueue helpers", () => {
  it("builds exactly one photo album unit for two photos", () => {
    const units = buildAttachmentSendUnits([
      makeAttachment("photo-1", "photo"),
      makeAttachment("photo-2", "photo"),
    ]);

    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe("photo");
    expect(units[0].attachments).toHaveLength(2);
  });

  it("builds exactly one photo album unit for four photos", () => {
    const units = buildAttachmentSendUnits(
      Array.from({ length: 4 }, (_, index) => makeAttachment(`photo-${index + 1}`, "photo")),
    );

    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe("photo");
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

  it("keeps documents separate while preserving photo runs", () => {
    const units = buildAttachmentSendUnits([
      makeAttachment("file-1", "file"),
      makeAttachment("photo-1", "photo"),
      makeAttachment("photo-2", "photo"),
      makeAttachment("file-2", "file"),
      makeAttachment("photo-3", "photo"),
    ]);

    expect(units.map((unit) => ({
      kind: unit.kind,
      ids: unit.attachments.map((attachment) => attachment.id),
    }))).toEqual([
      { kind: "file", ids: ["file-1"] },
      { kind: "photo", ids: ["photo-1", "photo-2"] },
      { kind: "file", ids: ["file-2"] },
      { kind: "photo", ids: ["photo-3"] },
    ]);
  });

  it("builds Telegram-like modal titles for photo and mixed selections", () => {
    expect(getAttachmentReviewTitle([makeAttachment("photo-1", "photo")])).toBe("Send Photo");
    expect(getAttachmentReviewTitle([
      makeAttachment("photo-1", "photo"),
      makeAttachment("photo-2", "photo"),
    ])).toBe("Send Photos");
    expect(getAttachmentReviewTitle([
      makeAttachment("file-1", "file"),
    ])).toBe("Send Files");
    expect(getAttachmentReviewTitle([
      makeAttachment("file-1", "file"),
      makeAttachment("photo-1", "photo"),
    ])).toBe("Send Attachments");
  });
});
