export interface TextConfig {
  lines: string[];
  align: "left" | "center";
  padding: number;
}

export class TextRenderer {
  private font: Record<string, number[][]>;

  constructor() {
    this.font = this.createPixelFont();
  }

  public renderText({
    lines,
    align,
    padding,
    availableCols,
    availableRows,
  }: {
    lines: string[];
    align: "left" | "center";
    padding: number;
    availableCols: number;
    availableRows: number;
  }): boolean[][] {
    const lineSpacing = 1;

    const availableWidth = availableCols - padding * 2;
    const availableHeight = availableRows - padding * 2;

    const wrappedLines = this.wrapLines(lines, availableWidth);
    const linePatterns = this.createLinePatterns(wrappedLines);

    const { maxWidth, totalHeight } = this.calculateDimensions(
      linePatterns,
      lineSpacing,
    );

    if (totalHeight > availableHeight) {
      const maxLines = linePatterns.length - 1;
      linePatterns.splice(maxLines);
    }

    return this.combinePatterns(
      linePatterns,
      maxWidth,
      totalHeight,
      align,
      lineSpacing,
    );
  }

  private wrapLines(lines: string[], availableWidth: number): string[] {
    const wrappedLines: string[] = [];

    for (const line of lines) {
      if (line === "") {
        wrappedLines.push("");
        continue;
      }

      let currentLine = "";

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const testLine = currentLine + char;
        const testWidth = this.calculateTextWidth(testLine);

        if (testWidth > availableWidth && currentLine.length > 0) {
          wrappedLines.push(currentLine);
          currentLine = char;
        } else {
          currentLine += char;
        }
      }

      if (currentLine.length > 0) {
        wrappedLines.push(currentLine);
      }
    }

