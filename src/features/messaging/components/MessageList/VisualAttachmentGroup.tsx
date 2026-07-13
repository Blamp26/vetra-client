import { cn } from "@/shared/utils/cn";
import { getAttachmentDisplayName } from "../../utils/attachments";
import type { MediaAlbumLayout } from "../../utils/mediaAlbumLayout";
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
  hasContentAboveMedia: boolean;
  hasForwardedHeader: boolean;
  isTemporaryLayout: boolean;
  isDebugEnabled: boolean;
  runtimeMetricsByAttachmentId: Record<string, VisualRuntimeMetrics>;
  getPackingRatio: (width?: number, height?: number) => number;
  onOpen: (attachment: VisualTileAttachment, index: number) => void;
  onDecodedDimensions: (attachmentId: string, naturalWidth: number, naturalHeight: number) => void;
  singleMediaCornerClassName?: string;
  albumShellCornerClassName?: string;
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

export function VisualAttachmentGroup({
  attachments,
  layout,
  albumMaxWidth,
  hasCaption,
  hasContentAboveMedia,
  hasForwardedHeader,
  isTemporaryLayout,
  isDebugEnabled,
  runtimeMetricsByAttachmentId,
  getPackingRatio,
  onOpen,
  onDecodedDimensions,
  onDiagnostics,
  singleMediaCornerClassName,
  albumShellCornerClassName,
}: VisualAttachmentGroupProps) {
  const isAlbum = attachments.length > 1;
  const isSurroundedAlbum = isAlbum && hasContentAboveMedia && hasCaption;
  const isFullBleedSingleMedia = hasForwardedHeader && !isAlbum;
  const mediaFrameClassName = isFullBleedSingleMedia
    ? cn(
        "mt-[4px] ml-[-8px] mr-[-8px] overflow-hidden",
        hasCaption ? "mb-[6px]" : "mb-[-6px]",
      )
    : hasCaption
      ? cn(
          "mb-[6px] ml-[-8px] mr-[-8px] overflow-hidden",
          isSurroundedAlbum
            ? "mt-[4px] rounded-none"
            : "mt-[-5px] rounded-t-[15px] rounded-b-none",
        )
      : "";
  const albumShellClassName = cn(
    "relative max-w-full overflow-hidden border-0 p-0 shadow-none",
    isSurroundedAlbum
      ? "rounded-none"
      : cn(
          albumShellCornerClassName,
          hasContentAboveMedia && "rounded-tl-[0px] rounded-tr-[0px]",
        ),
  );

  if (attachments.length > 1) {
    if (isTemporaryLayout) {
      return (
        <div
          className={cn(albumShellClassName, mediaFrameClassName)}
          style={{
            width: hasCaption
              ? `min(${albumMaxWidth}px, calc(100vw - 6rem))`
              : `min(${albumMaxWidth}px, calc(100vw - 6rem))`,
            maxWidth: hasCaption ? "calc(100% + 16px)" : "100%",
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
                  buttonClassName="relative m-0 aspect-square overflow-hidden rounded-none border-0 p-0"
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
        className={cn(albumShellClassName, mediaFrameClassName)}
        style={{
          width: `${layout.width}px`,
          maxWidth: hasCaption ? "calc(100% + 16px)" : "100%",
          aspectRatio: `${layout.width} / ${layout.height}`,
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
              borderRadius: "0px",
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
                wrapperClassName="absolute m-0 overflow-hidden rounded-none border-0 p-0"
                wrapperTestId={`message-photo-collage-tile-${tile.index}`}
                wrapperStyle={tileStyle}
                buttonClassName="relative m-0 block h-full w-full overflow-hidden rounded-none border-0 p-0"
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
      className={cn(mediaFrameClassName, !isAlbum && singleMediaCornerClassName)}
      style={{
        width: isFullBleedSingleMedia || hasCaption ? `${layout.width}px` : undefined,
        maxWidth: isFullBleedSingleMedia || hasCaption ? "calc(100% + 16px)" : undefined,
        aspectRatio: isFullBleedSingleMedia || hasCaption ? `${layout.width} / ${layout.height}` : undefined,
      }}
    >
      <VisualAttachmentTile
        attachment={currentAttachment.attachment}
        attachmentName={attachmentName}
        displaySrc={currentAttachment.displaySrc}
        index={0}
        buttonClassName={cn(
          "relative flex h-full w-full items-center justify-center overflow-hidden",
          singleMediaCornerClassName,
        )}
        buttonTestId="message-media-shell"
        buttonStyle={{
          width: !isFullBleedSingleMedia && !hasCaption ? `${layout.width}px` : undefined,
          maxWidth: !isFullBleedSingleMedia && !hasCaption ? "100%" : undefined,
          aspectRatio: !isFullBleedSingleMedia && !hasCaption ? `${layout.width} / ${layout.height}` : undefined,
        }}
        photoLayoutState={currentAttachment.dimensionSource === "fallback" ? "pending" : "resolved"}
        isDebugEnabled={isDebugEnabled}
        serverWidth={currentAttachment.serverWidth}
        serverHeight={currentAttachment.serverHeight}
        runtimeMetrics={runtimeMetricsByAttachmentId[currentAttachment.attachment.id]}
        computedRatio={getPackingRatio(currentAttachment.width, currentAttachment.height)}
        centerVideoPlayControl
        onOpen={onOpen}
        onDecodedDimensions={onDecodedDimensions}
        onDiagnostics={onDiagnostics}
      />
    </div>
  );
}
