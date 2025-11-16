import { CRTFilter, GlowFilter } from "pixi-filters";
import { Application, Graphics, Color } from "pixi.js";
import { TextRenderer, type TextConfig } from "./TextRenderer";

export class GameOfLife {
  private app: Application;
  private cellSize: number;
  private cols: number;
  private rows: number;
  private grid: boolean[][];
  private graphics: Graphics;
  private updateInterval: number;
  private lastUpdateTime: number;
  private glowFilter: GlowFilter;
  private crtFilter: CRTFilter;
  private currentHue: number;
  private hueChangeRate: number;
  private highPerformanceMode: boolean;
  private animationState: "intro" | "game";
  private introAnimationTime: number;
  private introStartTime: number;
  private introDuration: number;
  private textPattern: boolean[][];
  private introConfig: TextConfig;
  private textRenderer: TextRenderer;

  constructor(cellSize: number = 10, updateInterval: number = 100) {
    this.app = new Application();
    this.cellSize = cellSize;
    this.updateInterval = updateInterval;
    this.cols = 0;
    this.rows = 0;
    this.grid = [];
    this.graphics = new Graphics();
    this.lastUpdateTime = 0;
    this.glowFilter = new GlowFilter();
    this.crtFilter = new CRTFilter();
    this.currentHue = 0;
    this.hueChangeRate = 0.8;
    this.highPerformanceMode = false;
    this.animationState = "intro";
    this.introAnimationTime = 0;
    this.introStartTime = 0;
    this.introDuration = 2500;
    this.textPattern = [];
    this.introConfig = {
      lines: ["Welcome!"],
      align: "left",
      padding: 2,
    };
    this.textRenderer = new TextRenderer();
  }

