import { describe, expect, it } from "vitest";

import {
  computeMediaAlbumLayout,
  getMediaAlbumPackingRatio,
  type MediaAlbumInput,
  type MediaAlbumLayout,
} from "./mediaAlbumLayout";

const DEFAULT_OPTIONS = {
  maxWidth: 480,
  spacing: 2,
  minTileSize: 88,
  fallbackRatio: 1,
  narrowRatio: 0.8,
  wideRatio: 1.25,
} as const;

function makeItem(
  id: string,
  width?: number,
  height?: number,
): MediaAlbumInput {
  return { id, width, height, kind: "image" };
}

function expectFinitePositiveLayout(layout: MediaAlbumLayout) {
  expect(Number.isFinite(layout.width)).toBe(true);
  expect(Number.isFinite(layout.height)).toBe(true);
  expect(layout.width).toBeGreaterThan(0);
  expect(layout.height).toBeGreaterThan(0);

  layout.tiles.forEach((tile) => {
    expect(Number.isFinite(tile.x)).toBe(true);
    expect(Number.isFinite(tile.y)).toBe(true);
    expect(Number.isFinite(tile.width)).toBe(true);
    expect(Number.isFinite(tile.height)).toBe(true);
    expect(tile.width).toBeGreaterThan(0);
    expect(tile.height).toBeGreaterThan(0);
  });
}

function expectTilesInsideBounds(layout: MediaAlbumLayout) {
  layout.tiles.forEach((tile) => {
    expect(tile.x).toBeGreaterThanOrEqual(0);
    expect(tile.y).toBeGreaterThanOrEqual(0);
    expect(tile.x + tile.width).toBeLessThanOrEqual(layout.width + 0.5);
    expect(tile.y + tile.height).toBeLessThanOrEqual(layout.height + 0.5);
  });
}

function expectNoOverlap(layout: MediaAlbumLayout) {
  layout.tiles.forEach((tile, index) => {
    layout.tiles.slice(index + 1).forEach((otherTile) => {
      const horizontalOverlap =
        Math.min(tile.x + tile.width, otherTile.x + otherTile.width) -
        Math.max(tile.x, otherTile.x);
      const verticalOverlap =
        Math.min(tile.y + tile.height, otherTile.y + otherTile.height) -
        Math.max(tile.y, otherTile.y);

      expect(horizontalOverlap > 0 && verticalOverlap > 0).toBe(false);
    });
  });
}

function expectNoAbsurdRatioMismatch(
  layout: MediaAlbumLayout,
  items: MediaAlbumInput[],
  maxRatioFactor = 2,
) {
  layout.tiles.forEach((tile) => {
    const input = items[tile.index];
    if (!input?.width || !input?.height) return;

    const tileRatio = tile.width / tile.height;
    const mediaRatio = getMediaAlbumPackingRatio(input, DEFAULT_OPTIONS);
    const ratioFactor = Math.max(tileRatio, mediaRatio) / Math.min(tileRatio, mediaRatio);

    expect(ratioFactor).toBeLessThan(maxRatioFactor);
  });
}

