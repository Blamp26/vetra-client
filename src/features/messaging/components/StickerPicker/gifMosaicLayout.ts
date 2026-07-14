import type { VetraGif } from "@/api/giphy";

export const GIF_MOSAIC_COLUMNS = 3;
export const GIF_MOSAIC_GAP = 2;
export const GIF_MOSAIC_MIN_HEIGHT = 56;
export const GIF_MOSAIC_MAX_HEIGHT = 180;

export type GifMosaicTile = {
  providerId: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type GifMosaicLayout = {
  tiles: GifMosaicTile[];
  height: number;
  columnWidth: number;
};

export function computeGifMosaicLayout(
  items: VetraGif[],
  containerWidth: number,
): GifMosaicLayout {
  const usableWidth = Math.max(0, Math.round(containerWidth));
  const widthAfterGaps = Math.max(
    0,
    usableWidth - GIF_MOSAIC_GAP * (GIF_MOSAIC_COLUMNS - 1),
  );
  const baseColumnWidth = Math.floor(widthAfterGaps / GIF_MOSAIC_COLUMNS);
  const remainder = widthAfterGaps % GIF_MOSAIC_COLUMNS;
  const columnWidths = Array.from(
    { length: GIF_MOSAIC_COLUMNS },
    (_, index) => baseColumnWidth + (index < remainder ? 1 : 0),
  );
  const columnLefts = columnWidths.reduce<number[]>((lefts, _width, index) => {
    lefts.push((lefts[index - 1] ?? 0) + (index ? columnWidths[index - 1] + GIF_MOSAIC_GAP : 0));
    return lefts;
  }, []);
  const columns = Array<number>(GIF_MOSAIC_COLUMNS).fill(0);
  const tiles: GifMosaicTile[] = [];

  for (const item of items) {
    const column = columns.indexOf(Math.min(...columns));
    const tileWidth = columnWidths[column];
    const ratio = item.width / Math.max(1, item.height);
    const height = Math.max(
      GIF_MOSAIC_MIN_HEIGHT,
      Math.min(
        GIF_MOSAIC_MAX_HEIGHT,
        Math.round(tileWidth / Math.max(0.1, ratio)),
      ),
    );
    const top = columns[column];
    tiles.push({
      providerId: item.providerId,
      left: columnLefts[column],
      top,
      width: tileWidth,
      height,
    });
    columns[column] = top + height + GIF_MOSAIC_GAP;
  }

  return {
    tiles,
    height: items.length ? Math.max(...columns) - GIF_MOSAIC_GAP : 0,
    columnWidth: columnWidths[0] ?? 0,
  };
}
