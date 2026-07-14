import type { MessageTextLinkEntity, MessageTextEntity } from "@/shared/types";

export type TextLinkEntity = MessageTextLinkEntity;
export type { MessageTextEntity };

export function utf16Length(text: string): number {
  return text.length;
}

export function normalizeMessageEntities(
  entities: readonly MessageTextEntity[] | null | undefined,
  text: string,
): MessageTextEntity[] {
  const max = utf16Length(text);
  return (entities ?? [])
    .filter((entity) =>
      Number.isInteger(entity.offset) && entity.offset >= 0 &&
      Number.isInteger(entity.length) && entity.length > 0 &&
      entity.offset + entity.length <= max &&
      ((entity.type === "text_link" && typeof entity.url === "string") ||
       (entity.type === "custom_emoji" && typeof entity.custom_emoji_id === "string")),
    )
    .map((entity) => ({ ...entity }))
    .sort((a, b) => a.offset - b.offset);
}

export const normalizeTextLinkEntities = normalizeMessageEntities;

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
