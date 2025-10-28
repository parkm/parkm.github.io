export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

export const indexToColRow = (
  idx: number,
  cols: number,
): { col: number; row: number } => ({
  col: cols === 0 ? 0 : idx % cols,
  row: cols === 0 ? 0 : Math.floor(idx / cols),
});

/**
 * Calculate optimal grid dimensions given total cells and image dimensions
 * Returns cols, rows, cellW, and cellH that perfectly divide the image
 */
export const calculateAutoDivide = ({
  totalCells,
  imageWidth,
  imageHeight,
}: {
  totalCells: number;
  imageWidth: number;
  imageHeight: number;
}): { cols: number; rows: number; cellW: number; cellH: number } => {
  if (totalCells <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { cols: 1, rows: 1, cellW: imageWidth, cellH: imageHeight };
  }

  // Find the best arrangement that divides the image evenly
  let bestCols = 1;
  let bestRows = totalCells;
  let bestScore = Infinity;

  // Try different column/row combinations
  for (let cols = 1; cols <= totalCells; cols++) {
    const rows = Math.ceil(totalCells / cols);

    // Calculate cell dimensions
    const cellW = imageWidth / cols;
    const cellH = imageHeight / rows;

    // Check if dimensions are integers (perfect division)
    const isIntegerW = Number.isInteger(cellW);
    const isIntegerH = Number.isInteger(cellH);

    // Calculate aspect ratio difference from square
    const aspectRatio = cellW / cellH;
    const aspectDiff = Math.abs(aspectRatio - 1);

    // Score: prefer integer dimensions, then prefer square-ish cells
    let score = aspectDiff;
    if (!isIntegerW) score += 100;
    if (!isIntegerH) score += 100;

    // Also prefer arrangements closer to the actual cell count
    const wastedCells = cols * rows - totalCells;
    score += wastedCells * 0.1;

    if (score < bestScore) {
      bestScore = score;
      bestCols = cols;
      bestRows = rows;
    }
  }

  const cellW = Math.floor(imageWidth / bestCols);
  const cellH = Math.floor(imageHeight / bestRows);

  return {
    cols: bestCols,
    rows: bestRows,
    cellW,
    cellH,
  };
};
