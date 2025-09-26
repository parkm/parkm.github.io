type Vec2 = { x: number; y: number };
type Pellet = { pos: Vec2; active: boolean; fadeInTimer: number };
type Pop = { pos: Vec2; timer: number; active: boolean };

const MAX_SNAKE_LENGTH = 6400;
const SEGMENT_SPACING = 16;
const BASE_SPEED = 340;
const SPEED_MULT = 3;
const HEAD_RADIUS = 12;
const TAIL_RADIUS = 6.5;
const SELF_HIT_GAP = 6;
const CUT_DURATION = 0.45;
const PELLET_RADIUS = 14;
const POP_DURATION = 0.3;
const MAX_PELLET_POPS = 64;
const PELLET_SPAWN_INTERVAL = 1.0; // seconds between automatic pellet spawns
const PELLET_FADE_DURATION = 0.5; // fade in duration (seconds)

type GameState = {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  positions: Vec2[];
  dir: Vec2;
  length: number;
  score: number;
  pellets: Pellet[];
  pops: Pop[];
  boosting: boolean;
  cuttingTail: boolean;
  cutFrom: number;
  cutStartLen: number;
  cutTimer: number;
  safeMode: boolean;
  touchTarget: Vec2 | null;
  pelletSpawnTimer: number;
};

function init(canvas: HTMLCanvasElement): GameState {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const mid = { x: canvas.width / 2, y: canvas.height / 2 };
  const positions = Array.from({ length: 14 }, (_, i) => ({
    x: wrap(mid.x - i * SEGMENT_SPACING, canvas.width),
    y: mid.y,
  }));

  const state: GameState = {
    ctx,
    canvas,
    positions,
    dir: { x: 1, y: 0 },
    length: 14,
    score: 0,
    pellets: [],
    pops: [],
    boosting: false,
    cuttingTail: false,
    cutFrom: -1,
    cutStartLen: 0,
    cutTimer: 0,
    safeMode: true,
    touchTarget: null,
    pelletSpawnTimer: 0,
  };

  spawnPellet(state, 4);
  setupInput(state);
  return state;
}

function setupInput(state: GameState) {
  const pressed = new Set<string>();
  const spawnButton = document.getElementById("spawn-button");

  function updateDir() {
    let dx = 0,
      dy = 0;
    if (pressed.has("ArrowRight") || pressed.has("KeyD")) dx += 1;
    if (pressed.has("ArrowLeft") || pressed.has("KeyA")) dx -= 1;
    if (pressed.has("ArrowUp") || pressed.has("KeyW")) dy -= 1;
    if (pressed.has("ArrowDown") || pressed.has("KeyS")) dy += 1;

    // normalize so snake doesn't go faster diagonally
    if (dx || dy) {
      const { x, y } = state.dir;
      // prevent direct reversal on a single axis
      if (!(dx === -x && dy === -y)) {
        state.dir = { x: dx, y: dy };
      }
    }
  }

  // --- keyboard input ---
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "Space",
        ].includes(e.code)
      ) {
        e.preventDefault();
      }

      pressed.add(e.code);

      if (e.code === "Space") {
        spawnPellet(state, 8 + Math.floor(Math.random() * 3));

        // Visual feedback for spawn button when space is pressed
        if (spawnButton) {
          spawnButton.classList.add(
            "bg-green-600/80",
            "border-green-400",
            "scale-95",
          );
          spawnButton.classList.remove("bg-black/70", "border-white/30");

          setTimeout(() => {
            spawnButton.classList.remove(
              "bg-green-600/80",
              "border-green-400",
              "scale-95",
            );
            spawnButton.classList.add("bg-black/70", "border-white/30");
          }, 150);
        }
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        state.boosting = true;
      }

      updateDir();
    },
    { passive: false },
  );

  window.addEventListener("keyup", (e) => {
    pressed.delete(e.code);
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      state.boosting = false;
    }
    updateDir();
  });

  // --- mobile touch input ---
  state.canvas.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      state.touchTarget = { x: t.clientX, y: t.clientY };
      state.boosting = e.touches.length >= 2;
    },
    { passive: true },
  );

  state.canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      const t = e.touches[0];
      state.touchTarget = { x: t.clientX, y: t.clientY };
      state.boosting = e.touches.length >= 2;
    },
    { passive: false },
  );

  state.canvas.addEventListener(
    "touchend",
    (e) => {
      if (e.touches.length === 0) {
        // No fingers left stop everything
        state.boosting = false;
        state.touchTarget = null;
      } else {
        // Update movement target to remaining first touch
        const t = e.touches[0];
        state.touchTarget = { x: t.clientX, y: t.clientY };
        state.boosting = e.touches.length >= 2;
      }
    },
    { passive: true },
  );

  // --- button input ---
  if (spawnButton) {
    const handleSpawn = (e: Event) => {
      e.preventDefault();
      spawnPellet(state, 3 + Math.floor(Math.random() * 3));

      // Visual feedback for spawn button
      spawnButton.classList.add(
        "bg-green-600/80",
        "border-green-400",
        "scale-95",
      );
      spawnButton.classList.remove("bg-black/70", "border-white/30");

      setTimeout(() => {
        spawnButton.classList.remove(
          "bg-green-600/80",
          "border-green-400",
          "scale-95",
        );
        spawnButton.classList.add("bg-black/70", "border-white/30");
      }, 150);
    };

    spawnButton.addEventListener("click", handleSpawn);
    spawnButton.addEventListener("touchstart", handleSpawn, { passive: false });
  }
}

