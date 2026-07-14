import { describe, expect, it } from "vitest";
import { getCustomEmojiOnlyLayout, getPureCustomEmojiSequence } from "./customEmojiGeometry";

const document = (id: string) => ({
  id,
  pack_id: "pack-1",
  media_file_id: `media-${id}`,
  width: 512,
  height: 512,
  format: "webp" as const,
  alt: "⚡️",
});

function entities(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    type: "custom_emoji" as const,
    offset: index * 2,
    length: 2,
    custom_emoji_id: `emoji-${index}`,
    custom_emoji: document(`emoji-${index}`),
  }));
}

describe("custom emoji-only geometry", () => {
  it.each([
    [1, 112, "overlay"],
    [2, 80, "trailing"],
    [3, 64, "trailing"],
    [4, 48, "trailing"],
  ] as const)("maps %s custom emoji to %spx artwork", (count, itemSize, metadataMode) => {
    expect(getCustomEmojiOnlyLayout(count)).toEqual({ itemSize, gap: 0, metadataMode });
  });

  it("detects adjacent entities and rejects ordinary text between them", () => {
    expect(getPureCustomEmojiSequence("⚡️⚡️", entities(2))).toMatchObject({ count: 2, isPureCustomEmoji: true });
    expect(getPureCustomEmojiSequence("⚡️ x ⚡️", [
      { ...entities(2)[0], offset: 0 },
      { ...entities(2)[1], offset: 5 },
    ])).toMatchObject({ isPureCustomEmoji: false });
  });

  it("allows surrounding whitespace but rejects malformed or overlapping entities", () => {
    expect(getPureCustomEmojiSequence(" ⚡️⚡️ ", entities(2).map((entity) => ({ ...entity, offset: entity.offset + 1 })))).toMatchObject({ count: 2, isPureCustomEmoji: true });
    expect(getPureCustomEmojiSequence("⚡️⚡️", [
      { ...entities(2)[0], offset: 0, length: 3 },
      entities(2)[1],
    ])).toMatchObject({ isPureCustomEmoji: false });
  });
});
