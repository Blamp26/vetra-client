import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Plus, X } from "lucide-react";

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
  isAddMenuOpen: boolean;
  addAttachmentMenu?: ReactNode;
  onClose: () => void;
  onToggleAddMenu: () => void;
  onRemoveAttachment: (id: string) => void;
  onContentChange: (value: string) => void;
  onSend: () => void;
}

function getPreviewGridClasses(attachments: PendingAttachment[]) {
  const visualCount = attachments.filter((attachment) => attachment.kind !== "file").length;
  const hasFiles = attachments.some((attachment) => attachment.kind === "file");

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
  if (attachment.kind === "file") {
    return "col-span-full min-h-[72px]";
  }

  const visualCount = attachments.filter((item) => item.kind !== "file").length;
  const hasFiles = attachments.some((item) => item.kind === "file");

  if (!hasFiles && visualCount === 1) {
    return "min-h-[228px]";
  }

  return "min-h-0";
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
  if (attachment.kind === "file") {
    return (
      <div
        className="vt-attachment-review__file-row flex items-center gap-3 rounded-[20px] bg-[#1b1b1b] px-4 py-3 text-[#eef2ee]"
        data-testid="attachment-review-item"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{attachment.name}</span>
          <span className="truncate text-[12px] text-[#a2acb4]">
            {getAttachmentKindLabel(attachment.kind)} · {formatAttachmentSize(attachment.size)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(attachment.id)}
          disabled={disabled}
          className="flex h-8 min-w-8 items-center justify-center rounded-full bg-black/30 px-2 text-[12px] font-medium text-white transition hover:bg-black/45 disabled:opacity-50"
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
        "vt-attachment-review__media group relative overflow-hidden rounded-[18px] bg-[#1a1a1a]",
        getPreviewItemClasses(attachment, attachments),
      )}
      data-testid="attachment-review-item"
    >
      {attachment.previewUrl ? (
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          className="block h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#171717] text-sm font-medium text-[#c7d0cd]">
          {getAttachmentKindLabel(attachment.kind)}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent px-3 py-3 text-white">
        <div className="truncate text-sm font-medium">{attachment.name}</div>
        <div className="truncate text-[11px] text-white/72">
          {getAttachmentKindLabel(attachment.kind)} · {formatAttachmentSize(attachment.size)}
        </div>
      </div>

      <div className="absolute right-3 top-3 z-10 flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <div className="flex items-center gap-1 rounded-2xl bg-black/25 p-1 shadow-[0_4px_10px_rgba(0,0,0,0.25)] backdrop-blur-sm">
          <button
            type="button"
            onClick={() => onRemove(attachment.id)}
            disabled={disabled}
            className="flex h-8 min-w-8 items-center justify-center rounded-2xl px-2 text-[12px] font-medium text-white transition hover:bg-white/12 disabled:opacity-50"
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
      <div className="vt-modal-backdrop" />
      <div
        className="vt-attachment-review__dialog relative z-10 flex max-h-[calc(100vh-24px)] min-h-0 w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-[32px] bg-[#0f0f0f] text-[#eef2ee] shadow-[0_4px_8px_2px_rgba(16,16,16,0.61)] transition-[transform,opacity] duration-200 sm:max-h-[calc(100vh-64px)] sm:rounded-[40px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid min-h-14 shrink-0 grid-cols-[44px_1fr_52px] items-center gap-2 px-[22px] py-[6px]">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/6 text-white transition hover:bg-white/10 disabled:opacity-50"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close attachment review"
          >
            <X className="h-5 w-5" />
          </button>

          <h3
            id="attachment-review-title"
            className="mx-[22px] overflow-hidden text-center text-[20px] leading-[30px] font-medium text-white"
          >
            <span className="block truncate">{title}</span>
          </h3>

          <div className="relative flex justify-end">
            <button
              type="button"
              className={cn(
                "flex h-10 items-center justify-center gap-1 rounded-full px-3 text-sm font-medium transition",
                isAddMenuOpen ? "bg-white/14 text-white" : "bg-white/6 text-[#d7dedb] hover:bg-white/10",
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
              className="vt-attachment-review__preview mx-4 min-h-20 w-[calc(100%-32px)] max-w-[388px] overflow-y-auto rounded-[24px] bg-[#141414]"
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
            <div className="mx-4 flex w-[calc(100%-32px)] max-w-[388px] flex-col gap-2 rounded-[24px] bg-[#212121] px-[8px] py-[4px] shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
              {uploadStatus !== "idle" && (
                <div className="px-2 pt-2 text-[11px] text-[#cdd4d1]">
                  {uploadStatus === "uploading" ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          {uploadLabel ? `Uploading ${uploadLabel}` : "Uploading attachment"}
                        </span>
                        <span className="text-[#a2acb4]">{uploadProgress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[rgb(135,116,225)] transition-[width]"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-[#f0b1a8]">{uploadError}</span>
                  )}
                </div>
              )}

              <div className="flex min-h-12 items-end gap-2">
                <textarea
                  id="attachment-review-caption"
                  ref={captionRef}
                  className="min-h-12 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-[13px] text-[16px] leading-[21px] text-white outline-none placeholder:text-[#a2acb4] disabled:opacity-60"
                  placeholder="Add a caption"
                  rows={1}
                  value={content}
                  onChange={(event) => onContentChange(event.target.value)}
                  disabled={isBusy}
                  aria-label="Caption"
                />

                <button
                  type="button"
                  className="mb-[3px] flex h-[42px] w-[66px] shrink-0 items-center justify-center rounded-[22px] bg-[rgb(135,116,225)] px-[17px] text-sm font-semibold text-white transition hover:brightness-105 disabled:pointer-events-none disabled:opacity-60"
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