describe("mediaAlbumLayout", () => {
  it("returns an empty layout safely for empty input", () => {
    expect(computeMediaAlbumLayout([], DEFAULT_OPTIONS)).toEqual({
      width: 0,
      height: 0,
      tiles: [],
    });
  });

  it("gives one portrait item a narrower and taller layout", () => {
    const layout = computeMediaAlbumLayout([makeItem("portrait", 900, 1600)], DEFAULT_OPTIONS);

    expectFinitePositiveLayout(layout);
    expect(layout.width).toBeLessThan(layout.height);
    expect(layout.width).toBeLessThan(DEFAULT_OPTIONS.maxWidth);
    expect(layout.height).toBe(DEFAULT_OPTIONS.maxWidth);
  });

  it("gives one landscape item a wider and shorter layout", () => {
    const layout = computeMediaAlbumLayout([makeItem("landscape", 1600, 900)], DEFAULT_OPTIONS);

    expectFinitePositiveLayout(layout);
    expect(layout.width).toBe(DEFAULT_OPTIONS.maxWidth);
    expect(layout.height).toBeLessThan(layout.width);
    expect(layout.height).toBeLessThan(DEFAULT_OPTIONS.maxWidth);
  });

  it("keeps a 16:9 screenshot readable instead of compressing it into a short strip", () => {
    const layout = computeMediaAlbumLayout([makeItem("screenshot-wide", 1920, 1080)], DEFAULT_OPTIONS);

    expect(layout.width).toBe(480);
    expect(layout.height).toBeCloseTo(270, 4);
  });

  it("keeps a 4:3 UI capture readable within the square album bound", () => {
    const layout = computeMediaAlbumLayout([makeItem("screenshot-ui", 1600, 1200)], DEFAULT_OPTIONS);

    expect(layout.width).toBe(480);
    expect(layout.height).toBeCloseTo(360, 4);
  });

  it("keeps a tall phone screenshot portrait within the square album bound", () => {
    const layout = computeMediaAlbumLayout([makeItem("screenshot-tall", 1080, 2340)], DEFAULT_OPTIONS);

    expect(layout.width).toBeLessThan(layout.height);
    expect(layout.height).toBe(480);
    expect(layout.width).toBeGreaterThan(200);
  });

  it("uses a safe square-ish fallback when dimensions are missing", () => {
    const layout = computeMediaAlbumLayout([{ id: "unknown", kind: "image" }], DEFAULT_OPTIONS);

    expectFinitePositiveLayout(layout);
    expect(layout.width).toBe(layout.height);
    expect(layout.width).toBeLessThanOrEqual(DEFAULT_OPTIONS.maxWidth);
  });

  it("defaults maxHeight to maxWidth when it is omitted", () => {
    const layout = computeMediaAlbumLayout([makeItem("portrait", 900, 1600)], {
      ...DEFAULT_OPTIONS,
      maxWidth: 480,
    });

    expect(layout.width).toBeCloseTo(270, 4);
    expect(layout.height).toBe(480);
  });

  it("respects an explicit maxHeight override when one is provided", () => {
    const layout = computeMediaAlbumLayout([makeItem("portrait", 900, 1600)], {
      ...DEFAULT_OPTIONS,
      maxWidth: 480,
      maxHeight: 384,
    });

    expect(layout.width).toBeCloseTo(216, 4);
    expect(layout.height).toBe(384);
  });

  it("does not force two mixed-ratio items to a 50/50 split when ratios differ", () => {
    const layout = computeMediaAlbumLayout([
      makeItem("wide", 1600, 900),
      makeItem("narrow", 800, 1200),
    ], DEFAULT_OPTIONS);

    expectFinitePositiveLayout(layout);
    expectTilesInsideBounds(layout);
    expectNoOverlap(layout);
    expect(Math.abs(layout.tiles[0].width - layout.tiles[1].width)).toBeGreaterThan(40);
  });

  it("lays out three mixed items with a dominant tile and no overflow", () => {
    const layout = computeMediaAlbumLayout([
      makeItem("lead", 800, 1400),
      makeItem("side-1", 1200, 900),
      makeItem("side-2", 1000, 900),
    ], DEFAULT_OPTIONS);

    expectFinitePositiveLayout(layout);
    expectTilesInsideBounds(layout);
    expectNoOverlap(layout);
    expect(
      layout.tiles[0].height > layout.tiles[1].height ||
      layout.tiles[0].width > layout.tiles[1].width,
    ).toBe(true);
  });

  it("can produce a balanced four-tile grid when ratios are similar", () => {
    const layout = computeMediaAlbumLayout([
      makeItem("one", 1200, 900),
      makeItem("two", 1100, 900),
      makeItem("three", 1150, 900),
      makeItem("four", 1180, 900),
    ], DEFAULT_OPTIONS);

    expectFinitePositiveLayout(layout);
    expectTilesInsideBounds(layout);
    expectNoOverlap(layout);
    const firstRowTiles = layout.tiles.filter((tile) => tile.y < layout.height / 2);
    const secondRowTiles = layout.tiles.filter((tile) => tile.y >= layout.height / 2);

    expect(firstRowTiles).toHaveLength(2);
    expect(secondRowTiles).toHaveLength(2);
    expect(Math.abs(layout.tiles[0].height - layout.tiles[1].height)).toBeLessThan(8);
  });

  it("can produce a dominant-plus-stack four-tile layout for mixed ratios", () => {
    const layout = computeMediaAlbumLayout([
      makeItem("lead", 900, 1500),
      makeItem("top", 1500, 900),
      makeItem("bottom-left", 900, 900),
      makeItem("bottom-right", 1100, 900),
    ], DEFAULT_OPTIONS);

    expectFinitePositiveLayout(layout);
    expectTilesInsideBounds(layout);
    expectNoOverlap(layout);
    expect(layout.tiles[0].height).toBeGreaterThan(layout.tiles[1].height);
    expect(layout.tiles[0].outerCorners.topLeft).toBe(true);
    expect(layout.tiles[0].outerCorners.bottomLeft).toBe(true);
    expect(Math.min(...layout.tiles.map((tile) => tile.height))).toBeGreaterThan(95);
  });

  it("keeps mixed screenshots and photos within reasonable tile ratio distortion", () => {
    const items = [
      makeItem("screenshot-wide", 1920, 1080),
      makeItem("screenshot-ui", 1600, 1200),
      makeItem("phone", 1080, 2340),
      makeItem("photo", 1350, 1350),
    ];
    const layout = computeMediaAlbumLayout(items, DEFAULT_OPTIONS);

    expectFinitePositiveLayout(layout);
    expectTilesInsideBounds(layout);
    expectNoOverlap(layout);
    expect(Math.min(...layout.tiles.map((tile) => tile.height))).toBeGreaterThan(105);
    expectNoAbsurdRatioMismatch(layout, items, 1.95);
  });

  it.each([5, 6, 7, 8, 9])("keeps %s mixed items inside bounds without overlap", (count) => {
    const items = Array.from({ length: count }, (_, index) => {
      const dimensions = [
        [1600, 900],
        [900, 1400],
        [1200, 1200],
      ][index % 3] as [number, number];

      return makeItem(`item-${index + 1}`, dimensions[0], dimensions[1]);
    });
    const layout = computeMediaAlbumLayout(items, DEFAULT_OPTIONS);

    expectFinitePositiveLayout(layout);
    expectTilesInsideBounds(layout);
    expectNoOverlap(layout);
    expect(Math.min(...layout.tiles.map((tile) => tile.height))).toBeGreaterThan(70);
    expectNoAbsurdRatioMismatch(layout, items, 2.2);
  });

  it("matches the observed Telegram nine-item fixture with three balanced rows", () => {
    const fixtureItems: MediaAlbumInput[] = [
      { id: "0", width: 588, height: 1280, kind: "video" },
      { id: "1", width: 800, height: 493, kind: "image" },
      { id: "2", width: 1280, height: 752, kind: "video" },
      { id: "3", width: 128, height: 128, kind: "image" },
      { id: "4", width: 800, height: 518, kind: "image" },
      { id: "5", width: 800, height: 440, kind: "image" },
      { id: "6", width: 480, height: 854, kind: "video" },
      { id: "7", width: 600, height: 800, kind: "image" },
      { id: "8", width: 800, height: 450, kind: "image" },
    ];

    const layout = computeMediaAlbumLayout(fixtureItems, DEFAULT_OPTIONS);
    const roundedRows = [...new Set(layout.tiles.map((tile) => Math.round(tile.y)))];

    expectFinitePositiveLayout(layout);
    expect(layout.width).toBeCloseTo(480, 1);
    expect(layout.height).toBeGreaterThan(346);
    expect(layout.height).toBeLessThan(352);
    expect(layout.tiles).toHaveLength(9);
    expect(roundedRows).toHaveLength(3);
    expect(roundedRows[0]).toBeCloseTo(0, 1);
    expect(roundedRows[1]).toBeCloseTo(112, 3);
    expect(roundedRows[2]).toBeCloseTo(223, 3);

    const expectedTileSizes = [
      [110, 110],
      [179, 110],
      [187, 110],
      [109, 109],
      [168, 109],
      [199, 109],
      [126, 126],
      [126, 126],
      [224, 126],
    ] as const;

    expectedTileSizes.forEach(([expectedWidth, expectedHeight], index) => {
      expect(layout.tiles[index].width).toBeGreaterThan(expectedWidth - 3);
      expect(layout.tiles[index].width).toBeLessThan(expectedWidth + 3);
      expect(layout.tiles[index].height).toBeGreaterThan(expectedHeight - 3);
      expect(layout.tiles[index].height).toBeLessThan(expectedHeight + 3);
    });
  });

  it("keeps wide screenshot tiles close to their source ratios inside a nine-item album", () => {
    const items = [
      makeItem("phone", 588, 1280),
      makeItem("wide-a", 800, 493),
      makeItem("wide-b", 1280, 752),
      makeItem("square", 128, 128),
      makeItem("wide-c", 800, 518),
      makeItem("wide-d", 800, 440),
      makeItem("phone-2", 480, 854),
      makeItem("portrait", 600, 800),
      makeItem("wide-e", 800, 450),
    ];
    const layout = computeMediaAlbumLayout(items, DEFAULT_OPTIONS);

    [1, 2, 4, 5, 8].forEach((index) => {
      const sourceRatio = (items[index].width ?? 1) / (items[index].height ?? 1);
      const tileRatio = layout.tiles[index].width / layout.tiles[index].height;
      expect(tileRatio).toBeCloseTo(sourceRatio, 1);
    });
  });

  it("chooses three rows instead of a crushed two-row pack for the Telegram-like nine-item set", () => {
    const items = [
      makeItem("0", 588, 1280),
      makeItem("1", 800, 493),
      makeItem("2", 1280, 752),
      makeItem("3", 128, 128),
      makeItem("4", 800, 518),
      makeItem("5", 800, 440),
      makeItem("6", 480, 854),
      makeItem("7", 600, 800),
      makeItem("8", 800, 450),
    ];
    const layout = computeMediaAlbumLayout(items, DEFAULT_OPTIONS);
    const rowStarts = [...new Set(layout.tiles.map((tile) => Math.round(tile.y)))];

    expect(rowStarts).toHaveLength(3);
    expect(Math.max(...layout.tiles.map((tile) => tile.height))).toBeLessThan(132);
  });

  it("clamps extreme panoramic ratios so tiles do not collapse into slivers", () => {
    const layout = computeMediaAlbumLayout([
      makeItem("pano", 6000, 600),
      makeItem("support-1", 1200, 1200),
      makeItem("support-2", 1200, 1200),
    ], DEFAULT_OPTIONS);

    expectFinitePositiveLayout(layout);
    expectTilesInsideBounds(layout);
    expectNoOverlap(layout);
    expect(Math.min(...layout.tiles.map((tile) => Math.min(tile.width, tile.height)))).toBeGreaterThan(80);
  });

  it("keeps gutters consistent for a balanced four-tile layout", () => {
    const layout = computeMediaAlbumLayout([
      makeItem("one", 1200, 900),
      makeItem("two", 1200, 900),
      makeItem("three", 1200, 900),
      makeItem("four", 1200, 900),
    ], DEFAULT_OPTIONS);

    const horizontalGap = layout.tiles[1].x - (layout.tiles[0].x + layout.tiles[0].width);
    const verticalGap = layout.tiles[2].y - (layout.tiles[0].y + layout.tiles[0].height);

    expect(horizontalGap).toBeCloseTo(DEFAULT_OPTIONS.spacing, 3);
    expect(verticalGap).toBeCloseTo(DEFAULT_OPTIONS.spacing, 3);
  });

  it("sets outer corner flags for the actual album boundary tiles", () => {
    const layout = computeMediaAlbumLayout([
      makeItem("left", 900, 1400),
      makeItem("right", 1400, 900),
    ], DEFAULT_OPTIONS);

    expect(layout.tiles[0].outerCorners.topLeft).toBe(true);
    expect(layout.tiles[0].outerCorners.bottomLeft).toBe(true);
    expect(layout.tiles[0].outerCorners.topRight).toBe(false);
    expect(layout.tiles[1].outerCorners.topRight).toBe(true);
    expect(layout.tiles[1].outerCorners.bottomRight).toBe(true);
    expect(layout.tiles[1].outerCorners.bottomLeft).toBe(false);
  });
});
