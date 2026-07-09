import type { KeyboardEvent, MouseEvent } from "react";
import { Download } from "lucide-react";
import type { Attachment } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import {
  formatAttachmentSize,
  getAttachmentDisplayName,
  getAttachmentKindLabel,
  getAttachmentTypeLabel,
} from "../../utils/attachments";

interface DocumentAttachmentRowProps {
  attachment: Attachment | null;
  isOwn: boolean;
  isActionPending: boolean;
  onOpen: () => void;
  onDownload: () => void;
}

function getAttachmentExtensionBadge(attachment: Attachment | null) {
  if (!attachment) return "FILE";

  const rawName = attachment.original_name ?? "";
  const extensionMatch = rawName.match(/\.([a-z0-9]{1,5})$/i);
  if (extensionMatch) {
    return extensionMatch[1].toUpperCase();
  }

  const typeLabel = getAttachmentTypeLabel(attachment);
  if (typeLabel) return typeLabel.toUpperCase();

  return getAttachmentKindLabel(attachment.kind).slice(0, 4).toUpperCase();
}

function getAttachmentExtensionTone(attachment: Attachment | null) {
  const mimeType = attachment?.mime_type ?? "";
  const extension = getAttachmentExtensionBadge(attachment);

  if (mimeType === "application/pdf" || extension === "PDF") {
    return "bg-[#e53935] text-white";
  }

  if (mimeType.includes("zip") || extension === "ZIP") {
    return "bg-[#f2994a] text-white";
  }

  if (attachment?.kind === "video") {
    return "bg-[#4c6fff] text-white";
  }

  return "bg-[#5d6a62] text-white";
}

export function DocumentAttachmentRow({
  attachment,
  isOwn,
  isActionPending,
  onOpen,
  onDownload,
}: DocumentAttachmentRowProps) {
  const attachmentTypeLabel = getAttachmentTypeLabel(attachment);
  const attachmentName = getAttachmentDisplayName(attachment);
  const attachmentKindLabel = attachment
    ? getAttachmentKindLabel(attachment.kind)
    : "Attachment";
  const attachmentExtension = getAttachmentExtensionBadge(attachment);
  const canOpenInline = attachment?.mime_type === "application/pdf" || attachment?.kind === "video";
  const iconButtonClassName = cn(
    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
    isOwn ? "bg-black/20 text-white hover:bg-black/30" : "bg-white text-[#1f2421] hover:bg-white/90",
  );

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canOpenInline) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };

  const handleDownloadClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDownload();
  };

  return (
    <div
      className={cn("flex min-w-0 items-start gap-3", canOpenInline && "cursor-pointer")}
      data-testid="message-file-row"
      onClick={() => {
        if (canOpenInline) {
          onOpen();
        }
      }}
      onKeyDown={handleRowKeyDown}
      role={canOpenInline ? "button" : undefined}
      tabIndex={canOpenInline ? 0 : undefined}
    >
      <div
        className="relative h-[54px] w-[54px] shrink-0"
        data-testid="message-file-icon-container"
      >
        <div
          className={cn(
            "flex h-full w-full items-center justify-center rounded-[6px] px-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
            getAttachmentExtensionTone(attachment),
          )}
          data-testid="message-file-icon"
        >
          <span className="sr-only text-[11px] font-semibold leading-none tracking-[0.08em]">
            {attachmentExtension}
          </span>
        </div>
        <button
          type="button"
          aria-label="Download"
          title="Download"
          onClick={handleDownloadClick}
          disabled={isActionPending}
          className={cn(iconButtonClassName, "absolute inset-0 h-full w-full rounded-[6px] bg-transparent text-white hover:bg-black/10")}
        >
          <Download className="h-5 w-5" />
        </button>
      </div>
      <div className="min-w-0 flex-1 pt-[2px]">
        <div
          className="truncate text-[14px] font-medium leading-[18px] text-current"
          data-testid="message-file-name"
        >
          {attachmentName}
        </div>
        <div
          className={cn(
            "mt-1 truncate text-[12px] leading-[16px]",
            isOwn ? "text-[color:var(--bubble-outgoing-meta)]" : "text-muted-foreground",
          )}
        >
          {[attachmentTypeLabel || attachmentKindLabel, formatAttachmentSize(attachment?.file_size)].join(" · ")}
        </div>
      </div>
    </div>
  );
}
