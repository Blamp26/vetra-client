export const LARGE_EMOJI_SIZE = 36;
export const LARGE_EMOJI_OUTLINE = 1;
export const LARGE_EMOJI_SKIP = 4;
// Telegram's sticker destination is 112px, but the browser emoji assets have
// less transparent inset and therefore need a 96px calibrated destination.
export const LARGE_EMOJI_SINGLE_SIZE = 96;

export type IntrinsicEmojiSize = {
  width: number;
  height: number;
};

export type LargeEmojiLayout = {
  cellSize: number;
  contentWidth: number;
  contentHeight: number;
  gap: number;
};

/**
 * Telegram uses its animated-emoji pack for an eligible single emoji and
 * falls back to the compact sprite path when that representation is absent.
 * Regional-indicator pairs are the browser asset equivalent of that fallback:
 * they have a compact flag representation rather than a large emoji sticker.
 */
export function hasLargeEmojiRepresentation(emoji: string): boolean {
  return !/^\p{Regional_Indicator}{2}$/u.test(emoji);
}

export function getSingleLargeEmojiSize(emoji: string): number {
  return hasLargeEmojiRepresentation(emoji)
    ? LARGE_EMOJI_SINGLE_SIZE
    : LARGE_EMOJI_SIZE + 2 * LARGE_EMOJI_OUTLINE;
}

export function getLargeEmojiLayout(count: number): LargeEmojiLayout {
  const safeCount = Math.max(1, Math.floor(count));
  const cellSize = LARGE_EMOJI_SIZE + 2 * LARGE_EMOJI_OUTLINE;
  const gap = LARGE_EMOJI_SKIP - 2 * LARGE_EMOJI_OUTLINE;

  return {
    cellSize,
    contentWidth: safeCount * cellSize + (safeCount - 1) * gap,
    contentHeight: cellSize,
    gap,
  };
}

export function fitEmojiToLargeCell(
  intrinsic: IntrinsicEmojiSize,
  cellSize = LARGE_EMOJI_SIZE,
): IntrinsicEmojiSize {
  if (
    !Number.isFinite(intrinsic.width) ||
    !Number.isFinite(intrinsic.height) ||
    intrinsic.width <= 0 ||
    intrinsic.height <= 0
  ) {
    return { width: cellSize, height: cellSize };
  }

  const scale = Math.min(cellSize / intrinsic.width, cellSize / intrinsic.height);
  return {
    width: Math.round(intrinsic.width * scale),
    height: Math.round(intrinsic.height * scale),
  };
}
