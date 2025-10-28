import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseAsInteger, useQueryState } from "nuqs";
import { NuqsAdapter } from "nuqs/adapters/react";
import type { Vec2, Grid } from "./types";
import { clamp } from "./utils";
import { useRafLoop } from "./useRafLoop";
import { Toolbar } from "./Toolbar";
import { PixiStage } from "./PixiStage";
import { Sidebar } from "./Sidebar";

function SpriteSheetViewerContent() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 });
  const [scale, setScale] = useState<number>(1);
  const [fps, setFps] = useState<number>(8);

  const [cols, setCols] = useQueryState("cols", parseAsInteger.withDefault(4));
  const [rows, setRows] = useQueryState("rows", parseAsInteger.withDefault(1));
  const [cellW, setCellW] = useQueryState(
    "cellW",
    parseAsInteger.withDefault(32),
  );
  const [cellH, setCellH] = useQueryState(
    "cellH",
    parseAsInteger.withDefault(32),
  );
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);

  const grid: Grid = useMemo(
    () => ({
      originX,
      originY,
      cols,
      rows,
      cellW,
      cellH,
    }),
    [originX, originY, cols, rows, cellW, cellH],
  );
  const setGrid = useCallback(
    (updater: React.SetStateAction<Grid>) => {
      const newGrid = typeof updater === "function" ? updater(grid) : updater;
      setCols(newGrid.cols);
      setRows(newGrid.rows);
      setCellW(newGrid.cellW);
      setCellH(newGrid.cellH);
      setOriginX(newGrid.originX);
      setOriginY(newGrid.originY);
    },
    [grid, setCols, setRows, setCellW, setCellH],
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);

  const totalFrames = grid.cols * grid.rows;
  const [animTime, setAnimTime] = useState<number>(0);

  const currentFrame = useMemo<number>(() => {
    const total = Math.max(1, totalFrames);
    return Math.floor(animTime * fps) % total;
  }, [animTime, fps, totalFrames]);

  const updateAnimTime = useCallback((ts: number) => {
    setAnimTime(ts / 1000);
  }, []);

  useRafLoop(updateAnimTime, true);

  const fitImage = useCallback(() => {
    if (!image) return;
    const container = stageContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const margin = 48;
    const availableW = Math.max(1, rect.width - margin * 2);
    const availableH = Math.max(1, rect.height - margin * 2);
    const s = Math.min(availableW / image.width, availableH / image.height);

    setScale(clamp(s, 0.1, 5));
    setPan({ x: 0, y: 0 });
  }, [image]);

  useEffect(() => {
    if (image) {
      fitImage();
    }
  }, [image, fitImage]);

  const openFilePicker = useCallback(() => {
    const el = inputRef.current;
    if (el) el.click();
  }, []);

  const loadImageFromFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      console.error("Failed to load image");
    };
    img.src = url;
  }, []);

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback(
      (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        loadImageFromFile(files[0]);
      },
      [loadImageFromFile],
    );

  const handleDropFiles = useCallback(
    (files: FileList) => {
      const file = files.item(0);
      if (!file) return;
      loadImageFromFile(file);
    },
    [loadImageFromFile],
  );

  return (
    <div className="w-full h-screen rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden grid grid-cols-1 md:grid-cols-[1fr_20rem] bg-white dark:bg-zinc-950 shadow-xl">
      <div className="flex flex-col relative">
        <Toolbar
          onLoadImage={openFilePicker}
          resetView={fitImage}
          hasImage={image !== null}
        />

        <div ref={stageContainerRef} className="relative flex-1">
          {image === null && (
            <div className="absolute inset-0 grid place-items-center z-20 pointer-events-none">
              <div className="text-center pointer-events-auto space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Sprite Sheet Previewer
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Drop a sprite sheet image or click to load
                  </p>
                </div>

                <button
                  onClick={openFilePicker}
                  className="px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-medium text-sm shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                >
                  Load Image
                </button>
              </div>
            </div>
          )}
          <div className="absolute inset-0 z-0">
            <PixiStage
              image={image}
              pan={pan}
              setPan={setPan}
              scale={scale}
              setScale={setScale}
              grid={grid}
              setGrid={setGrid}
              currentFrame={currentFrame}
              onDropFiles={handleDropFiles}
            />
          </div>
        </div>
      </div>

      <Sidebar
        image={image}
        grid={grid}
        setGrid={setGrid}
        fps={fps}
        setFps={setFps}
        currentFrame={currentFrame}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />
    </div>
  );
}

export function SpriteSheetViewer() {
  return (
    <NuqsAdapter>
      <SpriteSheetViewerContent />
    </NuqsAdapter>
  );
}