    return wrappedLines;
  }

  private createLinePatterns(wrappedLines: string[]): boolean[][][] {
    const linePatterns: boolean[][][] = [];

    for (const line of wrappedLines) {
      if (line === "") {
        linePatterns.push([[]]);
      } else {
        const pattern = this.createTextPattern(line);
        linePatterns.push(pattern);
      }
    }

    return linePatterns;
  }

  private calculateDimensions(
    linePatterns: boolean[][][],
    lineSpacing: number,
  ): { maxWidth: number; totalHeight: number } {
    let maxWidth = 0;
    let totalHeight = 0;

    for (const pattern of linePatterns) {
      if (pattern.length === 0 || pattern[0].length === 0) {
        totalHeight += 6 + lineSpacing;
      } else {
        maxWidth = Math.max(maxWidth, pattern.length);
        const patternHeight = pattern[0]?.length || 0;
        totalHeight += patternHeight + lineSpacing;
      }
    }

    totalHeight = Math.max(0, totalHeight - lineSpacing);

    return { maxWidth, totalHeight };
  }

  private combinePatterns(
    linePatterns: boolean[][][],
    maxWidth: number,
    totalHeight: number,
    align: "left" | "center",
    lineSpacing: number,
  ): boolean[][] {
    const combined: boolean[][] = Array.from({ length: maxWidth }, () =>
      Array(totalHeight).fill(false),
    );

    let yOffset = 0;
    for (const pattern of linePatterns) {
      if (pattern.length === 0 || pattern[0].length === 0) {
        yOffset += 6 + lineSpacing;
        continue;
      }

      const patternHeight = pattern[0].length;

      let xOffset = 0;
      if (align === "center") {
        xOffset = Math.floor((maxWidth - pattern.length) / 2);
      }

      for (let x = 0; x < pattern.length; x++) {
        for (let y = 0; y < patternHeight; y++) {
          if (pattern[x][y]) {
            const targetX = xOffset + x;
            const targetY = yOffset + y;
            if (
              targetX >= 0 &&
              targetX < maxWidth &&
              targetY >= 0 &&
              targetY < totalHeight
            ) {
              combined[targetX][targetY] = true;
            }
          }
        }
      }

      yOffset += patternHeight + lineSpacing;
    }

    return combined;
  }

  private calculateTextWidth(text: string): number {
    let width = 0;
    const charSpacing = 2;

    for (const char of text) {
      if (char === " ") {
        width += 5;
      } else if (this.font[char] || this.font[char.toUpperCase()]) {
        const charKey = this.font[char] ? char : char.toUpperCase();
        width += this.font[charKey][0].length + charSpacing;
      }
    }
    return Math.max(0, width - charSpacing);
  }

  private createTextPattern(text: string): boolean[][] {
    const charSpacing = 2;

    let totalWidth = 0;
    for (const char of text) {
      if (char === " ") {
        totalWidth += 5;
      } else if (this.font[char] || this.font[char.toUpperCase()]) {
        const charKey = this.font[char] ? char : char.toUpperCase();
        totalWidth += this.font[charKey][0].length + charSpacing;
      }
    }
    totalWidth = Math.max(0, totalWidth - charSpacing);

    let maxHeight = 0;
    for (const char of text) {
      if (char !== " ") {
        const charKey = this.font[char] ? char : char.toUpperCase();
        if (this.font[charKey]) {
          maxHeight = Math.max(maxHeight, this.font[charKey].length);
        }
      }
    }

    if (totalWidth === 0 || maxHeight === 0) {
      return [[]];
    }

    const pattern: boolean[][] = Array.from({ length: totalWidth }, () =>
      Array(maxHeight).fill(false),
    );

    let xOffset = 0;
    for (const char of text) {
      if (char === " ") {
        xOffset += 5;
      } else {
        const charKey = this.font[char] ? char : char.toUpperCase();
        if (this.font[charKey]) {
          const charPattern = this.font[charKey];
          for (let y = 0; y < charPattern.length; y++) {
            for (let x = 0; x < charPattern[y].length; x++) {
              if (charPattern[y][x] === 1) {
                pattern[xOffset + x][y] = true;
              }
            }
          }
          xOffset += charPattern[0].length + charSpacing;
        }
      }
    }

    return pattern;
  }

  private createPixelFont(): Record<string, number[][]> {
    return {
      A: [
        [0, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 1, 1, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
      ],
      B: [
        [1, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 1, 1, 0],
      ],
      C: [
        [0, 1, 1, 1],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [0, 1, 1, 1],
      ],
      D: [
        [1, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 1, 1, 0],
      ],
      E: [
        [1, 1, 1, 1],
        [1, 0, 0, 0],
        [1, 1, 1, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 1, 1, 1],
      ],
      F: [
        [1, 1, 1, 1],
        [1, 0, 0, 0],
        [1, 1, 1, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
      ],
      G: [
        [0, 1, 1, 1],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 1, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 1],
      ],
      H: [
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 1, 1, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
      ],
      I: [
        [1, 1, 1],
        [0, 1, 0],
        [0, 1, 0],
        [0, 1, 0],
        [0, 1, 0],
        [1, 1, 1],
      ],
      J: [
        [0, 0, 1, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 0],
      ],
      K: [
        [1, 0, 0, 1],
        [1, 0, 1, 0],
        [1, 1, 0, 0],
        [1, 1, 0, 0],
        [1, 0, 1, 0],
        [1, 0, 0, 1],
      ],
      L: [
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 1, 1, 1],
      ],
      M: [
        [1, 0, 0, 0, 1],
        [1, 1, 0, 1, 1],
        [1, 0, 1, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
      ],
      N: [
        [1, 0, 0, 1],
        [1, 1, 0, 1],
        [1, 1, 0, 1],
        [1, 0, 1, 1],
        [1, 0, 1, 1],
        [1, 0, 0, 1],
      ],
      O: [
        [0, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 0],
      ],
      P: [
        [1, 1, 1, 1],
        [1, 0, 0, 1],
        [1, 1, 1, 1],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
      ],
      Q: [
        [0, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 1, 0],
        [0, 1, 0, 1],
      ],
      R: [
        [1, 1, 1, 1],
        [1, 0, 0, 1],
        [1, 1, 1, 1],
        [1, 0, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
      ],
      S: [
        [0, 1, 1, 1],
        [1, 0, 0, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [1, 1, 1, 0],
      ],
      T: [
        [1, 1, 1, 1, 1],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
      ],
      U: [
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 0],
      ],
      V: [
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0],
        [0, 0, 1, 0, 0],
      ],
      W: [
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1],
        [1, 1, 0, 1, 1],
        [1, 0, 0, 0, 1],
      ],
      X: [
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
      ],
      Y: [
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [0, 1, 0, 1, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
      ],
      Z: [
        [1, 1, 1, 1],
        [0, 0, 0, 1],
        [0, 0, 1, 0],
        [0, 1, 0, 0],
        [1, 0, 0, 0],
        [1, 1, 1, 1],
      ],
      "!": [[1], [1], [1], [0], [0], [1], [1]],
    };
  }
}
