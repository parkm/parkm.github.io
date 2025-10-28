export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

export const indexToColRow = (
  idx: number,
  cols: number,
): { col: number; row: number } => ({
  col: cols === 0 ? 0 : idx % cols,
  row: cols === 0 ? 0 : Math.floor(idx / cols),
});
