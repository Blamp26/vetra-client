import { describe, expect, it } from "vitest";
import { getEmojiOnlyGraphemes } from "./emojiOnly";

describe("getEmojiOnlyGraphemes", () => {
  it.each([
    ["😀", 1],
    ["👨‍👩‍👧‍👦", 1],
    ["🇺🇦", 1],
    ["👍🏽", 1],
    ["1️⃣", 1],
    ["😀😎", 2],
  ])("recognizes %s as %i emoji grapheme(s)", (value, count) => {
    expect(getEmojiOnlyGraphemes(value)).toHaveLength(count);
  });

  it.each(["hello", "😀 hello", "!!!", "123", "©", ""])(
    "rejects %s",
    (value) => {
      expect(getEmojiOnlyGraphemes(value)).toBeNull();
    },
  );

  it("ignores surrounding whitespace", () => {
    expect(getEmojiOnlyGraphemes("  ❤️  ")).toEqual(["❤️"]);
  });
});
