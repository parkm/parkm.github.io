import type { Game } from "./game";
import {
  BALL_R,
  BARREL,
  BONUS,
  BUCKET_Y,
  CHARGE,
  H,
  LAUNCH_X,
  LAUNCH_Y,
  LIVE,
  type Peg,
  RIM_R,
  TARGET,
  W,
  bucketX,
} from "./physics";

export type View = {
  scale: number;
  ox: number;
  oy: number;
  dpr: number;
  width: number;
  height: number;
};

const TAU = Math.PI * 2;
const PAGE = "#0c0e16";

export const PEG_COLORS = [
  { base: "#43527a", lit: "#a9bcff" },
  { base: "#e8922e", lit: "#ffd98a" },
  { base: "#c44fd8", lit: "#f6b0ff" },
  { base: "#1fb592", lit: "#93ffe2" },
];

const GUIDE = "#ffffff";
const GUIDE_CATCH = "#7dffb0";
const FORESIGHT = "#7fe9ff";

function pegShape(ctx: CanvasRenderingContext2D, p: Peg, grow: number) {
  ctx.beginPath();
  if (p.len === 0) {
    ctx.arc(p.ax, p.ay, p.r + grow, 0, TAU);
    ctx.fill();
  } else {
    ctx.lineWidth = 2 * (p.r + grow);
    ctx.moveTo(p.ax, p.ay);
    ctx.lineTo(p.bx, p.by);
    ctx.stroke();
  }
}

/** A mark inside each special peg so kinds don't rely on color alone. */
function pegMark(ctx: CanvasRenderingContext2D, p: Peg) {
  if (p.kind === TARGET) {
    ctx.fillStyle = "rgba(60, 24, 0, 0.55)";
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, 3.2, 0, TAU);
    ctx.fill();
  } else if (p.kind === BONUS) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.moveTo(p.cx, p.cy - 4.5);
    ctx.lineTo(p.cx + 4.5, p.cy);
    ctx.lineTo(p.cx, p.cy + 4.5);
    ctx.lineTo(p.cx - 4.5, p.cy);
    ctx.fill();
  } else if (p.kind === CHARGE) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.cx - 4, p.cy);
    ctx.lineTo(p.cx + 4, p.cy);
    ctx.moveTo(p.cx, p.cy - 4);
    ctx.lineTo(p.cx, p.cy + 4);
    ctx.stroke();
  }
}

function drawPegs(ctx: CanvasRenderingContext2D, g: Game) {
  const { pegs } = g.board;
  ctx.lineCap = "round";
  for (let i = 0; i < pegs.length; i++) {
    if (!g.sim.alive[i]) continue;
    const p = pegs[i];
    const colors = PEG_COLORS[p.kind];
    const flash = g.flash[i];
    if (g.sim.lit[i]) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = ctx.strokeStyle = colors.lit;
      pegShape(ctx, p, 6 + flash * 4);
      ctx.globalAlpha = 1;
      pegShape(ctx, p, flash * 2.5);
    } else {
      ctx.fillStyle = ctx.strokeStyle = colors.base;
      pegShape(ctx, p, 0);
      if (p.len === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
        ctx.beginPath();
        ctx.arc(p.ax - 3, p.ay - 3, 3, 0, TAU);
        ctx.fill();
      }
    }
    pegMark(ctx, p);
  }
  ctx.lineCap = "butt";
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  path: number[],
  color: string,
  time: number,
) {
  // Walk the polyline and drop a dot every `gap` units, drifting forward.
  const gap = 16;
  let carry = (time * 40) % gap;
  let travelled = 0;
  ctx.fillStyle = color;
  for (let i = 2; i < path.length; i += 2) {
    const x0 = path[i - 2];
    const y0 = path[i - 1];
    const dx = path[i] - x0;
    const dy = path[i + 1] - y0;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    while (carry <= len) {
      ctx.globalAlpha = Math.max(0.18, 0.9 - (travelled + carry) / 900);
      ctx.beginPath();
      ctx.arc(x0 + (dx * carry) / len, y0 + (dy * carry) / len, 2.4, 0, TAU);
      ctx.fill();
      carry += gap;
    }
    carry -= len;
    travelled += len;
  }
  ctx.globalAlpha = 1;
}

