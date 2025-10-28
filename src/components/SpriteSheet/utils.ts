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

/**
 * Detect sprite cells in a sprite sheet by finding common divisors
 * that create a uniform grid. This works for standard sprite sheets
 * where all cells are the same size arranged in a regular grid.
 */
export const detectSpriteCells = (image: HTMLImageElement): number => {
  const width = image.width;
  const height = image.height;

  // Find all divisors of width and height
  const getDivisors = (n: number): number[] => {
    const divisors: number[] = [];
    for (let i = 1; i <= Math.sqrt(n); i++) {
      if (n % i === 0) {
        divisors.push(i);
        if (i !== n / i) {
          divisors.push(n / i);
        }
      }
    }
    return divisors.sort((a, b) => a - b);
  };

  const widthDivisors = getDivisors(width);
  const heightDivisors = getDivisors(height);

  // Find reasonable cell sizes (between 8 and half the image dimension)
  const minSize = 8;
  const validWidths = widthDivisors.filter(
    (w) => w >= minSize && w <= width / 2,
  );
  const validHeights = heightDivisors.filter(
    (h) => h >= minSize && h <= height / 2,
  );

  if (validWidths.length === 0 || validHeights.length === 0) {
    // Try common sprite sizes
    const commonSizes = [8, 16, 24, 32, 48, 64, 96, 128, 256];

    for (const size of commonSizes) {
      if (width % size === 0 && height % size === 0) {
        const cols = width / size;
        const rows = height / size;
        return cols * rows;
      }
    }

    // Fallback: assume square cells based on smallest dimension
    const cellSize = Math.min(width, height);
    const cols = Math.floor(width / cellSize);
    const rows = Math.floor(height / cellSize);
    return Math.max(1, cols * rows);
  }

  // Score each possible cell size combination
  // Prefer square or near-square cells, and reasonable cell counts
  let bestScore = -Infinity;
  let bestCellCount = 1;

  for (const cellW of validWidths) {
    for (const cellH of validHeights) {
      const cols = width / cellW;
      const rows = height / cellH;
      const totalCells = cols * rows;

      // Skip if too many or too few cells
      if (totalCells < 1 || totalCells > 1000) continue;

      // Calculate aspect ratio (prefer square-ish cells)
      const aspectRatio = cellW / cellH;
      const aspectScore = 1 / (1 + Math.abs(aspectRatio - 1));

      // Prefer reasonable cell counts (between 4 and 100 is common)
      let countScore = 1;
      if (totalCells >= 4 && totalCells <= 100) {
        countScore = 2;
      } else if (totalCells > 100) {
        countScore = 0.5;
      }

      // Prefer common sprite sizes (powers of 2 or multiples of 8)
      let sizeScore = 1;
      if (cellW % 8 === 0 && cellH % 8 === 0) {
        sizeScore = 1.5;
      }
      if ((cellW & (cellW - 1)) === 0 && (cellH & (cellH - 1)) === 0) {
        sizeScore = 2; // Both are powers of 2
      }

      // Prefer cells that aren't too small or too large
      const cellArea = cellW * cellH;
      let areaScore = 1;
      if (cellArea >= 256 && cellArea <= 16384) {
        // 16x16 to 128x128
        areaScore = 1.5;
      }

      const score = aspectScore * countScore * sizeScore * areaScore;

      if (score > bestScore) {
        bestScore = score;
        bestCellCount = totalCells;
      }
    }
  }

  return Math.max(1, bestCellCount);
};
