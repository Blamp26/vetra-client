import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";
import { AuthenticatedVideo } from "@/shared/components/AuthenticatedVideo";
import { API_BASE_URL } from "@/api/base";
import type { CustomEmojiDocument, StickerMessage } from "@/shared/types";
import type { CSSProperties } from "react";
import { MediaVisibilityContext } from "@/shared/components/MediaVisibilityContext";

export type StickerArtworkSource = StickerMessage | CustomEmojiDocument;

export function stickerArtworkLabel(sticker: StickerArtworkSource): string {
  return sticker.alt?.trim() || sticker.emoji_tags?.filter(Boolean).join(" ").trim() || "Custom emoji";
}

export function StickerArtwork({ sticker, className, style, visibilityRoot }: { sticker: StickerArtworkSource; className?: string; style?: CSSProperties; visibilityRoot?: HTMLElement | null }) {
  const src = `${API_BASE_URL}/media/${sticker.media_file_id}`;
  const aspectRatio = `${sticker.width} / ${sticker.height}`;
  const label = stickerArtworkLabel(sticker);
  if (!sticker.media_file_id || !Number.isFinite(sticker.width) || sticker.width <= 0 || !Number.isFinite(sticker.height) || sticker.height <= 0) {
    return <span className={className} style={style} aria-label={label}>{label}</span>;
  }
  if (sticker.format === "webm") return <MediaVisibilityContext.Provider value={{ root: visibilityRoot ?? null, revision: 0 }}><AuthenticatedVideo src={src} animatedSticker aria-label={label} className={className} style={{ aspectRatio, ...style }} /></MediaVisibilityContext.Provider>;
  return <AuthenticatedImage src={src} alt={label} className={className} style={{ aspectRatio, ...style }} />;
}
