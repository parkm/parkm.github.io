import { CRTFilter, GlowFilter } from "pixi-filters";
import { Application, Graphics, Color } from "pixi.js";

type Vec2 = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";

interface SnakeState {
  snake: Vec2[];
  direction: Direction;
  nextDirection: Direction;
  pellets: Vec2[];
  score: number;
  gameOver: boolean;
  pelletSpawnTimer: number;
}

export class SnakeCrt {
  private app: Application;
  private cellSize: number;
  private cols: number;
  private rows: number;
  private graphics: Graphics;
  private updateInterval: number;
  private lastUpdateTime: number;
  private glowFilter: GlowFilter;
  private crtFilter: CRTFilter;
  private currentHue: number;
  private hueChangeRate: number;
  private highPerformanceMode: boolean;
  private state: SnakeState;
  private pelletSpawnInterval: number;
  private maxPellets: number;

  constructor({
    cellSize = 24,
    updateInterval = 100,
  }: {
    cellSize?: number;
    updateInterval?: number;
  }) {
    this.app = new Application();
    this.cellSize = cellSize;
    this.updateInterval = updateInterval;
    this.cols = 0;
    this.rows = 0;
    this.graphics = new Graphics();
    this.lastUpdateTime = 0;
    this.glowFilter = new GlowFilter();
    this.crtFilter = new CRTFilter();
    this.currentHue = 120;
    this.hueChangeRate = 0.8;
    this.highPerformanceMode = false;
    this.pelletSpawnInterval = 2000;
    this.maxPellets = 5;

    this.state = {
      snake: [],
      direction: "right",
      nextDirection: "right",
      pellets: [],
      score: 0,
      gameOver: false,
      pelletSpawnTimer: 0,
    };
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
    this.initializeGame();

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

    this.setupInput();
  }

  private initializeGame(): void {
    const midX = Math.floor(this.cols / 2);
    const midY = Math.floor(this.rows / 2);

    this.state = {
      snake: [
        { x: midX, y: midY },
        { x: midX - 1, y: midY },
        { x: midX - 2, y: midY },
        { x: midX - 3, y: midY },
      ],
      direction: "right",
      nextDirection: "right",
      pellets: [],
      score: 0,
      gameOver: false,
      pelletSpawnTimer: 0,
    };

    this.spawnPellet();
  }

