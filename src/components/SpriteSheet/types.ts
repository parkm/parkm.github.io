export type Vec2 = { x: number; y: number };

export type Grid = {
  originX: number; // offset from image top-left in world space (px)
  originY: number; // offset from image top-left in world space (px)
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
};