function drawGuides(ctx: CanvasRenderingContext2D, g: Game) {
  if (g.phase === "scan" && g.scan) {
    const a = g.scan.cursor;
    ctx.strokeStyle = FORESIGHT;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(LAUNCH_X, LAUNCH_Y);
    ctx.lineTo(LAUNCH_X + Math.sin(a) * 1200, LAUNCH_Y + Math.cos(a) * 1200);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  if (g.phase !== "aim") return;

  if (g.locked) {
    // Green while firing now would end in the bucket.
    ctx.strokeStyle = g.guideCatches ? GUIDE_CATCH : FORESIGHT;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    g.locked.paths.forEach((path, n) => {
      ctx.globalAlpha = n === 0 ? 0.85 : 0.5;
      ctx.beginPath();
      ctx.moveTo(path[0], path[1]);
      for (let i = 2; i < path.length; i += 2) ctx.lineTo(path[i], path[i + 1]);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    return;
  }

  if (g.guide)
    drawDots(
      ctx,
      g.guide.paths[0],
      g.guideCatches ? GUIDE_CATCH : GUIDE,
      g.time,
    );
}

function drawLockedPegs(ctx: CanvasRenderingContext2D, g: Game) {
  if (g.phase !== "aim" || !g.locked) return;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  const pulse = 3 + Math.sin(g.time * 6) * 1.5;
  for (const i of g.locked.lit) {
    const p = g.board.pegs[i];
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, p.r + p.len / 2 + pulse, 0, TAU);
    ctx.stroke();
  }
}

function drawBalls(ctx: CanvasRenderingContext2D, g: Game) {
  g.sim.balls.forEach((ball, n) => {
    const trail = g.trails[n];
    if (trail) {
      for (let i = 0; i < trail.length; i += 2) {
        const f = (i + 2) / trail.length;
        ctx.globalAlpha = f * 0.3;
        ctx.fillStyle = "#cfe0ff";
        ctx.beginPath();
        ctx.arc(trail[i], trail[i + 1], BALL_R * (0.4 + f * 0.5), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (ball.state !== LIVE) return;
    drawBall(ctx, ball.x, ball.y, BALL_R);
  });
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.fillStyle = "#e9eef7";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU);
  ctx.fill();
}

function drawBucket(ctx: CanvasRenderingContext2D, g: Game) {
  const { tune } = g.mods;
  const x = bucketX(g.sim.tick, tune);
  const half = tune.bucketW / 2;
  const glow = g.phase === "aim" && g.guideCatches;
  const color = glow ? GUIDE_CATCH : "#8fa3d9";

  ctx.beginPath();
  ctx.moveTo(x - half, BUCKET_Y);
  ctx.lineTo(x - half + 12, H);
  ctx.lineTo(x + half - 12, H);
  ctx.lineTo(x + half, BUCKET_Y);
  ctx.fillStyle = glow
    ? "rgba(125, 255, 176, 0.22)"
    : "rgba(143, 163, 217, 0.16)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = color;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + s * half, BUCKET_Y, RIM_R, 0, TAU);
    ctx.fill();
  }
}

function drawLauncher(ctx: CanvasRenderingContext2D, g: Game) {
  ctx.save();
  ctx.translate(LAUNCH_X, LAUNCH_Y);
  ctx.rotate(-g.angle);
  ctx.fillStyle = "#2b3352";
  ctx.strokeStyle = "#8fa3d9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-11, 0, 22, BARREL + 4, 5);
  ctx.fill();
  ctx.stroke();
  if (g.phase === "aim" || g.phase === "scan") drawBall(ctx, 0, BARREL, BALL_R);
  ctx.restore();

  ctx.fillStyle = "#1c2238";
  ctx.strokeStyle = g.locked ? FORESIGHT : "#8fa3d9";
  ctx.beginPath();
  ctx.arc(LAUNCH_X, LAUNCH_Y, 24, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

function drawStock(ctx: CanvasRenderingContext2D, g: Game) {
  const shown = Math.min(g.balls, 12);
  for (let i = 0; i < shown; i++) drawBall(ctx, 22 + i * 19, 24, 6.5);
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  if (g.balls > shown) {
    ctx.fillStyle = "#e9eef7";
    ctx.textAlign = "left";
    ctx.fillText(`+${g.balls - shown}`, 22 + shown * 19, 25);
  }

  ctx.fillStyle = FORESIGHT;
  for (let i = 0; i < Math.min(g.charges, 8); i++) {
    const x = W - 24 - i * 20;
    ctx.beginPath();
    ctx.moveTo(x, 15);
    ctx.lineTo(x + 7, 24);
    ctx.lineTo(x, 33);
    ctx.lineTo(x - 7, 24);
    ctx.fill();
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, g: Game) {
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of g.popups) {
    ctx.globalAlpha = Math.min(1, p.life * 2.5);
    ctx.font = `700 ${p.size}px system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(8, 10, 18, 0.8)";
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawCaptions(ctx: CanvasRenderingContext2D, g: Game) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 17px system-ui, sans-serif";
  if (g.phase === "scan" && g.scan) {
    ctx.fillStyle = FORESIGHT;
    ctx.fillText(
      `Testing shots ${Math.round(g.scan.progress * 100)}%`,
      LAUNCH_X,
      140,
    );
  } else if (g.hint && g.phase === "aim" && !g.locked) {
    ctx.fillStyle = "rgba(233, 238, 247, 0.6)";
    ctx.fillText(g.hint, LAUNCH_X, 140);
  }
}

export function draw(ctx: CanvasRenderingContext2D, g: Game, view: View) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, view.width, view.height);

  const s = view.scale * view.dpr;
  ctx.setTransform(s, 0, 0, s, view.ox * view.dpr, view.oy * view.dpr);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 14);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1a1f35");
  bg.addColorStop(1, "#10131f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawGuides(ctx, g);
  drawPegs(ctx, g);
  drawLockedPegs(ctx, g);
  drawBalls(ctx, g);
  drawBucket(ctx, g);
  drawLauncher(ctx, g);
  drawStock(ctx, g);
  drawEffects(ctx, g);
  drawCaptions(ctx, g);
  ctx.restore();
}
