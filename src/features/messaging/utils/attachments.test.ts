import { describe, expect, it } from "vitest";

import {
  buildPreviewMessage,
  classifyPendingAttachment,
  getAttachmentDisplaySrc,
  getMessageAttachment,
  getMessageAttachments,
  normalizeMessageAttachments,
  getAttachmentOriginalSrc,
  getPreviewText,
  isMessageForwardable,
  validateAttachmentFile,
} from "./attachments";

describe("attachments utils", () => {
  it("hydrates document messages from the persisted history shape", () => {
    const message = normalizeMessageAttachments({
      id: 901,
      content: null,
      sender_id: 7,
      recipient_id: 8,
      room_id: null,
      status: "sent",
      inserted_at: "2026-07-11T08:00:00Z",
      media_file_id: "document-1",
      media_file_ids: ["document-1", "document-2", "document-3"],
      attachment: {
        id: "document-1",
        url: "/api/v1/media/document-1",
        mime_type: "application/pdf",
        original_name: "first.pdf",
        file_size: 1200,
        kind: "file",
      },
      attachments: [
        {
          id: "document-1",
          url: "/api/v1/media/document-1",
          mime_type: "application/pdf",
          original_name: "first.pdf",
          file_size: 1200,
          kind: "file",
        },
        {
          id: "document-2",
          url: "/api/v1/media/document-2",
          mime_type: "application/zip",
          original_name: "second.zip",
          file_size: 2400,
          kind: "file",
        },
        {
          id: "document-3",
          url: "/api/v1/media/document-3",
          mime_type: "text/plain",
          original_name: "third.txt",
          file_size: 3600,
          kind: "file",
        },
      ],
    });

    expect(message.content).toBeNull();
    expect(message.attachments?.map((attachment) => attachment.id)).toEqual([
      "document-1",
      "document-2",
      "document-3",
    ]);
    expect(message.media_file_ids).toEqual([
      "document-1",
      "document-2",
      "document-3",
    ]);
  });

  it("retains a single persisted document when the response only has its id and attachment", () => {
    const message = normalizeMessageAttachments({
      id: 902,
      content: null,
      sender_id: 7,
      recipient_id: 8,
      room_id: null,
      status: "sent",
      inserted_at: "2026-07-11T08:01:00Z",
      media_file_id: "document-only",
      attachment: {
        id: "document-only",
        url: "/api/v1/media/document-only",
        mime_type: "application/pdf",
        original_name: "only.pdf",
        file_size: 1200,
        kind: "file",
      },
    });

    expect(message.attachments).toHaveLength(1);
    expect(message.attachments?.[0].original_name).toBe("only.pdf");
  });

  it("labels an explicitly hydrated voice attachment as a voice message", () => {
    const message = normalizeMessageAttachments({
      id: 903,
      content: null,
      sender_id: 7,
      recipient_id: 8,
      room_id: null,
      status: "sent",
      inserted_at: "2026-07-11T08:02:00Z",
      media_file_id: "voice-1",
      attachment: {
        id: "voice-1",
        url: "/api/v1/media/voice-1",
        mime_type: "audio/webm",
        original_name: "voice-message.webm",
        file_size: 3210,
        kind: "voice",
        duration_ms: 2450,
      },
    });

    expect(getPreviewText(message)).toBe("Voice message");
    expect(message.attachments?.[0].kind).toBe("voice");
    expect(message.attachments?.[0].duration_ms).toBe(2450);
  });

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

  it("preserves rich attachment URLs and dimensions when present", () => {
    const [attachment] = getMessageAttachments({
      attachments: [
        {
          id: "photo-rich-1",
          url: "/api/v1/media/photo-rich-1",
          display_url: "/api/v1/media/photo-rich-1?variant=display",
          original_url: "/api/v1/media/photo-rich-1?variant=original",
          mime_type: "image/png",
          original_name: "photo-rich.png",
          file_size: 4321,
          kind: "photo",
          width: 2048,
          height: 1536,
        },
      ],
    });

    expect(attachment).toMatchObject({
      id: "photo-rich-1",
      width: 2048,
      height: 1536,
      display_url: expect.stringMatching(/photo-rich-1\?variant=display$/),
      original_url: expect.stringMatching(/photo-rich-1\?variant=original$/),
    });
    expect(getAttachmentDisplaySrc(attachment)).toMatch(/photo-rich-1\?variant=display$/);
    expect(getAttachmentOriginalSrc(attachment)).toMatch(/photo-rich-1\?variant=original$/);
  });

  it("prefers rich grouped attachment objects over synthetic grouped fallbacks", () => {
    const attachments = getMessageAttachments({
      media_file_ids: ["photo-rich-1", "photo-rich-2"],
      media_mime_types: ["image/png", "image/jpeg"],
      attachments: [
        {
          id: "photo-rich-1",
          url: "/api/v1/media/photo-rich-1",
          display_url: "/api/v1/media/photo-rich-1?variant=display",
          original_url: "/api/v1/media/photo-rich-1?variant=original",
          mime_type: "image/png",
          original_name: "photo-rich-1.png",
          file_size: 1234,
          kind: "photo",
          width: 1600,
          height: 900,
        },
        {
          id: "photo-rich-2",
          url: "/api/v1/media/photo-rich-2",
          display_url: "/api/v1/media/photo-rich-2?variant=display",
          original_url: "/api/v1/media/photo-rich-2?variant=original",
          mime_type: "image/jpeg",
          original_name: "photo-rich-2.jpg",
          file_size: 2345,
          kind: "photo",
          width: 1080,
          height: 1350,
        },
      ],
    });

    expect(attachments).toEqual([
      expect.objectContaining({
        id: "photo-rich-1",
        width: 1600,
        height: 900,
        display_url: expect.stringMatching(/photo-rich-1\?variant=display$/),
      }),
      expect.objectContaining({
        id: "photo-rich-2",
        width: 1080,
        height: 1350,
        original_url: expect.stringMatching(/photo-rich-2\?variant=original$/),
      }),
    ]);
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

  it("treats camelCase grouped media ids as authoritative for album normalization", () => {
    const attachments = getMessageAttachments({
      mediaFileId: "photo-1",
      mediaFileIds: ["photo-1", "photo-2"],
      mediaMimeType: "image/jpeg",
    });

    expect(attachments.map((attachment) => attachment.id)).toEqual([
      "photo-1",
      "photo-2",
    ]);
    expect(attachments.every((attachment) => attachment.kind === "photo")).toBe(true);
  });

  it("buildPreviewMessage keeps grouped albums intact from camelCase transport payloads", () => {
    const preview = buildPreviewMessage({
      id: 44,
      content: null,
      sender_id: 7,
      recipient_id: 8,
      room_id: null,
      status: "sent",
      inserted_at: "2026-07-01T10:06:00Z",
      mediaFileId: "photo-1",
      mediaFileIds: ["photo-1", "photo-2"],
      mediaMimeType: "image/jpeg",
      mediaMimeTypes: ["image/jpeg", "image/png"],
    });

    expect(preview.preview).toBe("Photos");
    expect(preview.media_file_id).toBe("photo-1");
    expect(preview.media_file_ids).toEqual(["photo-1", "photo-2"]);
    expect(preview.attachments).toHaveLength(2);
  });

  it("preserves four-photo albums when raw messages contain grouped ids in both key styles", () => {
    const attachments = getMessageAttachments({
      media_file_ids: ["photo-1", "photo-2", "photo-3", "photo-4"],
      mediaFileIds: ["photo-1", "photo-2", "photo-3", "photo-4"],
      media_mime_types: ["image/jpeg", "image/jpeg", "image/png", "image/webp"],
      attachments: [
        {
          id: "photo-1",
          url: "/api/v1/media/photo-1",
          mime_type: "image/jpeg",
          original_name: "photo-1.jpg",
          file_size: 1111,
          kind: "photo",
        },
        {
          id: "photo-2",
          url: "/api/v1/media/photo-2",
          mime_type: "image/jpeg",
          original_name: "photo-2.jpg",
          file_size: 2222,
          kind: "photo",
        },
        {
          id: "photo-3",
          url: "/api/v1/media/photo-3",
          mime_type: "image/png",
          original_name: "photo-3.png",
          file_size: 3333,
          kind: "photo",
        },
        {
          id: "photo-4",
          url: "/api/v1/media/photo-4",
          mime_type: "image/webp",
          original_name: "photo-4.webp",
          file_size: 4444,
          kind: "photo",
        },
      ],
    });

    expect(attachments).toHaveLength(4);
    expect(attachments.map((attachment) => attachment.id)).toEqual([
      "photo-1",
      "photo-2",
      "photo-3",
      "photo-4",
    ]);

    const preview = buildPreviewMessage({
      id: 45,
      content: null,
      sender_id: 7,
      recipient_id: 8,
      room_id: null,
      status: "sent",
      inserted_at: "2026-07-01T10:07:00Z",
      media_file_ids: ["photo-1", "photo-2", "photo-3", "photo-4"],
      mediaFileIds: ["photo-1", "photo-2", "photo-3", "photo-4"],
      media_mime_types: ["image/jpeg", "image/jpeg", "image/png", "image/webp"],
      attachments,
    });

    expect(preview.media_file_ids).toEqual(["photo-1", "photo-2", "photo-3", "photo-4"]);
    expect(preview.attachments).toHaveLength(4);
    expect(preview.preview).toBe("Photos");
  });

  it("classifies empty-mime image files by extension fallback", () => {
    const file = new File([new Uint8Array(32)], "album-cover.heic", { type: "" });

    expect(classifyPendingAttachment(file)).toEqual({
      kind: "photo",
      mimeType: "image/heic",
    });
  });

  it("accepts canonical and aliased video MIME types plus extension fallback", () => {
    expect(
      classifyPendingAttachment(new File([new Uint8Array(32)], "clip.mp4", { type: "video/mp4" })),
    ).toEqual({
      kind: "video",
      mimeType: "video/mp4",
    });

    expect(
      classifyPendingAttachment(new File([new Uint8Array(32)], "clip.mov", { type: "video/quicktime" })),
    ).toEqual({
      kind: "video",
      mimeType: "video/quicktime",
    });

    expect(
      classifyPendingAttachment(new File([new Uint8Array(32)], "clip.m4v", { type: "video/x-m4v" })),
    ).toEqual({
      kind: "video",
      mimeType: "video/mp4",
    });

    expect(
      classifyPendingAttachment(new File([new Uint8Array(32)], "clip.mp4", { type: "application/mp4" })),
    ).toEqual({
      kind: "video",
      mimeType: "video/mp4",
    });

    expect(
      classifyPendingAttachment(new File([new Uint8Array(32)], "clip.mp4", { type: "" })),
    ).toEqual({
      kind: "video",
      mimeType: "video/mp4",
    });
  });

  it("rejects unsupported random files while accepting empty-mime MOV by extension", () => {
    expect(validateAttachmentFile(new File([new Uint8Array(32)], "clip.mov", { type: "" }))).toBeNull();
    expect(validateAttachmentFile(new File(["plain"], "notes.txt", { type: "text/plain" }))).toMatch(
      /Unsupported file type/,
    );
  });
});
