import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Download, X } from "lucide-react";
import type { Attachment } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import {
  formatAttachmentSize,
  getAttachmentDisplayName,
  getAttachmentKindLabel,
  getAttachmentTypeLabel,
} from "../../utils/attachments";
import {
  getAttachmentLocalState,
  type AttachmentDownloadProgress,
} from "../../utils/attachmentDownloads";

type DocumentActionOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: AttachmentDownloadProgress) => void;
};

type DocumentAction = (options?: DocumentActionOptions) => Promise<boolean>;

interface DocumentAttachmentRowProps {
  attachment: Attachment | null;
  isOwn: boolean;
  isCompact: boolean;
  isGrouped: boolean;
  onDownload: DocumentAction;
}

function getAttachmentExtensionBadge(attachment: Attachment | null, lowercase: boolean) {
  if (!attachment) return lowercase ? "file" : "FILE";

  const rawName = attachment.original_name ?? "";
  const extensionMatch = rawName.match(/\.([a-z0-9]{1,12})$/i);
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
  onDownload,
}: DocumentAttachmentRowProps) {
  const [downloadState, setDownloadState] = useState<"not-downloaded" | "downloading" | "downloaded" | "failed">("not-downloaded");
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(attachment?.file_size ?? null);
  const downloadInProgressRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const attachmentName = getAttachmentDisplayName(attachment);
  const attachmentExtension = getAttachmentExtensionBadge(attachment, isCompact);
  const formattedSize = formatAttachmentSize(attachment?.file_size);
  const documentSize = formattedSize === "Unknown size"
    ? formattedSize
    : formattedSize.replace(/\s+/g, "");

  useEffect(() => {
    let active = true;
    setDownloadState("not-downloaded");
    setLoadedBytes(0);
    setTotalBytes(attachment?.file_size ?? null);
    if (!attachment) return () => { active = false; };

    void getAttachmentLocalState(attachment)
      .then((exists) => {
        if (active && exists) setDownloadState("downloaded");
      })
      .catch(() => undefined);

    return () => { active = false; };
  }, [attachment?.id, attachment?.file_size]);

  const formatCompactSize = (bytes: number | null) => (
    bytes == null ? "Unknown size" : formatAttachmentSize(bytes).replace(/\s+/g, "")
  );

  const subtitle = downloadState === "downloading"
    ? totalBytes == null
      ? formatCompactSize(loadedBytes)
      : `${formatCompactSize(loadedBytes)} / ${formatCompactSize(totalBytes)}`
    : documentSize;

  const handleAction = (action: DocumentAction) => {
    if (downloadState === "downloading") {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      downloadInProgressRef.current = false;
      setDownloadState("not-downloaded");
      setLoadedBytes(0);
      setTotalBytes(attachment?.file_size ?? null);
      return;
    }
    if (downloadInProgressRef.current) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    downloadInProgressRef.current = true;
    setDownloadState("downloading");
    setLoadedBytes(0);
    setTotalBytes(attachment?.file_size ?? null);

    void Promise.resolve(action({
      signal: controller.signal,
      onProgress: ({ loadedBytes: nextLoadedBytes, totalBytes: nextTotalBytes }) => {
        if (abortControllerRef.current !== controller) return;
        setLoadedBytes(nextLoadedBytes);
        setTotalBytes(nextTotalBytes ?? attachment?.file_size ?? null);
      },
    })).then((succeeded) => {
      if (abortControllerRef.current !== controller) return;
      setDownloadState(succeeded ? "downloaded" : "failed");
    }).catch(() => {
      if (abortControllerRef.current === controller) setDownloadState("failed");
    }).finally(() => {
      if (abortControllerRef.current !== controller) return;
      abortControllerRef.current = null;
      downloadInProgressRef.current = false;
    });
  };

  const handleDownloadClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handleAction(onDownload);
  };

  const isDownloading = downloadState === "downloading";
  const actionLabel = isDownloading
    ? `Cancel download of ${attachmentName}`
    : downloadState === "downloaded"
      ? `Open ${attachmentName}`
      : downloadState === "failed"
        ? `Retry download of ${attachmentName}`
        : `Download ${attachmentName}`;
  const progressPercent = totalBytes && totalBytes > 0
    ? Math.min(100, (loadedBytes / totalBytes) * 100)
    : undefined;
  return (
    <div
      className={cn(
        isCompact
          ? cn(
              "relative my-[3px] flex h-[54px] min-w-[224px] items-center bg-transparent p-0",
              isGrouped ? "w-[259px]" : "max-w-full",
            )
          : "flex min-w-0 items-start gap-3",
      )}
      data-testid="message-file-row"
    >
      <div
        className={cn("group", isCompact
          ? "relative mr-[12px] h-[54px] w-[54px] shrink-0 cursor-pointer"
          : "relative h-[54px] w-[54px] shrink-0")}
        data-testid="message-file-icon-container"
        data-download-state={downloadState}
      >
        <div
          className={cn(
            "relative flex h-[54px] w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] px-0 py-0 text-center",
            getAttachmentExtensionTone(attachment),
          )}
          data-testid="message-file-icon"
        >
          <span className={cn(
            "absolute inset-0 grid place-items-center truncate overflow-hidden px-1 text-[16px] font-medium leading-[24px] lowercase text-white transition-opacity duration-200",
            downloadState === "downloaded" ? "opacity-100" : "opacity-0",
          )} data-testid="message-file-extension">
            {attachmentExtension}
          </span>
          {downloadState === "not-downloaded" || downloadState === "failed" ? (
            <span
              className="pointer-events-none absolute inset-0 grid place-items-center leading-[0] text-white"
              data-testid="message-file-download-stage"
            >
              <Download className="h-6 w-6" aria-hidden="true" />
            </span>
          ) : null}
          {isDownloading ? (
            <span className="pointer-events-none absolute inset-0 grid place-items-center" data-testid="message-file-progress-stage">
              <svg
                width="48"
                height="48"
                viewBox="0 0 48 48"
                role="progressbar"
                aria-label={`Downloading ${attachmentName}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                data-testid="message-file-progress"
                className="h-[48px] w-[48px]"
              >
                <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" />
                <circle
                  cx="24"
                  cy="24"
                  r="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 22}
                  strokeDashoffset={progressPercent == null ? 2 * Math.PI * 22 * 0.25 : 2 * Math.PI * 22 * (1 - progressPercent / 100)}
                  className={progressPercent == null ? "animate-spin" : undefined}
                />
              </svg>
              <X className="pointer-events-none absolute h-[26px] w-[26px] text-white" strokeWidth={2} aria-hidden="true" />
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={actionLabel}
          title={actionLabel}
          onClick={handleDownloadClick}
          className="absolute inset-0 z-[1] h-[54px] w-[54px] cursor-pointer rounded-[6px] bg-transparent p-0"
          data-testid="message-file-action"
        />
      </div>
      <div
        className={isCompact
          ? "mt-[3px] mr-[2px] h-[39px] min-w-0 flex-1 overflow-hidden whitespace-nowrap"
          : "min-w-0 flex-1 pt-[2px]"}
        data-testid="message-file-info"
      >
        <div
          className={isCompact
            ? "block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[16px] font-medium leading-[24px] text-current"
            : "block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-medium leading-[18px] text-current"}
          title={attachmentName}
          aria-label={attachmentName}
          dir="auto"
          data-testid="message-file-name"
        >
          {attachmentName}
        </div>
        <div
          className={cn(
            isCompact
              ? "max-w-full truncate text-[14px] font-normal leading-[15px]"
              : "mt-1 max-w-full truncate text-[12px] leading-[16px]",
            isOwn ? "text-[color:var(--bubble-outgoing-meta)]" : "text-muted-foreground",
          )}
          data-testid="message-file-size"
        >
          {subtitle}
        </div>
      </div>
      {downloadState === "failed" && (
        <span className="sr-only" role="status" aria-live="polite">
          Download failed for {attachmentName}. Activate the download button to retry.
        </span>
      )}
    </div>
  );
}
