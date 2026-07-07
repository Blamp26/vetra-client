import { useEffect, useMemo } from "react";
import { X } from "lucide-react";

import { cn } from "@/shared/utils/cn";
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
  isSending: boolean;
  isUploading: boolean;
  uploadStatus: "idle" | "uploading" | "error";
  uploadProgress: number;
  uploadLabel: string | null;
  uploadError: string | null;
  onClose: () => void;
  onAddAttachments: () => void;
  onRemoveAttachment: (id: string) => void;
  onContentChange: (value: string) => void;
  onSend: () => void;
}

export function AttachmentReviewModal({
  batchId = null,
  attachments,
  content,
  isSending,
  isUploading,
  uploadStatus,
  uploadProgress,
  uploadLabel,
  uploadError,
  onClose,
  onAddAttachments,
  onRemoveAttachment,
  onContentChange,
  onSend,
}: AttachmentReviewModalProps) {
  const isBusy = isSending || isUploading;
  const title = useMemo(() => getAttachmentReviewTitle(attachments), [attachments]);
  const sendLabel = useMemo(
    () => getAttachmentReviewSendLabel(attachments, isSending),
    [attachments, isSending],
  );

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isBusy) return;
      onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isBusy, onClose]);

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
      className="fixed inset-0 z-[1800] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attachment-review-title"
      data-testid="attachment-review-modal"
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div className="vt-modal-backdrop" />
      <div
        className="vt-modal-panel relative z-10 flex h-[min(86vh,820px)] w-full max-w-4xl min-h-0 flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <span className="vt-kicker">Attachment Review</span>
            <h3 id="attachment-review-title" className="mt-1 truncate text-xl font-semibold tracking-tight">
              {title}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="vt-button min-h-9 px-3 text-sm"
              onClick={onAddAttachments}
              disabled={isBusy}
            >
              Add More
            </button>
            <button
              type="button"
              className="vt-button vt-button--ghost vt-button--icon h-9 w-9 px-0"
              onClick={onClose}
              disabled={isBusy}
              aria-label="Close attachment review"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-5 py-5">
          <div
            className="h-full overflow-y-auto pr-1"
            data-testid="attachment-review-scroll"
          >
            <div
              className={cn(
                "grid gap-3",
                attachments.every((attachment) => attachment.kind === "photo")
                  ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
                  : "grid-cols-1 md:grid-cols-2",
              )}
            >
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="relative overflow-hidden rounded-[18px] border border-border bg-card/80"
                  data-testid="attachment-review-item"
                >
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    disabled={isBusy}
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/55 text-xs text-white disabled:opacity-50"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    ×
                  </button>

                  {attachment.previewUrl ? (
                    <img
                      src={attachment.previewUrl}
                      className="block h-40 w-full bg-[#111] object-cover"
                      alt="preview"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-muted text-sm font-medium text-muted-foreground">
                      {getAttachmentKindLabel(attachment.kind)}
                    </div>
                  )}

                  <div className="space-y-1 px-3 py-3">
                    <div className="truncate text-sm font-medium">{attachment.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {getAttachmentKindLabel(attachment.kind)} · {formatAttachmentSize(attachment.size)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-5 py-4">
          {uploadStatus !== "idle" && (
            <div className="mb-3 text-[11px]">
              {uploadStatus === "uploading" ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {uploadLabel ? `Uploading ${uploadLabel}` : "Uploading attachment"}
                    </span>
                    <span className="text-muted-foreground">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <span className="text-destructive">{uploadError}</span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="vt-label" htmlFor="attachment-review-caption">
                Caption
              </label>
              <textarea
                id="attachment-review-caption"
                className="vt-textarea mt-1 min-h-24 resize-none"
                placeholder="Add a caption"
                rows={3}
                value={content}
                onChange={(event) => onContentChange(event.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="flex justify-end gap-2 md:pb-0.5">
              <button
                type="button"
                className="vt-button min-h-11 px-4"
                onClick={onClose}
                disabled={isBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="vt-button vt-button--primary min-h-11 px-4 disabled:pointer-events-none disabled:opacity-60"
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
  );
}