function update(state: GameState, dt: number) {
  // if finger is down, move towards it
  if (state.touchTarget) {
    const head = state.positions[0];
    const delta = {
      x: state.touchTarget.x - head.x,
      y: state.touchTarget.y - head.y,
    };
    const d = norm(delta);
    if (d.x || d.y) {
      const { x, y } = state.dir;
      // prevent exact reversal
      if (!(d.x === -x && d.y === -y)) {
        state.dir = d;
      }
    }
  }

  const speed =
    BASE_SPEED *
    (state.boosting ? SPEED_MULT : 1) *
    (state.cuttingTail ? 0.35 : 1);

  // Move head
  const head = state.positions[0];
  state.positions[0] = {
    x: wrap(head.x + state.dir.x * speed * dt, state.canvas.width),
    y: wrap(head.y + state.dir.y * speed * dt, state.canvas.height),
  };

  // Body follows
  for (let i = 1; i < state.length; i++) {
    const toPrev = toroidalDelta(
      state.positions[i],
      state.positions[i - 1],
      state.canvas,
    );
    const n = norm(toPrev);
    const target = {
      x: state.positions[i - 1].x - n.x * SEGMENT_SPACING,
      y: state.positions[i - 1].y - n.y * SEGMENT_SPACING,
    };
    state.positions[i] = {
      x: wrap(target.x, state.canvas.width),
      y: wrap(target.y, state.canvas.height),
    };
  }

  // Consume pellet
  for (const f of state.pellets) {
    if (!f.active) continue;
    const d = toroidalDelta(f.pos, state.positions[0], state.canvas);
    if (d.x * d.x + d.y * d.y <= (HEAD_RADIUS + PELLET_RADIUS) ** 2) {
      f.active = false;
      state.score += 10;
      if (state.length < MAX_SNAKE_LENGTH) {
        const tail = state.positions[state.length - 1];
        const prev = state.positions[state.length - 2] ?? tail;
        const dir = norm(toroidalDelta(tail, prev, state.canvas));
        state.positions.push({
          x: wrap(tail.x - dir.x * SEGMENT_SPACING, state.canvas.width),
          y: wrap(tail.y - dir.y * SEGMENT_SPACING, state.canvas.height),
        });
        state.length++;
      }
      spawnPop(state, f.pos);
    }
  }

  // Self-hit
  if (!state.cuttingTail) {
    const hitR2 = ((HEAD_RADIUS + TAIL_RADIUS) * 0.65) ** 2;
    for (let i = SELF_HIT_GAP; i < state.length; i++) {
      const d = toroidalDelta(
        state.positions[0],
        state.positions[i],
        state.canvas,
      );
      if (d.x * d.x + d.y * d.y <= hitR2 && !state.safeMode) {
        Object.assign(state, {
          cuttingTail: true,
          cutFrom: i,
          cutStartLen: state.length,
          cutTimer: 0,
        });
        break;
      }
    }
  } else {
    state.cutTimer += dt;
    if (state.cutTimer >= CUT_DURATION) {
      state.length = state.cutFrom;
      state.positions = state.positions.slice(0, state.length);
      Object.assign(state, {
        cuttingTail: false,
        cutFrom: -1,
        cutStartLen: 0,
        cutTimer: 0,
      });
    }
  }

  state.pelletSpawnTimer += dt;
  if (state.pelletSpawnTimer >= PELLET_SPAWN_INTERVAL) {
    state.pelletSpawnTimer = 0;
    const spawnCount = 1 + Math.floor(Math.random() * 3);
    spawnPellet(state, spawnCount);
  }

  // Update fade timers
  for (const f of state.pellets) {
    if (f.active && f.fadeInTimer < PELLET_FADE_DURATION) {
      f.fadeInTimer = Math.min(f.fadeInTimer + dt, PELLET_FADE_DURATION);
    }
  }

  state.pops.forEach((p) => {
    if (p.active && (p.timer += dt) >= POP_DURATION) p.active = false;
  });
  state.pops = state.pops.filter((p) => p.active).slice(-MAX_PELLET_POPS);
}

