import React from "react";
import { EmojiText } from "@/shared/components/Emoji/Emoji";
import { openExternalUrl } from "@/shared/utils/externalLinks";

export type TextEntity =
  | { kind: "text"; text: string; start: number; end: number }
  | { kind: "url"; text: string; start: number; end: number };

const URL_CANDIDATE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,!;:]+$/;

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

export function parseMessageText(text: string): TextEntity[] {
  const entities: TextEntity[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_CANDIDATE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const urlText = trimUrlPunctuation(raw);
    if (!urlText) continue;

    try {
      const url = new URL(urlText);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) continue;
    } catch {
      continue;
    }

    if (start > cursor) entities.push({ kind: "text", text: text.slice(cursor, start), start: cursor, end: start });
    const end = start + urlText.length;
    entities.push({ kind: "url", text: urlText, start, end });
    cursor = end;
  }

  if (cursor < text.length) entities.push({ kind: "text", text: text.slice(cursor), start: cursor, end: text.length });
  return entities.length ? entities : [{ kind: "text", text, start: 0, end: text.length }];
}

export function MessageText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={className} data-testid="message-rich-text">
      {parseMessageText(text).map((entity) =>
        entity.kind === "url" ? (
          <a
            key={`url-${entity.start}-${entity.end}`}
            href={entity.text}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void openExternalUrl(entity.text);
            }}
            style={{
              display: "inline",
              fontFamily: "inherit",
              fontSize: "16px",
              fontWeight: 400,
              lineHeight: "21px",
              color: "inherit",
              textDecorationLine: "underline",
              textDecorationStyle: "solid",
              textDecorationColor: "currentColor",
              textDecorationThickness: "auto",
              textUnderlineOffset: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
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
