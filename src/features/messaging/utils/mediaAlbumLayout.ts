type MediaShape = "narrow" | "wide" | "balanced";

export interface MediaAlbumInput {
  id: string;
  width?: number;
  height?: number;
  kind?: "image" | "video" | "file";
}

export interface MediaAlbumLayoutOptions {
  maxWidth: number;
  maxHeight?: number;
  spacing?: number;
  minTileSize?: number;
  fallbackRatio?: number;
  narrowRatio?: number;
  wideRatio?: number;
}

export interface MediaAlbumTile {
  id: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  outerCorners: {
    topLeft: boolean;
    topRight: boolean;
    bottomRight: boolean;
    bottomLeft: boolean;
  };
}

export interface MediaAlbumLayout {
  width: number;
  height: number;
  tiles: MediaAlbumTile[];
}

interface NormalizedMediaAlbumInput extends MediaAlbumInput {
  index: number;
  ratio: number;
  shape: MediaShape;
}

interface RawTile {
  id: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RawLayout {
  width: number;
  height: number;
  tiles: RawTile[];
}

interface LayoutCandidate {
  layout: RawLayout;
  rowHeights: number[];
  rowSizes: number[];
}

const DEFAULT_SPACING = 2;
const DEFAULT_MIN_TILE_SIZE = 88;
const DEFAULT_FALLBACK_RATIO = 1;
const DEFAULT_NARROW_RATIO = 0.8;
const DEFAULT_WIDE_RATIO = 1.25;
const DEFAULT_MIN_RATIO = 0.56;
const DEFAULT_MAX_RATIO = 2.4;
const warnedMissingDimensions = new Set<string>();

function roundLayoutValue(value: number) {
  return Math.round(value * 10000) / 10000;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getMaxHeight(options: MediaAlbumLayoutOptions) {
  return options.maxHeight ?? options.maxWidth;
}

function getSpacing(options: MediaAlbumLayoutOptions) {
  return options.spacing ?? DEFAULT_SPACING;
}

function getMinTileSize(options: MediaAlbumLayoutOptions) {
  return options.minTileSize ?? DEFAULT_MIN_TILE_SIZE;
}

function getFallbackRatio(options: MediaAlbumLayoutOptions) {
  return options.fallbackRatio ?? DEFAULT_FALLBACK_RATIO;
}

function getNarrowRatio(options: MediaAlbumLayoutOptions) {
  return options.narrowRatio ?? DEFAULT_NARROW_RATIO;
}

function getWideRatio(options: MediaAlbumLayoutOptions) {
  return options.wideRatio ?? DEFAULT_WIDE_RATIO;
}

function warnMissingDimensions(item: MediaAlbumInput) {
  if (!import.meta.env.DEV) return;
  if (warnedMissingDimensions.has(item.id)) return;
  warnedMissingDimensions.add(item.id);
  console.warn("[VETRA mediaAlbumLayout] Missing intrinsic media dimensions, using fallback ratio.", {
    id: item.id,
    kind: item.kind ?? null,
  });
}

function classifyRatio(ratio: number, options: MediaAlbumLayoutOptions): MediaShape {
  if (ratio <= getNarrowRatio(options)) return "narrow";
  if (ratio >= getWideRatio(options)) return "wide";
  return "balanced";
}

function resolveRatio(item: MediaAlbumInput, options: MediaAlbumLayoutOptions) {
  const fallbackRatio = getFallbackRatio(options);
  const width = isPositiveFinite(item.width) ? item.width : null;
  const height = isPositiveFinite(item.height) ? item.height : null;

  if (!width || !height) {
    warnMissingDimensions(item);
  }

  const rawRatio = width && height ? width / height : fallbackRatio;
  if (!Number.isFinite(rawRatio) || rawRatio <= 0) {
    return fallbackRatio;
  }

  return Math.min(DEFAULT_MAX_RATIO, Math.max(DEFAULT_MIN_RATIO, rawRatio));
}

function normalizeInputs(
  items: MediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
): NormalizedMediaAlbumInput[] {
  return items.map((item, index) => {
    const ratio = resolveRatio(item, options);
    return {
      ...item,
      index,
      ratio,
      shape: classifyRatio(ratio, options),
    };
  });
}

function scaleRawLayout(
  layout: RawLayout,
  maxWidth: number,
  maxHeight: number,
): RawLayout {
  if (layout.width <= 0 || layout.height <= 0) {
    return { width: 0, height: 0, tiles: [] };
  }

  const scale = Math.min(
    1,
    maxWidth / layout.width,
    maxHeight / layout.height,
  );

  if (scale === 1) return layout;

  return {
    width: layout.width * scale,
    height: layout.height * scale,
    tiles: layout.tiles.map((tile) => ({
      ...tile,
      x: tile.x * scale,
      y: tile.y * scale,
      width: tile.width * scale,
      height: tile.height * scale,
    })),
  };
}

function finalizeLayout(layout: RawLayout): MediaAlbumLayout {
  if (layout.tiles.length === 0 || layout.width <= 0 || layout.height <= 0) {
    return { width: 0, height: 0, tiles: [] };
  }

  const epsilon = 0.5;

  return {
    width: roundLayoutValue(layout.width),
    height: roundLayoutValue(layout.height),
    tiles: layout.tiles.map((tile) => {
      const right = tile.x + tile.width;
      const bottom = tile.y + tile.height;

      return {
        id: tile.id,
        index: tile.index,
        x: roundLayoutValue(tile.x),
        y: roundLayoutValue(tile.y),
        width: roundLayoutValue(tile.width),
        height: roundLayoutValue(tile.height),
        outerCorners: {
          topLeft: tile.x <= epsilon && tile.y <= epsilon,
          topRight: Math.abs(right - layout.width) <= epsilon && tile.y <= epsilon,
          bottomRight: Math.abs(right - layout.width) <= epsilon && Math.abs(bottom - layout.height) <= epsilon,
          bottomLeft: tile.x <= epsilon && Math.abs(bottom - layout.height) <= epsilon,
        },
      };
    }),
  };
}

function buildSingleLayout(
  items: NormalizedMediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
): RawLayout {
  const maxWidth = options.maxWidth;
  const maxHeight = getMaxHeight(options);
  const ratio = items[0]?.ratio ?? getFallbackRatio(options);

  let width = Math.min(maxWidth, maxHeight * ratio);
  let height = width / ratio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }

  return {
    width,
    height,
    tiles: [{
      id: items[0].id,
      index: items[0].index,
      x: 0,
      y: 0,
      width,
      height,
    }],
  };
}

function buildRowsLayout(
  items: NormalizedMediaAlbumInput[],
  rowSizes: number[],
  options: MediaAlbumLayoutOptions,
): LayoutCandidate {
  const maxWidth = options.maxWidth;
  const maxHeight = getMaxHeight(options);
  const spacing = getSpacing(options);
  let y = 0;
  let itemIndex = 0;
  const tiles: RawTile[] = [];
  const rowHeights: number[] = [];

  for (const rowSize of rowSizes) {
    const rowItems = items.slice(itemIndex, itemIndex + rowSize);
    const ratioSum = rowItems.reduce((sum, item) => sum + item.ratio, 0);
    const rowHeight = (maxWidth - spacing * (rowItems.length - 1)) / ratioSum;
    rowHeights.push(rowHeight);

    let x = 0;
    rowItems.forEach((item, indexInRow) => {
      const isLastInRow = indexInRow === rowItems.length - 1;
      const width = isLastInRow
        ? maxWidth - x
        : rowHeight * item.ratio;

      tiles.push({
        id: item.id,
        index: item.index,
        x,
        y,
        width,
        height: rowHeight,
      });

      x += width + spacing;
    });

    y += rowHeight;
    if (itemIndex + rowSize < items.length) {
      y += spacing;
    }
    itemIndex += rowSize;
  }

  return {
    layout: scaleRawLayout(
      { width: maxWidth, height: y, tiles },
      maxWidth,
      maxHeight,
    ),
    rowHeights,
    rowSizes,
  };
}

function buildTwoColumnLayout(
  items: NormalizedMediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
): LayoutCandidate {
  return buildRowsLayout(items, [2], options);
}

function buildTwoStackLayout(
  items: NormalizedMediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
): LayoutCandidate {
  const maxWidth = options.maxWidth;
  const maxHeight = getMaxHeight(options);
  const spacing = getSpacing(options);
  const [first, second] = items;
  const denominator = (1 / first.ratio) + (1 / second.ratio);
  const targetHeight = maxHeight;
  const width = Math.min(maxWidth, (targetHeight - spacing) / denominator);
  const firstHeight = width / first.ratio;
  const secondHeight = width / second.ratio;

  return {
    layout: scaleRawLayout({
      width,
      height: firstHeight + spacing + secondHeight,
      tiles: [
        { id: first.id, index: first.index, x: 0, y: 0, width, height: firstHeight },
        { id: second.id, index: second.index, x: 0, y: firstHeight + spacing, width, height: secondHeight },
      ],
    }, maxWidth, maxHeight),
    rowHeights: [firstHeight, secondHeight],
    rowSizes: [1, 1],
  };
}

function buildThreeLeftDominantLayout(
  items: NormalizedMediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
): LayoutCandidate {
  const maxWidth = options.maxWidth;
  const maxHeight = getMaxHeight(options);
  const spacing = getSpacing(options);
  const [first, second, third] = items;
  const inverseStack = (1 / second.ratio) + (1 / third.ratio);
  const totalHeight = (((maxWidth - spacing) * inverseStack) + spacing) / (1 + first.ratio * inverseStack);
  const leadWidth = totalHeight * first.ratio;
  const stackWidth = maxWidth - spacing - leadWidth;
  const topHeight = stackWidth / second.ratio;
  const bottomHeight = stackWidth / third.ratio;

  return {
    layout: scaleRawLayout({
      width: maxWidth,
      height: totalHeight,
      tiles: [
        { id: first.id, index: first.index, x: 0, y: 0, width: leadWidth, height: totalHeight },
        { id: second.id, index: second.index, x: leadWidth + spacing, y: 0, width: stackWidth, height: topHeight },
        { id: third.id, index: third.index, x: leadWidth + spacing, y: topHeight + spacing, width: stackWidth, height: bottomHeight },
      ],
    }, maxWidth, maxHeight),
    rowHeights: [totalHeight],
    rowSizes: [1, 2],
  };
}

function buildThreeTopDominantLayout(
  items: NormalizedMediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
): LayoutCandidate {
  return buildRowsLayout(items, [1, 2], options);
}

function buildFourSideStackLayout(
  items: NormalizedMediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
): LayoutCandidate {
  const maxWidth = options.maxWidth;
  const maxHeight = getMaxHeight(options);
  const spacing = getSpacing(options);
  const [first, second, third, fourth] = items;
  const inverse = (1 / second.ratio) + (1 / (third.ratio + fourth.ratio));
  const spacingTail = spacing * (1 - (1 / (third.ratio + fourth.ratio)));
  const totalHeight = ((maxWidth - spacing) * inverse + spacingTail) / (1 + first.ratio * inverse);
  const leadWidth = totalHeight * first.ratio;
  const columnWidth = maxWidth - spacing - leadWidth;
  const topHeight = columnWidth / second.ratio;
  const bottomHeight = (columnWidth - spacing) / (third.ratio + fourth.ratio);
  const thirdWidth = bottomHeight * third.ratio;
  const fourthWidth = columnWidth - spacing - thirdWidth;

  return {
    layout: scaleRawLayout({
      width: maxWidth,
      height: totalHeight,
      tiles: [
        { id: first.id, index: first.index, x: 0, y: 0, width: leadWidth, height: totalHeight },
        { id: second.id, index: second.index, x: leadWidth + spacing, y: 0, width: columnWidth, height: topHeight },
        { id: third.id, index: third.index, x: leadWidth + spacing, y: topHeight + spacing, width: thirdWidth, height: bottomHeight },
        { id: fourth.id, index: fourth.index, x: leadWidth + spacing + thirdWidth + spacing, y: topHeight + spacing, width: fourthWidth, height: bottomHeight },
      ],
    }, maxWidth, maxHeight),
    rowHeights: [totalHeight],
    rowSizes: [1, 3],
  };
}

function enumerateRowGroupings(itemCount: number): number[][] {
  const results: number[][] = [];

  function visit(remaining: number, rows: number[]) {
    if (remaining === 0) {
      results.push(rows);
      return;
    }

    if (remaining >= 2 && remaining <= 4) {
      results.push([...rows, remaining]);
    }

    for (const rowSize of [2, 3]) {
      if (remaining - rowSize < 2) continue;
      visit(remaining - rowSize, [...rows, rowSize]);
    }
  }

  visit(itemCount, []);

  return results.filter((rows) => rows.reduce((sum, size) => sum + size, 0) === itemCount);
}

function scoreCandidate(
  candidate: LayoutCandidate,
  items: NormalizedMediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
): number {
  const maxWidth = options.maxWidth;
  const maxHeight = getMaxHeight(options);
  const minTileSize = getMinTileSize(options);
  const targetHeight = maxHeight;
  const targetRowHeight = Math.min(maxHeight, Math.max(minTileSize, maxWidth / 3));
  const rowHeights = candidate.rowHeights.length > 0 ? candidate.rowHeights : [candidate.layout.height];
  const tilePenalty = candidate.layout.tiles.reduce((sum, tile) => {
    const shortEdge = Math.min(tile.width, tile.height);
    if (shortEdge >= minTileSize) return sum;
    return sum + ((minTileSize - shortEdge) / minTileSize) * 6;
  }, 0);
  const rowPenalty = rowHeights.reduce((sum, height) => {
    return sum + Math.abs(height - targetRowHeight) / targetRowHeight;
  }, 0);
  const variance = rowHeights.length <= 1
    ? 0
    : Math.max(...rowHeights) - Math.min(...rowHeights);
  const widthPenalty = candidate.layout.width < maxWidth * 0.42
    ? 1.5
    : 0;
  const lastRowPenalty = candidate.rowSizes.at(-1) === 4 ? 0.2 : 0;
  const heightPenalty = Math.abs(candidate.layout.height - targetHeight) / targetHeight;
  const coveragePenalty = candidate.layout.width < maxWidth * 0.58 && items.length > 1 ? 0.6 : 0;

  return tilePenalty + rowPenalty + heightPenalty + (variance / Math.max(targetRowHeight, 1)) * 0.35 + widthPenalty + lastRowPenalty + coveragePenalty;
}

function pickBestCandidate(
  candidates: LayoutCandidate[],
  items: NormalizedMediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
  weights: Partial<Record<number, number>> = {},
) {
  let bestCandidate = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate, index) => {
    const bias = weights[index] ?? 0;
    const score = scoreCandidate(candidate, items, options) + bias;
    if (score < bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  });

