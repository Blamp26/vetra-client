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
  const usableWidth = Math.max(0, containerWidth);
  const columnWidth = Math.max(
    0,
    (usableWidth - GIF_MOSAIC_GAP * (GIF_MOSAIC_COLUMNS - 1)) /
      GIF_MOSAIC_COLUMNS,
  );
  const columns = Array<number>(GIF_MOSAIC_COLUMNS).fill(0);
  const tiles: GifMosaicTile[] = [];

  for (const item of items) {
    const ratio = item.width / Math.max(1, item.height);
    const height = Math.max(
      GIF_MOSAIC_MIN_HEIGHT,
      Math.min(
        GIF_MOSAIC_MAX_HEIGHT,
        Math.round(columnWidth / Math.max(0.1, ratio)),
      ),
    );
    const column = columns.indexOf(Math.min(...columns));
    const top = columns[column];
    tiles.push({
      providerId: item.providerId,
      left: column * (columnWidth + GIF_MOSAIC_GAP),
      top,
      width: columnWidth,
      height,
    });
    columns[column] = top + height + GIF_MOSAIC_GAP;
  }

  return {
    tiles,
    height: items.length ? Math.max(...columns) - GIF_MOSAIC_GAP : 0,
    columnWidth,
  };
}
