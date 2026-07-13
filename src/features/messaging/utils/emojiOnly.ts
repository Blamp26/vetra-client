type GraphemeSegmenter = {
  segment(value: string): Iterable<{ segment: string }>;
};

type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locales?: string | string[],
    options?: { granularity: "grapheme" },
  ) => GraphemeSegmenter;
};

const IntlRuntime = Intl as IntlWithSegmenter;
const graphemeSegmenter =
  typeof IntlRuntime.Segmenter === "function"
    ? new IntlRuntime.Segmenter(undefined, { granularity: "grapheme" })
    : null;

const keycapPattern = /^[0-9#*]\uFE0F?\u20E3$/u;
const flagPattern = /^\p{Regional_Indicator}{2}$/u;
const emojiPresentationPattern = /\p{Emoji_Presentation}/u;
const emojiModifierPattern = /\p{Emoji_Modifier}/u;
const variationSelectorPattern = /\uFE0F/u;
const joinerPattern = /\u200D/u;

function isEmojiGrapheme(grapheme: string) {
  if (keycapPattern.test(grapheme) || flagPattern.test(grapheme)) return true;
  if (
    !emojiPresentationPattern.test(grapheme) &&
    !emojiModifierPattern.test(grapheme) &&
    !variationSelectorPattern.test(grapheme)
  ) {
    return false;
  }

  for (const codePoint of Array.from(grapheme)) {
    if (
      !/\p{Emoji}/u.test(codePoint) &&
      !/\p{Emoji_Modifier}/u.test(codePoint) &&
      codePoint !== "\uFE0F" &&
      codePoint !== "\uFE0E" &&
      codePoint !== "\u200D" &&
      !/\p{Regional_Indicator}/u.test(codePoint)
    ) {
      return false;
    }
  }

  return (
    joinerPattern.test(grapheme) ||
    emojiPresentationPattern.test(grapheme) ||
    variationSelectorPattern.test(grapheme)
  );
}

export function getEmojiOnlyGraphemes(value: string): string[] | null {
  const text = value.trim();
  if (!text || !graphemeSegmenter) return null;

  const graphemes = Array.from(
    graphemeSegmenter.segment(text),
    ({ segment }) => segment,
  );
  return graphemes.length > 0 && graphemes.every(isEmojiGrapheme)
    ? graphemes
    : null;
}
