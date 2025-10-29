import React, { useEffect, useRef, useCallback } from "react";
import * as PIXI from "pixi.js";
import type { Vec2, Grid } from "./types";

type PixiStageProps = {
  image: HTMLImageElement | null;
  pan: Vec2;
  setPan: React.Dispatch<React.SetStateAction<Vec2>>;
  scale: number;
  setScale: (s: number) => void;
  grid: Grid;
  setGrid: React.Dispatch<React.SetStateAction<Grid>>;
  currentFrame: number | null;
  onDropFiles: (files: FileList) => void;
  highlightedFrames?: number[];
  onCellPointerDown?: (index: number) => void;
  onCellPointerMove?: (index: number) => void;
  onCellPointerUp?: () => void;
};

export function PixiStage({
  image,
  pan,
  setPan,
  scale,
  setScale,
  grid,
  setGrid,
  currentFrame,
  onDropFiles,
  highlightedFrames = [],
  onCellPointerDown,
  onCellPointerMove,
  onCellPointerUp,
}: PixiStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const imageContainerRef = useRef<PIXI.Container | null>(null);
  const gridGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const bgGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef<{
    grid: boolean;
    pan: boolean;
    startX: number;
    startY: number;
  }>({
    grid: false,
    pan: false,
    startX: 0,
    startY: 0,
  });
  const redrawGridRef = useRef<(() => void) | null>(null);

  // Initialize PixiJS
  useEffect(() => {
    if (!containerRef.current || appRef.current) return;

    const app = new PIXI.Application();
    appRef.current = app;

    (async () => {
      if (!containerRef.current) return;

      await app.init({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        backgroundColor: 0x1a1a1a,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (!containerRef.current) return;
      containerRef.current.appendChild(app.canvas);
      canvasRef.current = app.canvas;

      const bgGraphics = new PIXI.Graphics();
      bgGraphicsRef.current = bgGraphics;
      app.stage.addChild(bgGraphics);

      const drawBackground = () => {
        bgGraphics.clear();
        const checkSize = 16;
        const cols = Math.ceil(app.screen.width / checkSize) + 1;
        const rows = Math.ceil(app.screen.height / checkSize) + 1;

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const color = (x + y) % 2 === 0 ? 0x2a2a2a : 0x1a1a1a;
            bgGraphics.rect(x * checkSize, y * checkSize, checkSize, checkSize);
            bgGraphics.fill({ color });
          }
        }
      };

      drawBackground();

      const imageContainer = new PIXI.Container();
      imageContainerRef.current = imageContainer;
      app.stage.addChild(imageContainer);

      const gridGraphics = new PIXI.Graphics();
      gridGraphicsRef.current = gridGraphics;
      gridGraphics.eventMode = "static";
      gridGraphics.cursor = "move";
      imageContainer.addChild(gridGraphics);

      const resizeObserver = new ResizeObserver(() => {
        if (containerRef.current && app.renderer) {
          app.renderer.resize(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight,
          );
          drawBackground();
          updateView();
          if (redrawGridRef.current) {
            redrawGridRef.current();
          }
        }
      });

      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      return () => {
        resizeObserver.disconnect();
      };
    })();

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
        imageContainerRef.current = null;
        gridGraphicsRef.current = null;
        bgGraphicsRef.current = null;
        canvasRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update view transform
  const updateView = useCallback(() => {
    const app = appRef.current;
    const imageContainer = imageContainerRef.current;
    if (!app || !imageContainer) return;

    const centerX = app.screen.width / 2;
    const centerY = app.screen.height / 2;

    imageContainer.position.set(centerX + pan.x, centerY + pan.y);
    imageContainer.scale.set(scale, scale);
  }, [pan, scale]);

  useEffect(() => {
    updateView();
  }, [updateView]);

  // Load and display image
  useEffect(() => {
    const imageContainer = imageContainerRef.current;
    if (!imageContainer || !image) return;

    // Remove old sprite if exists
    const oldSprite = imageContainer.children.find(
      (child) => child instanceof PIXI.Sprite,
    );
    if (oldSprite) {
      imageContainer.removeChild(oldSprite);
    }

    const texture = PIXI.Texture.from(image);
    texture.source.scaleMode = "nearest"; // Pixel-perfect scaling

    const sprite = new PIXI.Sprite(texture);
    // Set anchor to top-left so (0, 0) origin means top-left of image
    sprite.anchor.set(0, 0);
    // Position sprite so its top-left is at world origin (0, 0)
    sprite.position.set(-image.width / 2, -image.height / 2);

    const gridIndex = imageContainer.getChildIndex(gridGraphicsRef.current!);
    imageContainer.addChildAt(sprite, gridIndex);
  }, [image]);

  // Draw grid
  useEffect(() => {
    const gridGraphics = gridGraphicsRef.current;
    if (!gridGraphics || !image) return;

    const drawGrid = () => {
      gridGraphics.clear();

      const { originX, originY, cols, rows, cellW, cellH } = grid;
      // Convert from image-space (0,0 = top-left of image) to world-space
      // The sprite is positioned at (-width/2, -height/2) so its top-left is at world (0,0)
      const startX = -image.width / 2 + originX;
      const startY = -image.height / 2 + originY;
      const totalW = cols * cellW;
      const totalH = rows * cellH;

      // Draw grid background
      gridGraphics.rect(startX, startY, totalW, totalH);
      gridGraphics.fill({ color: 0x38bdf8, alpha: 0.1 });

      // Draw grid border
      gridGraphics.rect(startX, startY, totalW, totalH);
      gridGraphics.stroke({ color: 0x7dd3fc, width: 2 });

      // Draw grid lines
      for (let i = 1; i < cols; i++) {
        const x = startX + i * cellW;
        gridGraphics.moveTo(x, startY);
        gridGraphics.lineTo(x, startY + totalH);
        gridGraphics.stroke({ color: 0x7dd3fc, width: 1 });
      }
      for (let j = 1; j < rows; j++) {
        const y = startY + j * cellH;
        gridGraphics.moveTo(startX, y);
        gridGraphics.lineTo(startX + totalW, y);
        gridGraphics.stroke({ color: 0x7dd3fc, width: 1 });
      }

      // Highlight animation frames (red)
      for (const frameIndex of highlightedFrames) {
        const col = cols === 0 ? 0 : frameIndex % cols;
        const row = cols === 0 ? 0 : Math.floor(frameIndex / cols);
        if (row >= rows) continue; // Skip if out of bounds

        const hx = startX + col * cellW;
        const hy = startY + row * cellH;
        gridGraphics.rect(hx, hy, cellW, cellH);
        gridGraphics.fill({ color: 0xff4444, alpha: 0.3 });
        gridGraphics.rect(hx, hy, cellW, cellH);
        gridGraphics.stroke({ color: 0xff4444, width: 2 });
      }

      // Highlight current frame (yellow)
      if (typeof currentFrame === "number") {
        const col = cols === 0 ? 0 : currentFrame % cols;
        const row = cols === 0 ? 0 : Math.floor(currentFrame / cols);
        const hx = startX + col * cellW;
        const hy = startY + row * cellH;
        gridGraphics.rect(hx, hy, cellW, cellH);
        gridGraphics.stroke({ color: 0xffd666, width: 3 });
      }

      // Update hit area for the grid
      gridGraphics.hitArea = new PIXI.Rectangle(startX, startY, totalW, totalH);
    };

    // Store the draw function in ref so it can be called on resize
    redrawGridRef.current = drawGrid;
    drawGrid();
  }, [grid, image, currentFrame, highlightedFrames]);

  useEffect(() => {
    const app = appRef.current;
    const gridGraphics = gridGraphicsRef.current;
    const imageContainer = imageContainerRef.current;
    if (!app || !gridGraphics || !imageContainer) return;

    // Helper to get cell index from world coordinates
    const getCellIndexFromWorld = (
      worldX: number,
      worldY: number,
    ): number | null => {
      if (!image) return null;

      const { originX, originY, cols, rows, cellW, cellH } = grid;
      const startX = -image.width / 2 + originX;
      const startY = -image.height / 2 + originY;

      const localX = worldX - startX;
      const localY = worldY - startY;

      if (localX < 0 || localY < 0) return null;

      const col = Math.floor(localX / cellW);
      const row = Math.floor(localY / cellH);

      if (col >= cols || row >= rows) return null;

      return row * cols + col;
    };

    // Grid drag handlers
    const onGridPointerDown = (event: PIXI.FederatedPointerEvent) => {
      if (event.shiftKey) {
        isDraggingRef.current.grid = true;
        isDraggingRef.current.startX = event.globalX;
        isDraggingRef.current.startY = event.globalY;
        event.stopPropagation();
        return;
      }

      if (onCellPointerDown) {
        const worldPos = imageContainer.toLocal(event.global);
        const cellIndex = getCellIndexFromWorld(worldPos.x, worldPos.y);

        if (cellIndex !== null) {
          onCellPointerDown(cellIndex);
          event.stopPropagation();
          return;
        }
      }

      isDraggingRef.current.grid = true;
      isDraggingRef.current.startX = event.globalX;
      isDraggingRef.current.startY = event.globalY;
      event.stopPropagation();
    };

    // Pan handlers (on stage background)
    const onStagePointerDown = (event: PIXI.FederatedPointerEvent) => {
      if (isDraggingRef.current.grid) return;
      isDraggingRef.current.pan = true;
      isDraggingRef.current.startX = event.globalX;
      isDraggingRef.current.startY = event.globalY;
    };

    const onPointerMove = (event: PIXI.FederatedPointerEvent) => {
      if (
        !isDraggingRef.current.grid &&
        onCellPointerMove &&
        imageContainer &&
        !event.shiftKey
      ) {
        const worldPos = imageContainer.toLocal(event.global);
        const cellIndex = getCellIndexFromWorld(worldPos.x, worldPos.y);

        if (cellIndex !== null) {
          onCellPointerMove(cellIndex);
        }
      }

      const dx = event.globalX - isDraggingRef.current.startX;
      const dy = event.globalY - isDraggingRef.current.startY;

      if (isDraggingRef.current.grid) {
        setGrid((g) => ({
          ...g,
          originX: g.originX + dx / scale,
          originY: g.originY + dy / scale,
        }));
        isDraggingRef.current.startX = event.globalX;
        isDraggingRef.current.startY = event.globalY;
      } else if (isDraggingRef.current.pan) {
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        isDraggingRef.current.startX = event.globalX;
        isDraggingRef.current.startY = event.globalY;
      }
    };

    const onPointerUp = () => {
      if (onCellPointerUp) {
        onCellPointerUp();
      }
      isDraggingRef.current.grid = false;
      isDraggingRef.current.pan = false;
    };

    // Wheel zoom
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      const direction = event.deltaY > 0 ? -1 : 1;
      const zoomFactor = 1 + 0.1 * direction;

      const rect = app.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const centerX = app.screen.width / 2;
      const centerY = app.screen.height / 2;

      // World position before zoom
      const worldX = (mouseX - centerX - pan.x) / scale;
      const worldY = (mouseY - centerY - pan.y) / scale;

      const newScale = Math.max(0.1, Math.min(20, scale * zoomFactor));

      // Adjust pan to keep mouse position fixed
      const newPanX = mouseX - centerX - worldX * newScale;
      const newPanY = mouseY - centerY - worldY * newScale;

      setScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    };

    gridGraphics.on("pointerdown", onGridPointerDown);
    app.stage.on("pointerdown", onStagePointerDown);
    app.stage.on("pointermove", onPointerMove);
    app.stage.on("pointerup", onPointerUp);
    app.stage.on("pointerupoutside", onPointerUp);
    app.stage.eventMode = "static";

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("wheel", onWheel, { passive: false });
    }

    return () => {
      if (gridGraphics) {
        gridGraphics.off("pointerdown", onGridPointerDown);
      }
      if (app.stage) {
        app.stage.off("pointerdown", onStagePointerDown);
        app.stage.off("pointermove", onPointerMove);
        app.stage.off("pointerup", onPointerUp);
        app.stage.off("pointerupoutside", onPointerUp);
      }
      if (canvas) {
        canvas.removeEventListener("wheel", onWheel);
      }
    };
  }, [
    scale,
    pan,
    setPan,
    setScale,
    setGrid,
    grid,
    image,
    onCellPointerDown,
    onCellPointerMove,
    onCellPointerUp,
  ]);

  // Drag and drop
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onDropFiles(e.dataTransfer.files);
      }
    },
    [onDropFiles],
  );

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
