import { describe, expect, it } from "vitest";
import { applyMessageTextEdit, serializeMessageEntitiesForRequest, transformTextLinkEntities, trimTextAndEntities } from "./textEntities";

const entity = { type: "text_link" as const, offset: 2, length: 4, url: "https://example.com" };
const custom = {
  type: "custom_emoji" as const,
  offset: 0,
  length: 2,
  custom_emoji_id: "emoji-1",
  alt: "⚡️",
  custom_emoji: { id: "emoji-1", pack_id: "pack", media_file_id: "media", width: 512, height: 512, format: "webp" as const, alt: "⚡️" },
};

describe("text link ranges", () => {
  it("shifts, grows, shrinks, and removes entities using UTF-16 offsets", () => {
    expect(transformTextLinkEntities([entity], "xxlinkyy", "zzxxlinkyy")[0]).toMatchObject({ offset: 4, length: 4 });
    expect(transformTextLinkEntities([entity], "xxlinkyy", "xxliyy")).toEqual([{ ...entity, length: 2 }]);
    expect(transformTextLinkEntities([entity], "xxlinkyy", "xxyy")).toEqual([]);
  });

  it("counts emoji as two UTF-16 code units and trims ranges with the body", () => {
    const text = "🙂 Открыть сайт";
    const start = text.indexOf("О");
    const result = trimTextAndEntities(text, [{ type: "text_link", offset: start, length: 12, url: "https://example.com/" }]);
    expect(result.text).toBe(text);
    expect(result.entities[0].offset).toBe(start);
  });

  it("keeps custom emoji fallback ranges atomic during edits", () => {
    const before = "⚡️⚡️";
    const adjacent = [custom, { ...custom, offset: 2, custom_emoji_id: "emoji-2", custom_emoji: { ...custom.custom_emoji, id: "emoji-2" } }];
    expect(applyMessageTextEdit(adjacent, before, "⚡️x⚡️").entities).toHaveLength(2);
    expect(applyMessageTextEdit([custom], "⚡️", "⚡").entities).toEqual([]);
    expect(applyMessageTextEdit([custom], "⚡️", "").text).toBe("");
    expect(applyMessageTextEdit([custom], "⚡️", "⚡️!").entities[0]).toMatchObject({ offset: 0, length: 2 });
  });

  it("strips hydrated render metadata from outgoing entities", () => {
    expect(serializeMessageEntitiesForRequest([custom])).toEqual([{
      type: "custom_emoji",
      offset: 0,
      length: 2,
      custom_emoji_id: "emoji-1",
    }]);
  });
});