  return bestCandidate.layout;
}

function buildHandTunedLayout(
  items: NormalizedMediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
): RawLayout {
  if (items.length === 1) {
    return buildSingleLayout(items, options);
  }

  if (items.length === 2) {
    const bothWide = items.every((item) => item.shape === "wide");
    return pickBestCandidate(
      [buildTwoColumnLayout(items, options), buildTwoStackLayout(items, options)],
      items,
      options,
      bothWide ? { 1: -0.45 } : { 1: 0.4 },
    );
  }

  if (items.length === 3) {
    const first = items[0];
    return pickBestCandidate(
      [
        buildThreeLeftDominantLayout(items, options),
        buildThreeTopDominantLayout(items, options),
      ],
      items,
      options,
      first.shape === "narrow"
        ? { 0: -0.4, 1: 0.2 }
        : first.shape === "wide"
          ? { 0: 0.2, 1: -0.45 }
          : {},
    );
  }

  if (items.length === 4) {
    const ratios = items.map((item) => item.ratio);
    const similarRatios = Math.max(...ratios) / Math.min(...ratios) < 1.35;
    return pickBestCandidate(
      [
        buildRowsLayout(items, [2, 2], options),
        buildFourSideStackLayout(items, options),
        buildRowsLayout(items, [1, 3], options),
      ],
      items,
      options,
      similarRatios
        ? { 0: -0.5, 1: 0.25, 2: 0.35 }
        : items[0].shape === "narrow"
          ? { 0: 0.1, 1: -0.45, 2: 0.2 }
          : items[0].shape === "wide"
            ? { 0: 0.1, 1: 0.15, 2: -0.35 }
            : {},
    );
  }

  const candidates = enumerateRowGroupings(items.length).map((grouping) =>
    buildRowsLayout(items, grouping, options),
  );

  return pickBestCandidate(candidates, items, options);
}

export function computeMediaAlbumLayout(
  items: MediaAlbumInput[],
  options: MediaAlbumLayoutOptions,
): MediaAlbumLayout {
  if (!items.length || options.maxWidth <= 0) {
    return { width: 0, height: 0, tiles: [] };
  }

  const normalizedItems = normalizeInputs(items, options);

  // This is a Vetra clean-room layout implementation derived from observed
  // grouped-media behavior. It is intentionally not a Telegram source port.
  const rawLayout = buildHandTunedLayout(normalizedItems, options);
  return finalizeLayout(rawLayout);
}
