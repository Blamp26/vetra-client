import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Play, Plus, X } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { ComposerTextDecoration } from "./ComposerTextDecoration";
import type { MessageTextEntity } from "@/shared/utils/textEntities";
import {
  formatAttachmentSize,
  getAttachmentKindLabel,
} from "../../utils/attachments";
import {
  getAttachmentReviewSendLabel,
  getAttachmentReviewTitle,
  type PendingAttachment,
} from "./attachmentQueue";
import {
  logAttachmentDebug,
  summarizeAttachmentLike,
} from "../../utils/attachmentDebug";

interface AttachmentReviewModalProps {
  batchId?: string | null;
  attachments: PendingAttachment[];
  content: string;
  entities: readonly MessageTextEntity[];
  isSending: boolean;
  isUploading: boolean;
  uploadStatus: "idle" | "uploading" | "error";
  uploadProgress: number;
  uploadLabel: string | null;
  uploadError: string | null;
  isAddMenuOpen: boolean;
  addAttachmentMenu?: ReactNode;
  onClose: () => void;
  onToggleAddMenu: () => void;
  onRemoveAttachment: (id: string) => void;
  onContentChange: (value: string) => void;
  onSend: () => void;
}

function getPreviewGridClasses(attachments: PendingAttachment[]) {
  const visualCount = attachments.filter((attachment) => attachment.kind === "photo" || attachment.kind === "video").length;
  const hasFiles = attachments.some((attachment) => attachment.kind === "file" || attachment.kind === "audio");

  if (hasFiles) {
    return "grid-cols-2 auto-rows-[120px]";
  }

  if (visualCount <= 1) {
    return "grid-cols-1 auto-rows-[228px]";
  }

  if (visualCount === 2) {
    return "grid-cols-2 auto-rows-[192px]";
  }

  if (visualCount <= 4) {
    return "grid-cols-2 auto-rows-[120px]";
  }

  return "grid-cols-3 auto-rows-[100px]";
}

function getPreviewItemClasses(attachment: PendingAttachment, attachments: PendingAttachment[]) {
  if (attachment.kind === "file" || attachment.kind === "audio") {
    return "col-span-full min-h-[72px]";
  }

  const visualCount = attachments.filter((item) => item.kind === "photo" || item.kind === "video").length;
  const hasFiles = attachments.some((item) => item.kind === "file" || item.kind === "audio");

  if (!hasFiles && visualCount === 1) {
    return "min-h-[228px]";
  }

  return "min-h-0";
}

