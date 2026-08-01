import type { ReactNode, Ref, UIEventHandler } from "react";
import { cn } from "@/shared/utils/cn";

interface Props {
  children: ReactNode;
  emptyState: ReactNode;
  hasContent: boolean;
  hasMore?: boolean;
  isLoading?: boolean;
  onLoadMore?: () => void;
  alignmentMode: "split" | "left-column";
  onScroll?: UIEventHandler<HTMLDivElement>;
  scrollRef?: Ref<HTMLDivElement>;
  railRef?: Ref<HTMLDivElement>;
  bottomRef?: Ref<HTMLDivElement>;
  scrollTestId?: string;
  railTestId?: string;
  loadMoreLabel?: string;
  dataMediaVisibilityRevision?: number;
}

export function ConversationTimeline({ children, emptyState, hasContent, hasMore = false, isLoading = false, onLoadMore, alignmentMode, onScroll, scrollRef, railRef, bottomRef, scrollTestId = "message-list-scroll", railTestId = "message-list-rail", loadMoreLabel = "Older messages", dataMediaVisibilityRevision }: Props) {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 pb-2 pt-4 scrollbar-hide sm:px-4" data-testid={scrollTestId} data-media-visibility-revision={dataMediaVisibilityRevision}>
        <div ref={railRef} className={cn("flex w-full max-w-[900px] flex-col", alignmentMode === "left-column" ? "mr-auto" : "mx-auto")} data-testid={railTestId} data-alignment-mode={alignmentMode}>
          {hasMore && onLoadMore && <div className="flex justify-center p-2"><button onClick={onLoadMore} disabled={isLoading} className="vt-button">{isLoading ? "Loading..." : loadMoreLabel}</button></div>}
          {!hasContent && !isLoading && emptyState}
          {children}
        </div>
        <div ref={bottomRef} aria-hidden="true" className="h-0 w-full" data-testid="message-list-bottom-anchor" />
      </div>
    </div>
  );
}