function draw(state: GameState) {
  const { ctx, canvas } = state;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgb(12,12,16)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const hueShift = (performance.now() / 40) % 360;
  const headHue = hueShift;
  const pelletHue = (headHue + 180) % 360;

  for (const f of state.pellets) {
    if (!f.active) continue;

    const fadeAlpha = Math.min(f.fadeInTimer / PELLET_FADE_DURATION, 1);

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 600);
    const pelletColor = `hsla(${pelletHue}, 80%, ${50 + 20 * pulse}%, ${fadeAlpha})`;
    const glowColor = `hsla(${pelletHue}, 80%, ${30 + 20 * pulse}%, ${0.4 * fadeAlpha})`;

    const g = ctx.createRadialGradient(
      f.pos.x,
      f.pos.y,
      3,
      f.pos.x,
      f.pos.y,
      PELLET_RADIUS * (1.2 + 0.2 * pulse),
    );
    g.addColorStop(0, pelletColor);
    g.addColorStop(1, glowColor);

    ctx.fillStyle = g;
    circle(ctx, f.pos, PELLET_RADIUS);
    ctx.fill();

    ctx.strokeStyle = `hsla(${pelletHue}, 90%, 60%, ${(0.3 + 0.2 * pulse) * fadeAlpha})`;
    circle(ctx, f.pos, PELLET_RADIUS);
    ctx.stroke();
  }

  for (const p of state.pops) {
    if (!p.active) continue;
    const t = p.timer / POP_DURATION;
    ctx.fillStyle = `rgba(255,220,100,${1 - t})`;
    circle(ctx, p.pos, PELLET_RADIUS * (1 + t * 2));
    ctx.fill();
  }

  // Visible length
  let visibleLen = state.length;
  if (state.cuttingTail) {
    const t = state.cutTimer / CUT_DURATION;
    const toRemove = Math.floor(
      (state.cutStartLen - state.cutFrom) * t + 0.0001,
    );
    visibleLen = Math.max(state.cutFrom, state.cutStartLen - toRemove);
  }

  for (let i = visibleLen - 1; i >= 0; i--) {
    const ft = i / Math.max(state.length - 1, 1);
    const r = TAIL_RADIUS + (HEAD_RADIUS - TAIL_RADIUS) * (1 - ft);
    const hue = (headHue + ft * 60) % 360;
    const sat = 80;
    const light = 50 + ft * 20;
    const color = `hsla(${hue}, ${sat}%, ${light}%, ${alpha(state, i)})`;

    drawWrappedCircle(state, state.positions[i], r, color);
  }

  // Eyes
  const off = { x: -state.dir.y * 4, y: state.dir.x * 4 };
  const base = {
    x: state.positions[0].x + state.dir.x * 6,
    y: state.positions[0].y + state.dir.y * 6,
  };
  drawWrappedCircle(
    state,
    { x: base.x + off.x, y: base.y + off.y },
    2.2,
    "white",
  );
  drawWrappedCircle(
    state,
    { x: base.x - off.x, y: base.y - off.y },
    2.2,
    "white",
  );

  // HUD
  ctx.fillStyle = "white";
  ctx.font = "24px monospace";
  ctx.fillText(`SCORE: ${state.score.toString().padStart(4, "0")}`, 12, 28);
  ctx.font = "18px monospace";
  ctx.fillStyle = "rgb(180,180,180)";
  ctx.fillText("Boost = Shift | 2 Fingers (Mobile)", 12, canvas.height - 12);
  if (state.cuttingTail) {
    ctx.fillStyle = "red";
    ctx.font = "22px monospace";
    ctx.fillText("TAIL CUT!", canvas.width / 2 - 58, 64);
  }
}

