import { useCallback, useEffect, useRef } from "react";
import type { Grid } from "./types";
import { indexToColRow } from "./utils";
import { useRafLoop } from "./useRafLoop";

type AnimationPreviewProps = {
  image: HTMLImageElement | null;
  grid: Grid;
  fps: number;
  currentFrame: number;
};

export function AnimationPreview({
  image,
  grid,
  currentFrame,
}: AnimationPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { originX, originY, cols, cellW, cellH } = grid;
    const { col, row } = indexToColRow(currentFrame, cols);

    // Calculate source coordinates in image pixel space
    // originX/originY are now relative to top-left of image (0,0 = top-left)
    const sx = originX + col * cellW;
    const sy = originY + row * cellH;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Checkerboard background for transparency
    const checkSize = 16;
    const numCols = Math.ceil(canvas.width / checkSize);
    const numRows = Math.ceil(canvas.height / checkSize);

    for (let y = 0; y < numRows; y++) {
      for (let x = 0; x < numCols; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#cccccc" : "#999999";
        ctx.fillRect(x * checkSize, y * checkSize, checkSize, checkSize);
      }
    }

    ctx.imageSmoothingEnabled = false;
    if (image && cellW > 0 && cellH > 0) {
      // Clamp to valid image bounds to avoid sampling outside
      const clampedSx = Math.max(0, Math.min(image.width - cellW, sx));
      const clampedSy = Math.max(0, Math.min(image.height - cellH, sy));
      const clampedW = Math.min(cellW, image.width - clampedSx);
      const clampedH = Math.min(cellH, image.height - clampedSy);

      if (clampedW > 0 && clampedH > 0) {
        ctx.drawImage(
          image,
          clampedSx,
          clampedSy,
          clampedW,
          clampedH,
          0,
          0,
          canvas.width * (clampedW / cellW),
          canvas.height * (clampedH / cellH),
        );
      }
    }

    ctx.strokeStyle = "#e5e7eb";
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }, [image, grid, currentFrame]);

  useRafLoop(animate, image !== null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = 200;
    const cssH = 200;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }, []);

  return (
    <div className="flex flex-col items-center">
      <canvas
        ref={canvasRef}
        className="rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700"
      />
    </div>
  );
}
