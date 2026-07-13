import { describe, expect, it } from "vitest";
import { transformTextLinkEntities, trimTextAndEntities } from "./textEntities";

const entity = { type: "text_link" as const, offset: 2, length: 4, url: "https://example.com" };

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
});
