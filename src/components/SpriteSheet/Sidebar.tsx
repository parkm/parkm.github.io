import React from "react";
import type { Grid } from "./types";
import { AnimationPreview } from "./AnimationPreview";

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

  return (
    <div className="w-full md:w-80 border-l border-zinc-200 dark:border-zinc-800 h-full flex flex-col bg-white dark:bg-zinc-950">
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
