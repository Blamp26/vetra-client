import type { ReactNode } from "react";

import { normalizeTextLinkEntities } from "@/shared/utils/textEntities";
import type { MessageTextEntity } from "@/shared/types";
import { StickerArtwork } from "../StickerPicker/StickerArtwork";

type Props = {
  text: string;
  entities: readonly MessageTextEntity[];
  className?: string;
  scrollTop?: number;
};

export function ComposerTextDecoration({ text, entities, className = "", scrollTop = 0 }: Props) {
  const validEntities = normalizeTextLinkEntities(entities, text);
  const segments: ReactNode[] = [];
  let cursor = 0;

  validEntities.forEach((entity) => {
    const end = entity.offset + entity.length;
    if (entity.offset > cursor) {
      segments.push(<span key={`text-${cursor}-${entity.offset}`}>{text.slice(cursor, entity.offset)}</span>);
    }
    if (entity.type === "custom_emoji" && entity.custom_emoji) {
      segments.push(<span key={`custom-emoji-${entity.custom_emoji_id}-${entity.offset}-${end}`} className="inline-flex h-5 w-5 align-text-bottom" aria-label={entity.alt ?? text.slice(entity.offset, end)}><StickerArtwork sticker={entity.custom_emoji} className="h-5 w-5 object-contain" /></span>);
    } else {
      segments.push(<span key={`text_link-${entity.offset}-${end}`} className="vt-composer-text-decoration__link" data-testid={`composer-text-link-${entity.offset}-${end}`}>{text.slice(entity.offset, end)}</span>);
    }
    cursor = end;
  });

  if (cursor < text.length) {
    segments.push(<span key={`text-${cursor}-${text.length}`}>{text.slice(cursor)}</span>);
  }

  return (
    <div
      aria-hidden="true"
      className={`vt-composer-text-decoration ${className}`.trim()}
      data-testid="composer-text-decoration"
      style={scrollTop > 0 ? { transform: `translateY(-${scrollTop}px)` } : undefined}
    >
      {segments.length > 0 ? segments : text}
    </div>
  );
}
