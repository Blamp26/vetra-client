import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";

interface Props {
  children: ReactNode;
  index: number;
  isConsecutive: boolean;
  isAlbumBoundary: boolean;
  isAttachmentRun: boolean;
  isGroupedWithNext?: boolean;
}

export function ConversationMessageGroup({ children, index, isConsecutive, isAlbumBoundary, isAttachmentRun, isGroupedWithNext = false }: Props) {
  const isPlainTextGroup = isConsecutive && !isAlbumBoundary && !isAttachmentRun;
  return (
    <div
      data-testid="message-row-spacing"
      data-attachment-run={isAttachmentRun ? "true" : "false"}
      data-grouped-with-previous={isConsecutive ? "true" : "false"}
      data-grouped-with-next={isGroupedWithNext ? "true" : "false"}
      className={cn(
        index === 0
          ? "mt-0"
          : isAlbumBoundary
            ? isConsecutive ? "mt-1.5" : "mt-2.5"
            : isAttachmentRun || isPlainTextGroup || isConsecutive ? "mt-0.5" : "mt-2.5",
      )}
    >
      {children}
    </div>
  );
}
