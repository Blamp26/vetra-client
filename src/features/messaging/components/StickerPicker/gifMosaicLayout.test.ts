import { describe, expect, it } from "vitest";
import type { VetraGif } from "@/api/giphy";
import {
  computeGifMosaicLayout,
  GIF_MOSAIC_GAP,
  GIF_MOSAIC_MAX_HEIGHT,
  GIF_MOSAIC_MIN_HEIGHT,
} from "./gifMosaicLayout";

const gif = (providerId: string, width: number, height: number): VetraGif => ({
  provider: "giphy",
  providerId,
  title: providerId,
  width,
  height,
  previewMp4Url: null,
  previewWebpUrl: null,
  previewStillUrl: null,
  messageMp4Url: null,
  messageWebpUrl: null,
  analytics: {},
});

describe("computeGifMosaicLayout", () => {
  it("uses three measured columns and compact two-pixel gaps", () => {
    const layout = computeGifMosaicLayout(
      [gif("portrait", 1, 2), gif("square", 1, 1), gif("wide", 2, 1)],
      292,
    );

    expect(layout.columnWidth).toBe(96);
    expect(layout.tiles).toHaveLength(3);
    expect(layout.tiles.map((tile) => tile.left)).toEqual([0, 98, 196]);
    expect(layout.tiles.map((tile) => tile.height)).toEqual([180, 96, 56]);
    expect(layout.tiles.every((tile) => tile.height >= GIF_MOSAIC_MIN_HEIGHT)).toBe(true);
    expect(layout.tiles.every((tile) => tile.height <= GIF_MOSAIC_MAX_HEIGHT)).toBe(true);
    expect(layout.tiles[0].top).toBe(0);
    expect(layout.tiles[1].top).toBe(0);
    expect(layout.tiles[2].top).toBe(0);
    expect(layout.height).toBe(180);
    expect(GIF_MOSAIC_GAP).toBe(2);
  });

  it("assigns items deterministically to the shortest column", () => {
    const items = [gif("a", 1, 1), gif("b", 1, 2), gif("c", 1, 1), gif("d", 1, 1)];
    const first = computeGifMosaicLayout(items, 300);
    const second = computeGifMosaicLayout(items, 300);

    expect(first).toEqual(second);
    expect(first.tiles[3].left).toBe(first.tiles[0].left);
    expect(first.tiles[3].top).toBeGreaterThan(first.tiles[0].top);
    expect(first.height).toBe(Math.max(...first.tiles.map((tile) => tile.top + tile.height)));
    expect(first.tiles.every((tile) => tile.left + tile.width <= 300)).toBe(true);
  });
});
