import type { ReactNode } from "react";

import { normalizeTextLinkEntities, type TextLinkEntity } from "@/shared/utils/textEntities";

type Props = {
  text: string;
  entities: readonly TextLinkEntity[];
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
    segments.push(
      <span
        key={`text_link-${entity.offset}-${end}`}
        className="vt-composer-text-decoration__link"
        data-testid={`composer-text-link-${entity.offset}-${end}`}
      >
        {text.slice(entity.offset, end)}
      </span>,
    );
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
