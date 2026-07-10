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
  isCompact: boolean;
  isGrouped: boolean;
  isActionPending: boolean;
  onOpen: () => void;
  onDownload: () => void;
}

function getAttachmentExtensionBadge(attachment: Attachment | null, lowercase: boolean) {
  if (!attachment) return lowercase ? "file" : "FILE";

  const rawName = attachment.original_name ?? "";
  const extensionMatch = rawName.match(/\.([a-z0-9]{1,5})$/i);
  if (extensionMatch) {
    return lowercase ? extensionMatch[1].toLowerCase() : extensionMatch[1].toUpperCase();
  }

  const typeLabel = getAttachmentTypeLabel(attachment);
  if (typeLabel) return lowercase ? typeLabel.toLowerCase() : typeLabel.toUpperCase();

  const kindLabel = getAttachmentKindLabel(attachment.kind).slice(0, 4);
  return lowercase ? kindLabel.toLowerCase() : kindLabel.toUpperCase();
}

function getAttachmentExtensionTone(attachment: Attachment | null) {
  const mimeType = attachment?.mime_type ?? "";
  const extension = getAttachmentExtensionBadge(attachment, false);

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
  isCompact,
  isGrouped,
  isActionPending,
  onOpen,
  onDownload,
}: DocumentAttachmentRowProps) {
  const attachmentName = getAttachmentDisplayName(attachment);
  const attachmentExtension = getAttachmentExtensionBadge(attachment, isCompact);
  const canOpenInline = attachment?.mime_type === "application/pdf" || attachment?.kind === "video";
  const formattedSize = formatAttachmentSize(attachment?.file_size);
  const documentSize = formattedSize === "Unknown size"
    ? formattedSize
    : formattedSize.replace(/\s+/g, "");
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
      className={cn(
        isCompact
          ? cn(
              "relative my-[3px] flex h-[54px] min-w-[224px] items-center bg-transparent p-0",
              isGrouped ? "w-[259px]" : "w-[224px]",
            )
          : "flex min-w-0 items-start gap-3",
        canOpenInline && "cursor-pointer",
      )}
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
        className={isCompact
          ? "relative mr-[12px] h-[54px] w-[54px] shrink-0 cursor-pointer"
          : "relative h-[54px] w-[54px] shrink-0"}
        data-testid="message-file-icon-container"
      >
        <div
          className={cn(
            isCompact
              ? "flex h-[54px] w-[54px] shrink-0 items-end justify-center rounded-[6px] px-[12px] pt-[16px] pb-[8px] text-center"
              : "flex h-full w-full items-center justify-center rounded-[6px] px-2 text-center",
            getAttachmentExtensionTone(attachment),
          )}
          data-testid="message-file-icon"
        >
          <span className={isCompact
            ? "text-[16px] font-medium leading-[24px] text-white lowercase"
            : "sr-only text-[11px] font-semibold leading-none tracking-[0.08em]"}>
            {attachmentExtension}
          </span>
        </div>
        <button
          type="button"
          aria-label="Download"
          title="Download"
          onClick={handleDownloadClick}
          disabled={isActionPending}
          className={isCompact
            ? "absolute inset-0 flex h-[54px] w-[54px] items-center justify-center bg-transparent text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100"
            : cn(iconButtonClassName, "absolute inset-0 h-full w-full rounded-[6px] bg-transparent text-white hover:bg-black/10")}
        >
          <Download className={isCompact ? "h-6 w-6" : "h-5 w-5"} />
        </button>
      </div>
      <div
        className={isCompact
          ? "mt-[3px] mr-[2px] h-[39px] min-w-0 flex-1 overflow-hidden whitespace-nowrap"
          : "min-w-0 flex-1 pt-[2px]"}
        data-testid="message-file-info"
      >
        <div
          className={isCompact
            ? "truncate whitespace-nowrap text-[16px] font-medium leading-[24px] text-current"
            : "truncate text-[14px] font-medium leading-[18px] text-current"}
          data-testid="message-file-name"
          title={attachmentName}
        >
          {attachmentName}
        </div>
        <div
          className={cn(
            isCompact
              ? "truncate text-[14px] font-normal leading-[15px]"
              : "mt-1 truncate text-[12px] leading-[16px]",
            isOwn ? "text-[color:var(--bubble-outgoing-meta)]" : "text-muted-foreground",
          )}
          data-testid="message-file-size"
        >
          {isCompact
            ? documentSize
            : [getAttachmentTypeLabel(attachment) || getAttachmentKindLabel(attachment?.kind ?? "file"), formattedSize].join(" · ")}
        </div>
      </div>
    </div>
  );
}
