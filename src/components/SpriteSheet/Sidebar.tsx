import React from "react";
import type { Grid } from "./types";
import { AnimationPreview } from "./AnimationPreview";
import { calculateAutoDivide, detectSpriteCells } from "./utils";

type SidebarProps = {
  image: HTMLImageElement | null;
  grid: Grid;
  setGrid: React.Dispatch<React.SetStateAction<Grid>>;
  fps: number;
  setFps: (n: number) => void;
  currentFrame: number | null;
};

export function Sidebar({
  image,
  grid,
  setGrid,
  fps,
  setFps,
  currentFrame,
}: SidebarProps) {
  const [dimensionsLinked, setDimensionsLinked] = React.useState(true);
  const [autoDivideCells, setAutoDivideCells] = React.useState<number>(
    grid.cols * grid.rows,
  );
  const [isPredicting, setIsPredicting] = React.useState(false);

  const handleAutoDivide = (totalCells: number) => {
    if (!image || totalCells <= 0) return;

    const result = calculateAutoDivide({
      totalCells,
      imageWidth: image.width,
      imageHeight: image.height,
    });

    setGrid({
      ...grid,
      cols: result.cols,
      rows: result.rows,
      cellW: result.cellW,
      cellH: result.cellH,
    });
  };

  const handleAutoDetect = () => {
    if (!image) return;

    setIsPredicting(true);

    // Run detection in a timeout to allow UI to update
    setTimeout(() => {
      try {
        const detectedCells = detectSpriteCells(image);
        setAutoDivideCells(detectedCells);
        handleAutoDivide(detectedCells);
      } catch (error) {
        console.error("Error detecting sprite cells:", error);
      } finally {
        setIsPredicting(false);
      }
    }, 50);
  };

  return (
    <div className="w-full md:w-80 border-l border-zinc-200 dark:border-zinc-800 h-full flex flex-col bg-white dark:bg-zinc-950 overflow-auto">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Animation Preview
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
          Live preview of current grid
        </p>
      </div>

      <div className="p-4 flex flex-col gap-4 overflow-auto">
        <AnimationPreview
          image={image}
          grid={grid}
          fps={fps}
          currentFrame={currentFrame ?? 0}
        />
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
            Animation Speed
          </label>
          <input
            aria-label="Animation speed in FPS"
            type="range"
            min={1}
            max={30}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="text-xs text-zinc-700 dark:text-zinc-300">
            {fps} FPS
          </div>
          <div className="text-xs text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Current Frame:</span>{" "}
            {currentFrame ?? 0} / {grid.cols * grid.rows - 1}
          </div>
        </div>
        <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            Grid Configuration
          </h3>

          <div className="space-y-1.5 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <label className="text-xs font-medium text-blue-900 dark:text-blue-100">
              Auto Divide
            </label>
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
              Enter total cells to auto-calculate grid
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={autoDivideCells}
                onChange={(e) => {
                  const value = Math.max(1, Number(e.target.value));
                  setAutoDivideCells(value);
                  handleAutoDivide(value);
                }}
                disabled={!image}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Total cells"
              />
            </div>
            <button
              onClick={handleAutoDetect}
              disabled={!image || isPredicting}
              className="w-full px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPredicting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Detecting...
                </span>
              ) : (
                "Auto Detect"
              )}
            </button>
            {image && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Image: {image.width}×{image.height}px
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                Columns (X)
              </label>
              <input
                type="number"
                min={1}
                value={grid.cols}
                onChange={(e) =>
                  setGrid({
                    ...grid,
                    cols: Math.max(1, Number(e.target.value)),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                Rows (Y)
              </label>
              <input
                type="number"
                min={1}
                value={grid.rows}
                onChange={(e) =>
                  setGrid({
                    ...grid,
                    rows: Math.max(1, Number(e.target.value)),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                Cell Dimensions (px)
              </label>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                <input
                  type="number"
                  min={1}
                  value={grid.cellW}
                  onChange={(e) => {
                    const newValue = Math.max(1, Number(e.target.value));
                    if (dimensionsLinked) {
                      setGrid({ ...grid, cellW: newValue, cellH: newValue });
                    } else {
                      setGrid({ ...grid, cellW: newValue });
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  placeholder="Width"
                />
                <button
                  type="button"
                  onClick={() => setDimensionsLinked(!dimensionsLinked)}
                  className={`px-2.5 py-1.5 rounded-lg text-base transition-all ${
                    dimensionsLinked
                      ? "bg-blue-500 text-white shadow-sm"
                      : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
                  }`}
                  title={
                    dimensionsLinked
                      ? "Dimensions linked"
                      : "Dimensions unlinked"
                  }
                >
                  🔗
                </button>
                <input
                  type="number"
                  min={1}
                  value={grid.cellH}
                  onChange={(e) => {
                    const newValue = Math.max(1, Number(e.target.value));
                    if (dimensionsLinked) {
                      setGrid({ ...grid, cellW: newValue, cellH: newValue });
                    } else {
                      setGrid({ ...grid, cellH: newValue });
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  placeholder="Height"
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
              Grid Origin (px)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-400 w-4 font-medium">
                  X
                </span>
                <input
                  type="number"
                  value={Math.round(grid.originX)}
                  onChange={(e) =>
                    setGrid({ ...grid, originX: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600 dark:text-zinc-400 w-4 font-medium">
                  Y
                </span>
                <input
                  type="number"
                  value={Math.round(grid.originY)}
                  onChange={(e) =>
                    setGrid({ ...grid, originY: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
