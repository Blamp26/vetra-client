import type { CSSProperties } from "react";
import { cn } from "@/shared/utils/cn";
import { getAttachmentDisplayName } from "../../utils/attachments";
import type { MediaAlbumLayout, MediaAlbumTile } from "../../utils/mediaAlbumLayout";
import {
  VisualAttachmentTile,
  type VisualTileAttachment,
  type VisualTileRuntimeMetrics,
} from "./VisualAttachmentTile";

export type ResolvedVisualAttachment = {
  attachment: VisualTileAttachment;
  displaySrc: string | null;
  lightboxSrc: string | null;
  serverWidth?: number;
  serverHeight?: number;
  width?: number;
  height?: number;
  dimensionSource: "server" | "decoded" | "fallback";
};

type VisualRuntimeMetrics = VisualTileRuntimeMetrics & {
  chosenImageSource: string | null;
};

interface VisualAttachmentGroupProps {
  attachments: ResolvedVisualAttachment[];
  layout: MediaAlbumLayout;
  albumMaxWidth: number;
  hasCaption: boolean;
  isMediaOnly: boolean;
  isTemporaryLayout: boolean;
  isDebugEnabled: boolean;
  runtimeMetricsByAttachmentId: Record<string, VisualRuntimeMetrics>;
  getPackingRatio: (width?: number, height?: number) => number;
  onOpen: (attachment: VisualTileAttachment, index: number) => void;
  onDecodedDimensions: (attachmentId: string, naturalWidth: number, naturalHeight: number) => void;
  onDiagnostics: (
    attachmentId: string,
    chosenImageSource: string | null,
    diagnostics: VisualTileRuntimeMetrics,
  ) => void;
}

