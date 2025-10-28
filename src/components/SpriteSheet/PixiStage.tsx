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
}: PixiStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const imageContainerRef = useRef<PIXI.Container | null>(null);
  const gridGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const bgGraphicsRef = useRef<PIXI.Graphics | null>(null);
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
      await app.init({
        width: containerRef.current!.clientWidth,
        height: containerRef.current!.clientHeight,
        backgroundColor: 0x1a1a1a,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      containerRef.current!.appendChild(app.canvas);

      // Create checkerboard background
      const bgGraphics = new PIXI.Graphics();
      bgGraphicsRef.current = bgGraphics;
      app.stage.addChild(bgGraphics);

      // Function to draw checkerboard background
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

      // Create main container for pan/zoom
      const imageContainer = new PIXI.Container();
      imageContainerRef.current = imageContainer;
      app.stage.addChild(imageContainer);

      // Create grid graphics
      const gridGraphics = new PIXI.Graphics();
      gridGraphicsRef.current = gridGraphics;
      gridGraphics.eventMode = "static";
      gridGraphics.cursor = "move";
      imageContainer.addChild(gridGraphics);

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        if (containerRef.current) {
          app.renderer.resize(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight,
          );
          // Redraw background to match new size
          drawBackground();
          updateView();
          // Redraw grid after resize
          if (redrawGridRef.current) {
            redrawGridRef.current();
          }
        }
      });
      resizeObserver.observe(containerRef.current!);

      return () => {
        resizeObserver.disconnect();
      };
    })();

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
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
    sprite.anchor.set(0.5, 0.5);
    sprite.position.set(0, 0);

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
      const startX = originX;
      const startY = originY;
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

      // Highlight current frame
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
  }, [grid, image, currentFrame]);

  useEffect(() => {
    const app = appRef.current;
    const gridGraphics = gridGraphicsRef.current;
    const imageContainer = imageContainerRef.current;
    if (!app || !gridGraphics || !imageContainer) return;

    // Grid drag handlers
    const onGridPointerDown = (event: PIXI.FederatedPointerEvent) => {
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
      const dx = event.globalX - isDraggingRef.current.startX;
      const dy = event.globalY - isDraggingRef.current.startY;

      if (isDraggingRef.current.grid) {
        // Move grid
        setGrid((g) => ({
          ...g,
          originX: g.originX + dx / scale,
          originY: g.originY + dy / scale,
        }));
        isDraggingRef.current.startX = event.globalX;
        isDraggingRef.current.startY = event.globalY;
      } else if (isDraggingRef.current.pan) {
        // Pan canvas
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        isDraggingRef.current.startX = event.globalX;
        isDraggingRef.current.startY = event.globalY;
      }
    };

    const onPointerUp = () => {
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

    app.canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      gridGraphics.off("pointerdown", onGridPointerDown);
      app.stage.off("pointerdown", onStagePointerDown);
      app.stage.off("pointermove", onPointerMove);
      app.stage.off("pointerup", onPointerUp);
      app.stage.off("pointerupoutside", onPointerUp);
      app.canvas.removeEventListener("wheel", onWheel);
    };
  }, [scale, pan, setPan, setScale, setGrid]);

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
