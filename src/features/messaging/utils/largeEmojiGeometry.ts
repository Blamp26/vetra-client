export const LARGE_EMOJI_SIZE = 36;
export const LARGE_EMOJI_OUTLINE = 1;
export const LARGE_EMOJI_SKIP = 4;

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
