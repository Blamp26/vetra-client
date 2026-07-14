import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";
import { AuthenticatedVideo } from "@/shared/components/AuthenticatedVideo";
import { API_BASE_URL } from "@/api/base";
import type { StickerMessage } from "@/shared/types";
import type { CSSProperties } from "react";

export function StickerArtwork({ sticker, className, style }: { sticker: StickerMessage; className?: string; style?: CSSProperties }) {
  const src = `${API_BASE_URL}/media/${sticker.media_file_id}`;
  const aspectRatio = `${sticker.width} / ${sticker.height}`;
  if (sticker.format === "webm") return <AuthenticatedVideo src={src} animatedSticker aria-label={sticker.emoji_tags.join(" ")} className={className} style={{ aspectRatio, ...style }} />;
  return <AuthenticatedImage src={src} alt={sticker.emoji_tags.join(" ")} className={className} style={{ aspectRatio, ...style }} />;
}