function formatVideoDuration(durationSeconds: number | null) {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function AttachmentPreviewMedia({
  attachment,
}: {
  attachment: PendingAttachment;
}) {
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  useEffect(() => {
    if (attachment.previewUrl || attachment.kind !== "video") {
      setLocalPreviewUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(attachment.file);
    setLocalPreviewUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [attachment.file, attachment.kind, attachment.previewUrl]);

  const previewUrl = attachment.previewUrl ?? localPreviewUrl;

  if (attachment.kind === "video") {
    if (previewUrl && !hasVideoError) {
      const durationLabel = formatVideoDuration(videoDuration);

      return (
        <>
          <video
            src={previewUrl}
            className="block h-full w-full object-cover object-center"
            muted
            playsInline
            preload="metadata"
            autoPlay
            loop
            data-testid={`attachment-review-video-preview-${attachment.id}`}
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration;
              setVideoDuration(
                Number.isFinite(duration) && duration > 0 ? duration : null,
              );
              setHasVideoError(false);
            }}
            onError={() => setHasVideoError(true)}
          />
          <div className="pointer-events-none absolute left-[3px] top-[3px] z-[1]">
            {durationLabel ? (
              <span
                className="inline-flex h-[18px] items-center rounded-full bg-black/25 px-[6px] text-[12px] font-medium leading-[18px] text-white"
                data-testid={`attachment-review-video-duration-${attachment.id}`}
              >
                {durationLabel}
              </span>
            ) : (
              <span
                className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/25 text-white"
                data-testid={`attachment-review-video-badge-${attachment.id}`}
              >
                <Play className="h-3 w-3 fill-current" />
              </span>
            )}
          </div>
        </>
      );
    }

    return (
      <div
        className="flex h-full w-full items-center justify-center bg-muted text-sm font-medium text-muted-foreground"
        data-testid={`attachment-review-video-fallback-${attachment.id}`}
      >
        Video
      </div>
    );
  }

  if (previewUrl) {
    return (
      <img
        src={previewUrl}
        alt={attachment.name}
        className="block h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-sm font-medium text-muted-foreground">
      {getAttachmentKindLabel(attachment.kind)}
    </div>
  );
}

function AttachmentPreviewCard({
  attachment,
  attachments,
  disabled,
  onRemove,
}: {
  attachment: PendingAttachment;
  attachments: PendingAttachment[];
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  if (attachment.kind === "file" || attachment.kind === "audio") {
    return (
      <div
        className="vt-attachment-review__file-row flex items-center gap-3 px-4 py-3"
        data-testid="attachment-review-item"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{attachment.name}</span>
          <span className="vt-attachment-review__meta truncate text-[12px]">
            {getAttachmentKindLabel(attachment.kind)} · {formatAttachmentSize(attachment.size)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(attachment.id)}
          disabled={disabled}
          className="vt-attachment-review__remove flex h-8 min-w-8 items-center justify-center rounded-full bg-transparent px-2 text-[12px] font-medium transition disabled:opacity-50"
          aria-label={`Remove ${attachment.name}`}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "vt-attachment-review__media group relative overflow-hidden",
        getPreviewItemClasses(attachment, attachments),
      )}
      data-testid="attachment-review-item"
    >
      <AttachmentPreviewMedia attachment={attachment} />

      <div className="vt-attachment-review__media-fade pointer-events-none absolute inset-x-0 bottom-0 px-3 py-3 text-white">
        <div className="truncate text-sm font-medium">{attachment.name}</div>
        <div className="truncate text-[11px] text-white/72">
          {getAttachmentKindLabel(attachment.kind)} · {formatAttachmentSize(attachment.size)}
        </div>
      </div>

      <div className="absolute right-3 top-3 z-10 flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <div className="vt-attachment-review__media-actions flex items-center gap-1 p-1">
          <button
            type="button"
            onClick={() => onRemove(attachment.id)}
            disabled={disabled}
            className="vt-attachment-review__remove flex h-8 min-w-8 items-center justify-center px-2 text-[12px] font-medium transition disabled:opacity-50"
            aria-label={`Remove ${attachment.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AttachmentReviewModal({
  batchId = null,
  attachments,
  content,
  entities,
  isSending,
  isUploading,
  uploadStatus,
  uploadProgress,
  uploadLabel,
  uploadError,
  isAddMenuOpen,
  addAttachmentMenu,
  onClose,
  onToggleAddMenu,
  onRemoveAttachment,
  onContentChange,
  onSend,
}: AttachmentReviewModalProps) {
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const [captionScrollTop, setCaptionScrollTop] = useState(0);
  const isBusy = isSending || isUploading;
  const title = useMemo(() => getAttachmentReviewTitle(attachments), [attachments]);
  const sendLabel = useMemo(
    () => getAttachmentReviewSendLabel(isSending),
    [isSending],
  );

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape" || isBusy) return;
      onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isBusy, onClose]);

  useEffect(() => {
    const textarea = captionRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 48), 160)}px`;
  }, [content]);

  useEffect(() => {
    logAttachmentDebug("modal.render", {
      isBusy,
      itemCount: attachments.length,
      title,
      hasCaption: content.trim().length > 0,
    }, {
      batchId,
      table: attachments.map((attachment) => summarizeAttachmentLike(attachment)),
    });
  }, [attachments, batchId, content, isBusy, title]);

  return (
    <div
      className="fixed inset-0 z-[1800] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attachment-review-title"
      data-testid="attachment-review-modal"
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div className="vt-modal-backdrop vt-modal-backdrop--flat" />
      <div
        className="vt-attachment-review__dialog relative z-10 flex max-h-[calc(100vh-24px)] min-h-0 w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden transition-[transform,opacity] duration-200 sm:max-h-[calc(100vh-64px)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid min-h-14 shrink-0 grid-cols-[40px_minmax(0,1fr)_72px] items-center gap-2 px-4 py-2 sm:px-[22px] sm:py-[6px]">
          <button
            type="button"
            className="vt-attachment-review__surface-button flex h-10 w-10 items-center justify-center transition disabled:opacity-50"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close attachment review"
          >
            <X className="h-5 w-5" />
          </button>

          <h3
            id="attachment-review-title"
            className="vt-attachment-review__title mx-3 overflow-hidden text-center sm:mx-[22px]"
          >
            <span className="block truncate">{title}</span>
          </h3>

          <div className="relative flex justify-end">
            <button
              type="button"
              className={cn(
                "vt-attachment-review__surface-button flex h-10 min-w-[72px] items-center justify-center gap-1 px-3 text-sm font-medium transition",
                isAddMenuOpen && "vt-attachment-review__surface-button--active",
              )}
              onClick={onToggleAddMenu}
              disabled={isBusy}
              aria-label="Add attachments"
            >
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </button>
            {isAddMenuOpen ? addAttachmentMenu : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col pb-2">
          <div className="px-0 pt-1">
            <div
              className="vt-attachment-review__preview mx-4 min-h-20 w-[calc(100%-32px)] max-w-[388px] overflow-y-auto"
              style={{ maxHeight: "min(416px, calc(100vh - 248px))" }}
              data-testid="attachment-review-scroll"
            >
              <div
                className={cn(
                  "grid gap-[2px] p-0.5",
                  getPreviewGridClasses(attachments),
                )}
                data-testid="attachment-review-grid"
              >
                {attachments.map((attachment) => (
                  <AttachmentPreviewCard
                    key={attachment.id}
                    attachment={attachment}
                    attachments={attachments}
                    disabled={isBusy}
                    onRemove={onRemoveAttachment}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-auto shrink-0 px-0 pb-4 pt-4" data-testid="attachment-review-footer">
            <div className="vt-attachment-review__footer mx-4 flex w-[calc(100%-32px)] max-w-[388px] flex-col gap-2 px-[8px] py-[4px]">
              {uploadStatus !== "idle" && (
                <div className="vt-attachment-review__upload-meta px-2 pt-2 text-[11px]">
                  {uploadStatus === "uploading" ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          {uploadLabel ? `Uploading ${uploadLabel}` : "Uploading attachment"}
                        </span>
                        <span className="vt-attachment-review__meta">{uploadProgress}%</span>
                      </div>
                      <div className="vt-attachment-review__progress-track h-1.5 overflow-hidden rounded-full">
                        <div
                          className="vt-attachment-review__progress-bar h-full rounded-full transition-[width]"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-destructive">{uploadError}</span>
                  )}
                </div>
              )}

              <div className="flex min-h-12 items-end gap-2">
                <div className="vt-attachment-review__caption-layer">
                  <ComposerTextDecoration text={content} entities={entities} scrollTop={captionScrollTop} className="vt-attachment-review__caption-decoration" />
                  <textarea
                    id="attachment-review-caption"
                    ref={captionRef}
                    className="vt-attachment-review__caption min-h-12 w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-[13px] text-[15px] leading-[21px] outline-none disabled:opacity-60"
                    placeholder="Add a caption"
                    rows={1}
                    value={content}
                    onChange={(event) => onContentChange(event.target.value)}
                    onScroll={(event) => setCaptionScrollTop(event.currentTarget.scrollTop)}
                    disabled={isBusy}
                    aria-label="Caption"
                  />
                </div>

                <button
                  type="button"
                  className="vt-attachment-review__send vt-button vt-button--primary mb-[3px] shrink-0 disabled:pointer-events-none disabled:opacity-60"
                  onClick={onSend}
                  disabled={attachments.length === 0 || isBusy}
                >
                  {sendLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
