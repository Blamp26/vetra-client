import type { CustomEmojiDocument, MessageTextLinkEntity, MessageTextEntity } from "@/shared/types";

export type TextLinkEntity = MessageTextLinkEntity;
export type { MessageTextEntity };

export function isValidCustomEmojiDocument(document: CustomEmojiDocument | null | undefined): document is CustomEmojiDocument {
  return Boolean(
    document &&
    typeof document.id === "string" &&
    typeof document.media_file_id === "string" &&
    document.media_file_id.length > 0 &&
    typeof document.format === "string" &&
    Number.isFinite(document.width) && document.width > 0 &&
    Number.isFinite(document.height) && document.height > 0,
  );
}

export function utf16Length(text: string): number {
  return text.length;
}

export function normalizeMessageEntities(
  entities: readonly MessageTextEntity[] | null | undefined,
  text: string,
): MessageTextEntity[] {
  const max = utf16Length(text);
  const sorted = (entities ?? [])
    .filter((entity) =>
      Number.isInteger(entity.offset) && entity.offset >= 0 &&
      Number.isInteger(entity.length) && entity.length > 0 &&
      entity.offset + entity.length <= max &&
      ((entity.type === "text_link" && typeof entity.url === "string") ||
       (entity.type === "custom_emoji" && typeof entity.custom_emoji_id === "string")),
    )
    .map((entity) => ({ ...entity }))
    .sort((a, b) => a.offset - b.offset);

  const valid: MessageTextEntity[] = [];
  let previousEnd = 0;
  for (const entity of sorted) {
    const end = entity.offset + entity.length;
    if (entity.offset < previousEnd) continue;
    if (entity.type === "custom_emoji") {
      if (entity.alt && text.slice(entity.offset, end) !== entity.alt) continue;
      if (entity.custom_emoji && !isValidCustomEmojiDocument(entity.custom_emoji)) continue;
    }
    valid.push(entity);
    previousEnd = end;
  }
  return valid;
}

export const normalizeTextLinkEntities = normalizeMessageEntities;

export function serializeMessageEntitiesForRequest(
  entities: readonly MessageTextEntity[] | null | undefined,
): MessageTextEntity[] {
  return (entities ?? []).map((entity) => {
    if (entity.type === "custom_emoji") {
      return {
        type: "custom_emoji" as const,
        offset: entity.offset,
        length: entity.length,
        custom_emoji_id: entity.custom_emoji_id,
      };
    }
    return { ...entity };
  });
}

export function mergeEditedMessageEntities(
  existing: readonly MessageTextEntity[] | null | undefined,
  incoming: readonly MessageTextEntity[] | null | undefined,
  content: string,
): MessageTextEntity[] {
  const hydratedFallback = new Map(
    (existing ?? [])
      .filter((entity): entity is Extract<MessageTextEntity, { type: "custom_emoji" }> => entity.type === "custom_emoji" && isValidCustomEmojiDocument(entity.custom_emoji))
      .map((entity) => [entity.custom_emoji_id, entity.custom_emoji]),
  );
  const merged = (incoming ?? []).map((entity) => {
    if (entity.type !== "custom_emoji") return entity;
    if (isValidCustomEmojiDocument(entity.custom_emoji)) return entity;
    const fallback = hydratedFallback.get(entity.custom_emoji_id);
    return fallback ? { ...entity, custom_emoji: fallback, alt: entity.alt ?? fallback.alt } : entity;
  });
  return normalizeMessageEntities(merged, content);
}

export function transformTextLinkEntities(
  entities: readonly MessageTextEntity[],
  oldText: string,
  newText: string,
): MessageTextEntity[] {
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start += 1;
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const delta = (newEnd - start) - (oldEnd - start);
  return normalizeTextLinkEntities(entities.flatMap((entity) => {
    const entityEnd = entity.offset + entity.length;
    const editIsInsertion = oldEnd === start;
    if (oldEnd <= entity.offset) return [{ ...entity, offset: entity.offset + delta }];
    if (start >= entityEnd) return [{ ...entity }];
    if (editIsInsertion && start > entity.offset && start < entityEnd) {
      return [{ ...entity, length: entity.length + delta }];
    }
    if (start >= entity.offset && oldEnd <= entityEnd && newEnd >= start) {
      const nextLength = entity.length + delta;
      return nextLength > 0 ? [{ ...entity, length: nextLength }] : [];
    }
    return [];
  }), newText);
}

export function applyMessageTextEdit(
  entities: readonly MessageTextEntity[],
  oldText: string,
  newText: string,
): { text: string; entities: MessageTextEntity[] } {
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start += 1;
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const intersectingCustom = entities.find(
    (entity) => entity.type === "custom_emoji" && start < entity.offset + entity.length && oldEnd > entity.offset,
  );
  const insertionInside = intersectingCustom && oldEnd === start;
  const effectiveStart = insertionInside ? intersectingCustom.offset + intersectingCustom.length : Math.min(start, intersectingCustom?.offset ?? start);
  const effectiveOldEnd = insertionInside ? effectiveStart : Math.max(oldEnd, intersectingCustom ? intersectingCustom.offset + intersectingCustom.length : oldEnd);
  const replacement = newText.slice(start, newEnd);
  const effectiveText = oldText.slice(0, effectiveStart) + replacement + oldText.slice(effectiveOldEnd);
  const delta = replacement.length - (effectiveOldEnd - effectiveStart);
  const nextEntities = entities.flatMap((entity) => {
    const entityEnd = entity.offset + entity.length;
    if (effectiveOldEnd <= entity.offset) return [{ ...entity, offset: entity.offset + delta }];
    if (effectiveStart >= entityEnd) return [{ ...entity }];
    if (entity.type === "custom_emoji") return [];
    const nextLength = entity.length + delta;
    return nextLength > 0 ? [{ ...entity, length: nextLength }] : [];
  });
  return { text: effectiveText, entities: normalizeMessageEntities(nextEntities, effectiveText) };
}

export function transformMessageEntities(
  entities: readonly MessageTextEntity[],
  oldText: string,
  newText: string,
): MessageTextEntity[] {
  return applyMessageTextEdit(entities, oldText, newText).entities;
}

export function trimTextAndEntities(
  text: string,
  entities: readonly MessageTextEntity[],
): { text: string; entities: MessageTextEntity[] } {
  const leading = text.length - text.trimStart().length;
  const trimmed = text.trim();
  const trailingEnd = leading + trimmed.length;
  const next = entities.flatMap((entity) => {
    const start = Math.max(entity.offset, leading);
    const end = Math.min(entity.offset + entity.length, trailingEnd);
    return end > start
      ? [{ ...entity, offset: start - leading, length: end - start }]
      : [];
  });
  return { text: trimmed, entities: normalizeTextLinkEntities(next, trimmed) };
}

export function entitiesIntersectingRange(
  entities: readonly MessageTextEntity[],
  start: number,
  end: number,
): MessageTextEntity[] {
  return entities.filter((entity) => entity.offset < end && entity.offset + entity.length > start).map((entity) => ({ ...entity }));
}