// Helpers
const circle = (ctx: CanvasRenderingContext2D, p: Vec2, r: number) => {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
};

const drawWrappedCircle = (s: GameState, p: Vec2, r: number, color: string) => {
  const W = s.canvas.width,
    H = s.canvas.height;
  s.ctx.fillStyle = color;
  for (const o of [
    { x: 0, y: 0 },
    { x: -W, y: 0 },
    { x: W, y: 0 },
    { x: 0, y: -H },
    { x: 0, y: H },
  ]) {
    const x = p.x + o.x,
      y = p.y + o.y;
    if (x >= -r && x <= W + r && y >= -r && y <= H + r) {
      circle(s.ctx, { x, y }, r);
      s.ctx.fill();
    }
  }
};

const wrap = (x: number, W: number) => ((x % W) + W) % W;
const norm = (v: Vec2) => {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-4 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
};
const toroidalDelta = (a: Vec2, b: Vec2, c: HTMLCanvasElement): Vec2 => {
  let dx = b.x - a.x,
    dy = b.y - a.y;
  if (dx > c.width / 2) dx -= c.width;
  if (dx < -c.width / 2) dx += c.width;
  if (dy > c.height / 2) dy -= c.height;
  if (dy < -c.height / 2) dy += c.height;
  return { x: dx, y: dy };
};
const randomPos = (c: HTMLCanvasElement) => ({
  x: 20 + Math.random() * (c.width - 40),
  y: 20 + Math.random() * (c.height - 40),
});
const spawnPellet = (s: GameState, n: number) => {
  for (const f of s.pellets)
    if (!f.active && n-- > 0)
      Object.assign(f, {
        pos: randomPos(s.canvas),
        active: true,
        fadeInTimer: 0,
      });
  while (n-- > 0)
    s.pellets.push({ pos: randomPos(s.canvas), active: true, fadeInTimer: 0 });
};
const spawnPop = (s: GameState, pos: Vec2) =>
  s.pops.push({ pos, timer: 0, active: true });
const alpha = (s: GameState, i: number) => {
  if (!s.cuttingTail || i < s.cutFrom) return 1;
  const t = s.cutTimer / CUT_DURATION;
  const span = (i - s.cutFrom + 1) / (s.cutStartLen - s.cutFrom + 1);
  return Math.max(0, 1 - t * span);
};

// Main loop
export function runSnake(canvas: HTMLCanvasElement) {
  const state = init(canvas);

  const safeModeCheckbox = document.getElementById("safe-mode-checkbox");
  safeModeCheckbox?.addEventListener("change", (e) => {
    if (e.target instanceof HTMLInputElement) {
      state.safeMode = e.target.checked;
    }
  });

  let last = performance.now();
  const loop = (t: number) => {
    const dt = (t - last) / 1000;
    last = t;
    update(state, dt);
    draw(state);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
