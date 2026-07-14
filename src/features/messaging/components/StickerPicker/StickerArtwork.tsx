import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";
import { AuthenticatedVideo } from "@/shared/components/AuthenticatedVideo";
import { API_BASE_URL } from "@/api/base";
import type { StickerMessage } from "@/shared/types";
import type { CSSProperties } from "react";
import { MediaVisibilityContext } from "@/shared/components/MediaVisibilityContext";

export function StickerArtwork({ sticker, className, style, visibilityRoot }: { sticker: StickerMessage; className?: string; style?: CSSProperties; visibilityRoot?: HTMLElement | null }) {
  const src = `${API_BASE_URL}/media/${sticker.media_file_id}`;
  const aspectRatio = `${sticker.width} / ${sticker.height}`;
  if (sticker.format === "webm") return <MediaVisibilityContext.Provider value={{ root: visibilityRoot ?? null, revision: 0 }}><AuthenticatedVideo src={src} animatedSticker aria-label={sticker.emoji_tags.join(" ")} className={className} style={{ aspectRatio, ...style }} /></MediaVisibilityContext.Provider>;
  return <AuthenticatedImage src={src} alt={sticker.emoji_tags.join(" ")} className={className} style={{ aspectRatio, ...style }} />;
}
