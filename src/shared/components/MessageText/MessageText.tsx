import React from "react";
import { EmojiText } from "@/shared/components/Emoji/Emoji";
import { openExternalUrl } from "@/shared/utils/externalLinks";
import type { MessageTextLinkEntity } from "@/shared/types";
import { normalizeTextLinkEntities } from "@/shared/utils/textEntities";

export type TextEntity =
  | { kind: "text"; text: string; start: number; end: number }
  | { kind: "url" | "text_link"; text: string; start: number; end: number; href?: string };

const URL_CANDIDATE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,!;:]+$/;

function isSafeTextLinkUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function trimUrlPunctuation(candidate: string): string {
  let value = candidate;
  while (TRAILING_PUNCTUATION.test(value)) value = value.slice(0, -1);

  // A closing parenthesis is sentence punctuation unless the URL contains a
  // matching opening parenthesis in its path/query/fragment.
  while (value.endsWith(")")) {
    const opens = (value.match(/\(/g) ?? []).length;
    const closes = (value.match(/\)/g) ?? []).length;
    if (closes <= opens) break;
    value = value.slice(0, -1);
  }
  return value;
}

export function parseMessageText(text: string, explicitEntities: readonly MessageTextLinkEntity[] = []): TextEntity[] {
  const entities: TextEntity[] = [];
  let cursor = 0;
  const claimed = normalizeTextLinkEntities(explicitEntities, text).filter((entity) => {
      return isSafeTextLinkUrl(entity.url);
  });
  const pushTextAndAutomaticUrls = (segment: string, segmentStart: number) => {
    for (const match of segment.matchAll(URL_CANDIDATE)) {
      const raw = match[0];
      const localStart = match.index ?? 0;
      const urlText = trimUrlPunctuation(raw);
      const start = segmentStart + localStart;
      if (!urlText || claimed.some((entity) => entity.offset < start + urlText.length && entity.offset + entity.length > start)) continue;
      try {
        const url = new URL(urlText);
        if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) continue;
      } catch { continue; }
      if (start > cursor) entities.push({ kind: "text", text: text.slice(cursor, start), start: cursor, end: start });
      entities.push({ kind: "url", text: urlText, start, end: start + urlText.length });
      cursor = start + urlText.length;
    }
  };

  for (const entity of claimed) {
    if (entity.offset > cursor) pushTextAndAutomaticUrls(text.slice(cursor, entity.offset), cursor);
    if (cursor < entity.offset) entities.push({ kind: "text", text: text.slice(cursor, entity.offset), start: cursor, end: entity.offset });
    entities.push({ kind: "text_link", text: text.slice(entity.offset, entity.offset + entity.length), href: entity.url, start: entity.offset, end: entity.offset + entity.length });
    cursor = entity.offset + entity.length;
  }
  pushTextAndAutomaticUrls(text.slice(cursor), cursor);

  if (cursor < text.length) entities.push({ kind: "text", text: text.slice(cursor), start: cursor, end: text.length });
  return entities.length ? entities : [{ kind: "text", text, start: 0, end: text.length }];
}

export function MessageText({ text, entities: explicitEntities = [], className = "" }: { text: string; entities?: readonly MessageTextLinkEntity[]; className?: string }) {
  return (
    <span className={className} data-testid="message-rich-text">
      {parseMessageText(text, explicitEntities).map((entity) =>
        entity.kind === "url" || entity.kind === "text_link" ? (
          <a
            key={`${entity.kind}-${entity.start}-${entity.end}`}
            href={entity.href ?? entity.text}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void openExternalUrl(entity.href ?? entity.text);
            }}
            style={{
              display: "inline",
              fontFamily: "inherit",
              fontSize: entity.kind === "text_link" ? "inherit" : "16px",
              fontWeight: entity.kind === "text_link" ? "inherit" : 400,
              lineHeight: entity.kind === "text_link" ? "inherit" : "21px",
              color: "inherit",
              textDecorationLine: "underline",
              textDecorationStyle: "solid",
              textDecorationColor: "currentColor",
              textDecorationThickness: "auto",
              textUnderlineOffset: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: entity.kind === "text_link" ? "normal" : "break-all",
              overflowWrap: "break-word",
              cursor: "pointer",
              margin: 0,
              padding: 0,
              background: "none",
              border: 0,
              borderRadius: 0,
            }}
          >
            {entity.text}
          </a>
        ) : (
          <React.Fragment key={`text-${entity.start}-${entity.end}`}>
            <EmojiText text={entity.text} />
          </React.Fragment>
        ),
      )}
    </span>
  );
}