  private setupInput(): void {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (this.state.gameOver && e.code === "Space") {
        this.initializeGame();
        return;
      }

      const directionMap: Record<string, Direction> = {
        ArrowUp: "up",
        KeyW: "up",
        ArrowDown: "down",
        KeyS: "down",
        ArrowLeft: "left",
        KeyA: "left",
        ArrowRight: "right",
        KeyD: "right",
      };

      const newDirection = directionMap[e.code];
      if (newDirection && this.isValidDirection(newDirection)) {
        this.state.nextDirection = newDirection;
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const canvas = this.app.canvas as HTMLCanvasElement;

    const handleTouch = (clientX: number, clientY: number) => {
      if (this.state.gameOver) {
        this.initializeGame();
        return;
      }

      if (!this.state.snake || this.state.snake.length === 0) {
        return;
      }

      const head = this.state.snake[0];
      const headScreenX = head.x * this.cellSize + this.cellSize / 2;
      const headScreenY = head.y * this.cellSize + this.cellSize / 2;

      const deltaX = clientX - headScreenX;
      const deltaY = clientY - headScreenY;

      if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) {
        return;
      }

      const opposites: Record<Direction, Direction> = {
        up: "down",
        down: "up",
        left: "right",
        right: "left",
      };

      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      const directions: Array<{ dir: Direction; priority: number }> = [];

      if (deltaX > 0) directions.push({ dir: "right", priority: absDeltaX });
      if (deltaX < 0) directions.push({ dir: "left", priority: absDeltaX });
      if (deltaY > 0) directions.push({ dir: "down", priority: absDeltaY });
      if (deltaY < 0) directions.push({ dir: "up", priority: absDeltaY });

      directions.sort((a, b) => b.priority - a.priority);

      for (const { dir } of directions) {
        if (opposites[this.state.direction] !== dir) {
          this.state.nextDirection = dir;
          return;
        }
      }
    };

    document.addEventListener(
      "touchstart",
      (e) => {
        const touch = e.touches[0];
        handleTouch(touch.clientX, touch.clientY);
      },
      { passive: true },
    );

    document.addEventListener(
      "touchmove",
      (e) => {
        const touch = e.touches[0];
        handleTouch(touch.clientX, touch.clientY);
      },
      { passive: true },
    );

    canvas.addEventListener(
      "touchstart",
      (e) => {
        const touch = e.touches[0];
        handleTouch(touch.clientX, touch.clientY);
      },
      { passive: true },
    );

    canvas.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        handleTouch(touch.clientX, touch.clientY);
      },
      { passive: false },
    );
  }

  private isValidDirection(newDir: Direction): boolean {
    const opposites: Record<Direction, Direction> = {
      up: "down",
      down: "up",
      left: "right",
      right: "left",
    };
    return opposites[this.state.direction] !== newDir;
  }

  private spawnPellet(): void {
    if (this.state.pellets.length >= this.maxPellets) return;

    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const pos = {
        x: Math.floor(Math.random() * this.cols),
        y: Math.floor(Math.random() * this.rows),
      };

      const isOnSnake = this.state.snake.some(
        (segment) => segment.x === pos.x && segment.y === pos.y,
      );
      const isOnPellet = this.state.pellets.some(
        (pellet) => pellet.x === pos.x && pellet.y === pos.y,
      );

      if (!isOnSnake && !isOnPellet) {
        this.state.pellets.push(pos);
        break;
      }

      attempts++;
    }
  }

  public start(): void {
    this.lastUpdateTime = performance.now();
    this.app.ticker.add(this.update, this);
  }

  private update(): void {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastUpdateTime;

    if (!this.state.gameOver && deltaTime > this.updateInterval) {
      this.updateGame(deltaTime);
      this.lastUpdateTime = currentTime;
    }

    if (this.highPerformanceMode || this.state.gameOver) {
      this.draw();
    } else if (deltaTime > this.updateInterval) {
      this.draw();
    }
  }

  private updateGame(deltaTime: number): void {
    this.state.direction = this.state.nextDirection;

    const head = this.state.snake[0];
    const directionVectors: Record<Direction, Vec2> = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };

    const delta = directionVectors[this.state.direction];
    const newHead = {
      x: (head.x + delta.x + this.cols) % this.cols,
      y: (head.y + delta.y + this.rows) % this.rows,
    };

    const hitSelf = this.state.snake.some(
      (segment) => segment.x === newHead.x && segment.y === newHead.y,
    );

    if (hitSelf) {
      this.state.gameOver = true;
      return;
    }

    this.state.snake.unshift(newHead);

    const pelletIndex = this.state.pellets.findIndex(
      (pellet) => pellet.x === newHead.x && pellet.y === newHead.y,
    );

    if (pelletIndex !== -1) {
      this.state.pellets.splice(pelletIndex, 1);
      this.state.score += 10;
    } else {
      this.state.snake.pop();
    }

    this.state.pelletSpawnTimer += deltaTime;
    if (this.state.pelletSpawnTimer >= this.pelletSpawnInterval) {
      this.state.pelletSpawnTimer = 0;
      this.spawnPellet();
    }
  }

  private draw(): void {
    this.graphics.clear();
    for (let i = 0; i < this.state.pellets.length; i++) {
      const pellet = this.state.pellets[i];
      const pelletHue = (this.currentHue + 180) % 360;
      const rgb = this.hsvToRgb(pelletHue, 1, 0.8);
      const cellColor = new Color({
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
      }).toNumber();

      this.graphics
        .fill({ color: cellColor })
        .rect(
          pellet.x * this.cellSize,
          pellet.y * this.cellSize,
          this.cellSize,
          this.cellSize,
        );
    }

    for (let i = 0; i < this.state.snake.length; i++) {
      const segment = this.state.snake[i];
      const segmentProgress = i / Math.max(this.state.snake.length - 1, 1);
      const segmentHue = (this.currentHue + segmentProgress * 60) % 360;
      const rgb = this.hsvToRgb(segmentHue, 1, 0.8);
      const cellColor = new Color({
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
      }).toNumber();

      this.graphics
        .fill({ color: cellColor })
        .rect(
          segment.x * this.cellSize,
          segment.y * this.cellSize,
          this.cellSize,
          this.cellSize,
        );
    }

    if (this.state.gameOver) {
      const gameOverHue = 0;
      const rgb = this.hsvToRgb(gameOverHue, 1, 0.8);
      const textColor = new Color({
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
      }).toNumber();

      const centerX = Math.floor(this.cols / 2);
      const centerY = Math.floor(this.rows / 2);

      for (let dx = -10; dx <= 10; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          const x = (centerX + dx + this.cols) % this.cols;
          const y = (centerY + dy + this.rows) % this.rows;
          this.graphics
            .fill({ color: textColor })
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

  public resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.app.renderer.resize(width, height);
    this.cols = Math.floor(width / this.cellSize);
    this.rows = Math.floor(height / this.cellSize);
    this.initializeGame();
  }

  public setCellSize(size: number): void {
    this.cellSize = size;
    this.resize();
  }

  public setUpdateInterval(interval: number): void {
    this.updateInterval = interval;
  }

  public setHighPerformanceMode(enabled: boolean): void {
    this.highPerformanceMode = enabled;
  }

  public destroy(): void {
    this.app.destroy(true, { children: true, texture: true });
  }

  public getScore(): number {
    return this.state.score;
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