  public async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      backgroundColor: 0x000000,
      resizeTo: window,
    });

    this.resize();

    this.glowFilter.color = new Color("#ffffff").toNumber();
    this.glowFilter.outerStrength = 2;
    this.glowFilter.innerStrength = 1;

    this.crtFilter.curvature = 2;
    this.crtFilter.lineWidth = 3;
    this.crtFilter.lineContrast = 0.3;
    this.crtFilter.noise = 0.2;
    this.crtFilter.noiseSize = 1;
    this.crtFilter.vignetting = 0.2;
    this.crtFilter.vignettingAlpha = 0.2;
    this.crtFilter.vignettingBlur = 0.3;

    this.graphics.filters = [this.glowFilter];
    this.app.stage.filters = [this.crtFilter];

    this.app.stage.addChild(this.graphics);
  }

  private createGrid(): boolean[][] {
    return Array.from({ length: this.cols }, () =>
      Array.from({ length: this.rows }, () => Math.random() > 0.8),
    );
  }

  public start(): void {
    this.introStartTime = performance.now();
    this.textPattern = this.textRenderer.renderText({
      lines: this.introConfig.lines,
      align: this.introConfig.align,
      padding: this.introConfig.padding,
      availableCols: this.cols,
      availableRows: this.rows,
    });
    this.initializeIntroGrid();
    this.app.ticker.add(this.update, this);
  }

  private initializeIntroGrid(): void {
    this.grid = Array.from({ length: this.cols }, () =>
      Array.from({ length: this.rows }, () => false),
    );

    const patternWidth = this.textPattern.length;
    const patternHeight = this.textPattern[0]?.length || 0;

    if (patternWidth === 0 || patternHeight === 0) return;

    const offsetX = this.introConfig.padding;
    const offsetY = this.introConfig.padding;

    for (let px = 0; px < patternWidth; px++) {
      for (let py = 0; py < patternHeight; py++) {
        if (this.textPattern[px][py]) {
          const gx = offsetX + px;
          const gy = offsetY + py;

          if (gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows) {
            this.grid[gx][gy] = true;
          }
        }
      }
    }
  }

  private update(): void {
    const currentTime = performance.now();

    if (this.animationState === "intro") {
      this.introAnimationTime = currentTime - this.introStartTime;

      if (this.introAnimationTime >= this.introDuration) {
        this.animationState = "game";
        this.lastUpdateTime = currentTime;
      }

      this.drawIntroAnimation();
    } else {
      if (currentTime - this.lastUpdateTime > this.updateInterval) {
        this.nextGeneration();
        if (!this.highPerformanceMode) {
          this.draw();
        }
        this.lastUpdateTime = currentTime;
      }

      if (this.highPerformanceMode) {
        this.draw();
      }
    }
  }

  private drawIntroAnimation(): void {
    this.graphics.clear();

    const progress = Math.min(this.introAnimationTime / this.introDuration, 1);
    const revealProgress = Math.min(progress * 1.2, 1);

    const waveAmplitude = 2;
    const waveFrequency = 0.08;
    const waveSpeed = this.introAnimationTime * 0.002;

    const rowCount = this.rows;
    const hueStep = 360 / rowCount;

    for (let y = 0; y < this.rows; y++) {
      const rowHue = (this.currentHue + y * hueStep) % 360;
      const rgb = this.hsvToRgb(rowHue, 1, 0.8);
      const cellColor = new Color({
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
      }).toNumber();

      for (let x = 0; x < this.cols; x++) {
        if (this.grid[x][y]) {
          const cellProgress = (x + y * 0.5) / (this.cols + this.rows * 0.5);

          if (cellProgress <= revealProgress) {
            const waveFactor = Math.max(0, 1 - progress * 2);
            const wave =
              Math.sin(x * waveFrequency + waveSpeed) *
              waveAmplitude *
              waveFactor;

            const displayY = y + wave;

            this.graphics
              .fill({ color: cellColor })
              .rect(
                x * this.cellSize,
                displayY * this.cellSize,
                this.cellSize,
                this.cellSize,
              );
          }
        }
      }
    }

    this.updateHue();
  }

  private nextGeneration(): void {
    const next = this.createGrid();

    for (let x = 0; x < this.cols; x++) {
      for (let y = 0; y < this.rows; y++) {
        const neighbors = this.countNeighbors(x, y);
        if (this.grid[x][y]) {
          next[x][y] = neighbors === 2 || neighbors === 3;
        } else {
          next[x][y] = neighbors === 3;
        }
      }
    }

    this.grid = next;
  }

  private countNeighbors(x: number, y: number): number {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        const col = (x + i + this.cols) % this.cols;
        const row = (y + j + this.rows) % this.rows;
        if (this.grid[col][row]) count++;
      }
    }
    return count;
  }

  private draw(): void {
    this.graphics.clear();

    const rowCount = this.rows;
    const hueStep = 360 / rowCount;

    for (let y = 0; y < this.rows; y++) {
      // Calculate hue for this row, offsetting by the current hue
      const rowHue = (this.currentHue + y * hueStep) % 360;
      const rgb = this.hsvToRgb(rowHue, 1, 0.8); // Reduced brightness for better visibility
      const cellColor = new Color({
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
      }).toNumber();

      for (let x = 0; x < this.cols; x++) {
        if (this.grid[x][y]) {
          this.graphics
            .fill({ color: cellColor })
            .rect(
              x * this.cellSize,
              y * this.cellSize,
              this.cellSize,
              this.cellSize,
            );
        }
      }
    }

    this.updateHue();
  }

  private updateHue(): void {
    this.currentHue = (this.currentHue + this.hueChangeRate * 2) % 360;
  }

  public handleClick(x: number, y: number): void {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);

    if (cellX >= 0 && cellX < this.cols && cellY >= 0 && cellY < this.rows) {
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const newX = (cellX + i + this.cols) % this.cols;
          const newY = (cellY + j + this.rows) % this.rows;
          if (Math.random() < 0.7) {
            this.grid[newX][newY] = true;
          }
        }
      }
    }
  }

  public resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.app.renderer.resize(width, height);
    this.cols = Math.floor(width / this.cellSize);
    this.rows = Math.floor(height / this.cellSize);
    this.grid = this.createGrid();
  }

  public setCellSize(size: number): void {
    this.cellSize = size;
    this.resize();
  }

  public setUpdateInterval(interval: number): void {
    this.updateInterval = interval;
  }

  public destroy(): void {
    this.app.destroy(true, { children: true, texture: true });
  }

  public setHighPerformanceMode(enabled: boolean): void {
    this.highPerformanceMode = enabled;
  }

  public setIntroConfig(
    config: Partial<TextConfig> & { duration?: number },
  ): void {
    if (config.lines) this.introConfig.lines = config.lines;
    if (config.align) this.introConfig.align = config.align;
    if (config.padding !== undefined) this.introConfig.padding = config.padding;
    if (config.duration !== undefined) this.introDuration = config.duration;
  }

  private hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    let r: number, g: number, b: number;
    const i = Math.floor(h / 60);
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0:
        [r, g, b] = [v, t, p];
        break;
      case 1:
        [r, g, b] = [q, v, p];
        break;
      case 2:
        [r, g, b] = [p, v, t];
        break;
      case 3:
        [r, g, b] = [p, q, v];
        break;
      case 4:
        [r, g, b] = [t, p, v];
        break;
      case 5:
        [r, g, b] = [v, p, q];
        break;
      default:
        [r, g, b] = [0, 0, 0];
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
}