function toPercent(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toFixed(4)}%`;
}

function getTileCornerRadius(
  tile: MediaAlbumTile,
  radius: { top: number; bottom: number },
) {
  return [
    tile.outerCorners.topLeft ? `${radius.top}px` : "0px",
    tile.outerCorners.topRight ? `${radius.top}px` : "0px",
    tile.outerCorners.bottomRight ? `${radius.bottom}px` : "0px",
    tile.outerCorners.bottomLeft ? `${radius.bottom}px` : "0px",
  ].join(" ");
}

export function VisualAttachmentGroup({
  attachments,
  layout,
  albumMaxWidth,
  hasCaption,
  isMediaOnly,
  isTemporaryLayout,
  isDebugEnabled,
  runtimeMetricsByAttachmentId,
  getPackingRatio,
  onOpen,
  onDecodedDimensions,
  onDiagnostics,
}: VisualAttachmentGroupProps) {
  const tileRadius = isMediaOnly
    ? { top: 15, bottom: 6 }
    : hasCaption
      ? { top: 15, bottom: 0 }
      : { top: 14, bottom: 8 };
  const mediaFrameClassName = hasCaption
    ? "mb-[6px] mt-[-5px] overflow-hidden rounded-t-[15px] rounded-b-none"
    : "";
  const mediaFrameOffsetStyle: CSSProperties | undefined = hasCaption
    ? { transform: "translateX(-8px)" }
    : undefined;

  if (attachments.length > 1) {
    if (isTemporaryLayout) {
      return (
        <div
          className={cn("max-w-full", !hasCaption && "overflow-hidden", mediaFrameClassName)}
          style={{
            width: hasCaption
              ? `min(${albumMaxWidth + 16}px, calc(100vw - 5rem))`
              : `min(${albumMaxWidth}px, calc(100vw - 6rem))`,
            maxWidth: hasCaption ? "calc(100% + 16px)" : "100%",
            ...mediaFrameOffsetStyle,
          }}
          data-testid="message-photo-collage"
          data-photo-layout-state="pending"
        >
          <div className="grid h-full w-full grid-cols-2 gap-[2px] overflow-hidden">
            {attachments.map((currentAttachment, index) => {
              const runtimeMetrics = runtimeMetricsByAttachmentId[currentAttachment.attachment.id];
              const attachmentName = getAttachmentDisplayName(currentAttachment.attachment);

              return (
                <VisualAttachmentTile
                  key={currentAttachment.attachment.id}
                  attachment={currentAttachment.attachment}
                  attachmentName={attachmentName}
                  displaySrc={currentAttachment.displaySrc}
                  index={index}
                  buttonClassName="relative aspect-square overflow-hidden"
                  buttonTestId="message-photo-collage-tile"
                  isDebugEnabled={isDebugEnabled}
                  serverWidth={currentAttachment.serverWidth}
                  serverHeight={currentAttachment.serverHeight}
                  runtimeMetrics={runtimeMetrics}
                  computedRatio={getPackingRatio(currentAttachment.width, currentAttachment.height)}
                  onOpen={onOpen}
                  onDecodedDimensions={onDecodedDimensions}
                  onDiagnostics={onDiagnostics}
                />
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn("relative max-w-full", !hasCaption && "overflow-hidden", mediaFrameClassName)}
        style={{
          width: hasCaption ? `${layout.width + 16}px` : `${layout.width}px`,
          maxWidth: hasCaption ? "calc(100% + 16px)" : "100%",
          aspectRatio: `${layout.width} / ${layout.height}`,
          ...mediaFrameOffsetStyle,
        }}
        data-testid="message-photo-collage"
        data-photo-layout-state="resolved"
      >
        <div className="relative h-full w-full overflow-hidden" data-testid="message-photo-collage-inner">
          {attachments.map((currentAttachment, index) => {
            const tile = layout.tiles[index];
            const tileStyle = {
              left: toPercent(tile.x, layout.width),
              top: toPercent(tile.y, layout.height),
              width: toPercent(tile.width, layout.width),
              height: toPercent(tile.height, layout.height),
              borderRadius: getTileCornerRadius(tile, tileRadius),
            } as const;
            const attachmentName = getAttachmentDisplayName(currentAttachment.attachment);
            const runtimeMetrics = runtimeMetricsByAttachmentId[currentAttachment.attachment.id];

            return (
              <VisualAttachmentTile
                key={currentAttachment.attachment.id}
                attachment={currentAttachment.attachment}
                attachmentName={attachmentName}
                displaySrc={currentAttachment.displaySrc}
                index={tile.index}
                wrapperClassName="absolute overflow-hidden"
                wrapperTestId={`message-photo-collage-tile-${tile.index}`}
                wrapperStyle={tileStyle}
                buttonClassName="relative block h-full w-full overflow-hidden"
                buttonTestId="message-photo-collage-tile"
                isDebugEnabled={isDebugEnabled}
                serverWidth={currentAttachment.serverWidth}
                serverHeight={currentAttachment.serverHeight}
                runtimeMetrics={runtimeMetrics}
                computedRatio={getPackingRatio(currentAttachment.width, currentAttachment.height)}
                onOpen={onOpen}
                onDecodedDimensions={onDecodedDimensions}
                onDiagnostics={onDiagnostics}
              />
            );
          })}
        </div>
      </div>
    );
  }

  const currentAttachment = attachments[0];
  if (!currentAttachment) return null;
  const attachmentName = getAttachmentDisplayName(currentAttachment.attachment);
  if (!currentAttachment.lightboxSrc) return null;

  return (
    <div
      className={mediaFrameClassName}
      style={{
        width: hasCaption ? `${layout.width + 16}px` : undefined,
        maxWidth: hasCaption ? "calc(100% + 16px)" : undefined,
        aspectRatio: hasCaption ? `${layout.width} / ${layout.height}` : undefined,
        ...mediaFrameOffsetStyle,
      }}
    >
      <VisualAttachmentTile
        attachment={currentAttachment.attachment}
        attachmentName={attachmentName}
        displaySrc={currentAttachment.displaySrc}
        index={0}
        buttonClassName={cn("relative block h-full w-full", !hasCaption && "overflow-hidden")}
        buttonTestId="message-media-shell"
        buttonStyle={{
          width: !hasCaption ? `${layout.width}px` : undefined,
          maxWidth: !hasCaption ? "100%" : undefined,
          aspectRatio: !hasCaption ? `${layout.width} / ${layout.height}` : undefined,
        }}
        photoLayoutState={currentAttachment.dimensionSource === "fallback" ? "pending" : "resolved"}
        isDebugEnabled={isDebugEnabled}
        serverWidth={currentAttachment.serverWidth}
        serverHeight={currentAttachment.serverHeight}
        runtimeMetrics={runtimeMetricsByAttachmentId[currentAttachment.attachment.id]}
        computedRatio={getPackingRatio(currentAttachment.width, currentAttachment.height)}
        onOpen={onOpen}
        onDecodedDimensions={onDecodedDimensions}
        onDiagnostics={onDiagnostics}
      />
    </div>
  );
}
