import type { MessageTextEntity } from "@/shared/types";
import {
  isValidCustomEmojiDocument,
  normalizeMessageEntities,
} from "@/shared/utils/textEntities";

export type CustomEmojiOnlyLayout = {
  itemSize: 112 | 80 | 64 | 48;
  gap: 0;
  metadataMode: "overlay" | "trailing";
};

export function getCustomEmojiOnlyLayout(count: number): CustomEmojiOnlyLayout | null {
  switch (count) {
    case 1:
      return { itemSize: 112, gap: 0, metadataMode: "overlay" };
    case 2:
      return { itemSize: 80, gap: 0, metadataMode: "trailing" };
    case 3:
      return { itemSize: 64, gap: 0, metadataMode: "trailing" };
    case 4:
      return { itemSize: 48, gap: 0, metadataMode: "trailing" };
    default:
      return null;
  }
}

export function getPureCustomEmojiSequence(
  content: string,
  entities: readonly MessageTextEntity[] | null | undefined,
): { entities: Extract<MessageTextEntity, { type: "custom_emoji" }>[]; count: number; isPureCustomEmoji: boolean } {
  const source = entities ?? [];
  const normalized = normalizeMessageEntities(source, content);
  const allEntitiesSurvived = normalized.length === source.length;
  const customEntities = normalized.filter(
    (entity): entity is Extract<MessageTextEntity, { type: "custom_emoji" }> =>
      entity.type === "custom_emoji" && isValidCustomEmojiDocument(entity.custom_emoji),
  );

  let cursor = 0;
  const hasOnlyWhitespaceBetween = customEntities.every((entity) => {
    const segment = content.slice(cursor, entity.offset);
    const alt = entity.alt ?? entity.custom_emoji?.alt;
    const exactFallback = alt === undefined || content.slice(entity.offset, entity.offset + entity.length) === alt;
    cursor = entity.offset + entity.length;
    return segment.trim() === "" && exactFallback;
  });

  const isPureCustomEmoji = Boolean(
    source.length > 0 &&
    allEntitiesSurvived &&
    normalized.length === customEntities.length &&
    customEntities.length > 0 &&
    hasOnlyWhitespaceBetween &&
    content.slice(cursor).trim() === "",
  );

  return {
    entities: customEntities,
    count: customEntities.length,
    isPureCustomEmoji,
  };
}
