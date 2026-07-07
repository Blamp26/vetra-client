import { describe, expect, it } from "vitest";

import {
  buildPreviewMessage,
  classifyPendingAttachment,
  getMessageAttachment,
  getMessageAttachments,
  getPreviewText,
  isMessageForwardable,
} from "./attachments";

describe("attachments utils", () => {
  it("uses useful labels for attachment-only reply/search previews", () => {
    expect(
      getPreviewText({
        content: "",
        attachment: {
          id: "photo-1",
          url: "/api/v1/media/photo-1",
          mime_type: "image/png",
          original_name: "photo.png",
          file_size: 1234,
          kind: "photo",
        },
      }),
    ).toBe("Photo");

    expect(
      getPreviewText({
        content: "",
        attachment: {
          id: "video-1",
          url: "/api/v1/media/video-1",
          mime_type: "video/mp4",
          original_name: "clip.mp4",
          file_size: 4567,
          kind: "video",
        },
      }),
    ).toBe("Video");

    expect(
      getPreviewText({
        content: "",
        attachment: {
          id: "file-1",
          url: "/api/v1/media/file-1",
          mime_type: "application/pdf",
          original_name: "report.pdf",
          file_size: 5678,
          kind: "file",
        },
      }),
    ).toBe("File: report.pdf");
  });

  it("keeps text over attachment labels when no server preview is present", () => {
    expect(
      getPreviewText({
        content: "see report",
        attachment: {
          id: "file-2",
          url: "/api/v1/media/file-2",
          mime_type: "application/pdf",
          original_name: "report.pdf",
          file_size: 5678,
          kind: "file",
        },
      }),
    ).toBe("see report");
  });

  it("prefers server-provided preview text when available", () => {
    expect(
      getPreviewText({
        preview: "File: report.pdf",
        content: "",
        attachment_kind: "file",
        attachment_name: "report.pdf",
      }),
    ).toBe("File: report.pdf");
  });

  it("builds safe legacy attachment fallbacks from media_file_id/media_mime_type", () => {
    const attachment = getMessageAttachment({
      media_file_id: "legacy-photo-1",
      media_mime_type: "image/jpeg",
    });

    expect(attachment).toEqual({
      id: "legacy-photo-1",
      url: expect.stringMatching(/\/api\/v1\/media\/legacy-photo-1$/),
      mime_type: "image/jpeg",
      original_name: null,
      file_size: null,
      kind: "photo",
    });

    expect(
      getPreviewText({
        content: "",
        media_file_id: "legacy-photo-1",
        media_mime_type: "image/jpeg",
      }),
    ).toBe("Photo");

    expect(
      isMessageForwardable({
        media_file_id: "legacy-photo-1",
        media_mime_type: "image/jpeg",
      }),
    ).toBe(false);
  });

  it("normalizes grouped photo attachments and uses a plural preview label", () => {
    const attachments = getMessageAttachments({
      attachments: [
        {
          id: "photo-1",
          url: "/api/v1/media/photo-1",
          mime_type: "image/png",
          original_name: "photo-1.png",
          file_size: 1234,
          kind: "photo",
        },
        {
          id: "photo-2",
          url: "/api/v1/media/photo-2",
          mime_type: "image/jpeg",
          original_name: "photo-2.jpg",
          file_size: 4567,
          kind: "photo",
        },
      ],
    });

    expect(attachments).toHaveLength(2);
    expect(getPreviewText({
      content: "",
      attachments,
    })).toBe("Photos");
    expect(isMessageForwardable({ attachments })).toBe(false);
  });

  it("buildPreviewMessage normalizes legacy attachment metadata for history/previews", () => {
    const preview = buildPreviewMessage({
      id: 42,
      content: "",
      sender_id: 7,
      recipient_id: 8,
      room_id: null,
      status: "sent",
      inserted_at: "2026-07-01T10:00:00Z",
      media_file_id: "legacy-file-1",
      media_mime_type: "application/pdf",
    });

    expect(preview.preview).toBe("File");
    expect(preview.attachment).toEqual({
      id: "legacy-file-1",
      url: expect.stringMatching(/\/api\/v1\/media\/legacy-file-1$/),
      mime_type: "application/pdf",
      original_name: null,
      file_size: null,
      kind: "file",
    });
    expect(preview.attachment_kind).toBe("file");
    expect(preview.attachment_mime_type).toBe("application/pdf");
  });

  it("buildPreviewMessage preserves grouped photo attachment arrays", () => {
    const preview = buildPreviewMessage({
      id: 43,
      content: null,
      sender_id: 7,
      recipient_id: 8,
      room_id: null,
      status: "sent",
      inserted_at: "2026-07-01T10:05:00Z",
      media_file_ids: ["photo-1", "photo-2"],
      media_mime_types: ["image/png", "image/jpeg"],
      attachments: [
        {
          id: "photo-1",
          url: "/api/v1/media/photo-1",
          mime_type: "image/png",
          original_name: "photo-1.png",
          file_size: 1234,
          kind: "photo",
        },
        {
          id: "photo-2",
          url: "/api/v1/media/photo-2",
          mime_type: "image/jpeg",
          original_name: "photo-2.jpg",
          file_size: 2345,
          kind: "photo",
        },
      ],
    });

    expect(preview.preview).toBe("Photos");
    expect(preview.attachment_kind).toBe("photo");
    expect(preview.attachments).toHaveLength(2);
    expect(preview.media_file_ids).toEqual(["photo-1", "photo-2"]);
  });

  it("normalizes grouped albums from compatibility payloads that include only the first attachment object", () => {
    const attachments = getMessageAttachments({
      media_file_id: "photo-1",
      media_file_ids: ["photo-1", "photo-2", "photo-3"],
      media_mime_type: "image/jpeg",
      attachment: {
        id: "photo-1",
        url: "/api/v1/media/photo-1",
        mime_type: "image/jpeg",
        original_name: "photo-1.jpg",
        file_size: 1024,
        kind: "photo",
      },
    });

    expect(attachments).toHaveLength(3);
    expect(attachments.map((attachment) => attachment.id)).toEqual([
      "photo-1",
      "photo-2",
      "photo-3",
    ]);
    expect(attachments.every((attachment) => attachment.kind === "photo")).toBe(true);
  });

  it("classifies empty-mime image files by extension fallback", () => {
    const file = new File([new Uint8Array(32)], "album-cover.heic", { type: "" });

    expect(classifyPendingAttachment(file)).toEqual({
      kind: "photo",
      mimeType: "image/heic",
    });
  });
});
