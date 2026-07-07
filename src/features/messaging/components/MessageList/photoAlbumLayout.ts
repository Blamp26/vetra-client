export type PhotoAlbumTile = {
  left: string;
  top: string;
  width: string;
  height: string;
};

export type PhotoAlbumLayout = {
  width: number;
  height: number;
  tiles: PhotoAlbumTile[];
};

type PixelRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function toPercent(value: number, total: number) {
  const percent = (value / total) * 100;
  return `${percent.toFixed(4)}%`;
}

function buildLayout(width: number, height: number, rects: PixelRect[]): PhotoAlbumLayout {
  return {
    width,
    height,
    tiles: rects.map((rect) => ({
      left: toPercent(rect.left, width),
      top: toPercent(rect.top, height),
      width: toPercent(rect.width, width),
      height: toPercent(rect.height, height),
    })),
  };
}

const LAYOUTS: Record<number, PhotoAlbumLayout> = {
  2: buildLayout(480, 239, [
    { left: 0, top: 0, width: 239, height: 239 },
    { left: 241, top: 0, width: 239, height: 239 },
  ]),
  3: buildLayout(480, 318, [
    { left: 0, top: 0, width: 318, height: 318 },
    { left: 320, top: 0, width: 160, height: 158 },
    { left: 320, top: 160, width: 160, height: 158 },
  ]),
  4: buildLayout(480, 384, [
    { left: 0, top: 0, width: 239, height: 191 },
    { left: 241, top: 0, width: 239, height: 191 },
    { left: 0, top: 193, width: 239, height: 191 },
    { left: 241, top: 193, width: 239, height: 191 },
  ]),
  5: buildLayout(480, 384, [
    { left: 0, top: 0, width: 239, height: 191 },
    { left: 241, top: 0, width: 239, height: 191 },
    { left: 0, top: 193, width: 159, height: 191 },
    { left: 161, top: 193, width: 159, height: 191 },
    { left: 322, top: 193, width: 158, height: 191 },
  ]),
  6: buildLayout(480, 384, [
    { left: 0, top: 0, width: 159, height: 191 },
    { left: 161, top: 0, width: 159, height: 191 },
    { left: 322, top: 0, width: 158, height: 191 },
    { left: 0, top: 193, width: 159, height: 191 },
    { left: 161, top: 193, width: 159, height: 191 },
    { left: 322, top: 193, width: 158, height: 191 },
  ]),
  7: buildLayout(480, 384, [
    { left: 0, top: 0, width: 239, height: 191 },
    { left: 241, top: 0, width: 239, height: 191 },
    { left: 0, top: 193, width: 159, height: 94 },
    { left: 161, top: 193, width: 159, height: 94 },
    { left: 322, top: 193, width: 158, height: 94 },
    { left: 0, top: 289, width: 239, height: 95 },
    { left: 241, top: 289, width: 239, height: 95 },
  ]),
  8: buildLayout(480, 384, [
    { left: 0, top: 0, width: 239, height: 191 },
    { left: 241, top: 0, width: 239, height: 191 },
    { left: 0, top: 193, width: 159, height: 94 },
    { left: 161, top: 193, width: 159, height: 94 },
    { left: 322, top: 193, width: 158, height: 94 },
    { left: 0, top: 289, width: 119, height: 95 },
    { left: 121, top: 289, width: 119, height: 95 },
    { left: 242, top: 289, width: 238, height: 95 },
  ]),
  9: buildLayout(480, 384, [
    { left: 0, top: 0, width: 190, height: 143 },
    { left: 192, top: 0, width: 143, height: 143 },
    { left: 337, top: 0, width: 143, height: 143 },
    { left: 0, top: 145, width: 143, height: 143 },
    { left: 145, top: 145, width: 190, height: 143 },
    { left: 337, top: 145, width: 143, height: 143 },
    { left: 0, top: 290, width: 94, height: 94 },
    { left: 96, top: 290, width: 258, height: 94 },
    { left: 356, top: 290, width: 124, height: 94 },
  ]),
};

export function getPhotoAlbumLayout(photoCount: number): PhotoAlbumLayout {
  if (photoCount <= 1) {
    return buildLayout(480, 384, [{ left: 0, top: 0, width: 480, height: 384 }]);
  }

  return LAYOUTS[Math.min(photoCount, 9)] ?? LAYOUTS[9];
}
