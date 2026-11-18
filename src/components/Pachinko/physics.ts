// Deterministic peg-board physics. Everything that can change the outcome of a
// shot lives here, so the aim guide and the shot finder run the exact same code
// as the real ball and always agree with it.

export const W = 720;
export const H = 960;
export const STEP = 1 / 240;
export const LAUNCH_X = W / 2;
export const LAUNCH_Y = 40;
export const BARREL = 46;
export const MAX_AIM = 1.45;
export const BALL_R = 8;
export const BUCKET_Y = H - 40;
export const RIM_R = 6;
/** A shot is cut off after this many ticks (30 s). */
export const MAX_SHOT_TICKS = 240 * 30;

const MAX_SPEED = 1500;
const WALL_BOUNCE = 0.6;
/** Impacts slower than this are resting contact, not bounces. */
const IMPACT_SPEED = 20;
/**
 * A peg is removed mid-shot once the ball has rested on it for this many ticks,
 * which frees a ball that has come to a stop. A bounce counts as STUCK_BOUNCE
 * ticks, so a ball bouncing in place on one peg is freed too.
 */
const STUCK_TICKS = 240;
const STUCK_BOUNCE = 40;
const CATCH_DEPTH = 14;

const CELL = 48;
const GRID_W = Math.ceil(W / CELL);
const GRID_H = Math.ceil(H / CELL);
const REACH = BALL_R + MAX_SPEED * STEP + 1;

export const FILLER = 0;
export const TARGET = 1;
export const BONUS = 2;
export const CHARGE = 3;
export type PegKind = 0 | 1 | 2 | 3;

/** A capsule; a round peg is a capsule whose two ends coincide. */
export type Peg = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
  kind: PegKind;
  len: number;
  ux: number;
  uy: number;
  cx: number;
  cy: number;
};

export type Board = { pegs: Peg[]; grid: number[][] };

export type Tuning = {
  gravity: number;
  launchSpeed: number;
  restitution: number;
  bucketW: number;
  bucketRate: number;
  /** Every Nth peg hit in a shot lights its neighbours. 0 = off. */
  shockEvery: number;
  shockRadius: number;
  /** Lighting the bonus peg lights pegs within this distance. 0 = off. */
  chainRadius: number;
  /** Charge pegs split the ball. */
  split: boolean;
};

export const LIVE = 0;
export const CAUGHT = 1;
export const LOST = 2;
export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 0 | 1 | 2;
};

export type Sim = {
  /** Board clock. The bucket position is a pure function of it. */
  tick: number;
  shotTicks: number;
  balls: Ball[];
  alive: Uint8Array;
  lit: Uint8Array;
  contact: Uint16Array;
  /** Pegs in the order they were lit this shot. */
  order: number[];
  /** Pegs lit by the ball itself (not by a shockwave). */
  direct: number;
  bounces: number;
  caught: number;
};

export type SimEvent = {
  type: "hit" | "wall" | "rim" | "caught" | "lost" | "freed" | "shock";
  x: number;
  y: number;
  peg: number;
  speed: number;
};

export function makePeg(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  kind: PegKind = FILLER,
): Peg {
  const len = Math.hypot(bx - ax, by - ay);
  return {
    ax,
    ay,
    bx,
    by,
    r,
    kind,
    len,
    ux: len ? (bx - ax) / len : 1,
    uy: len ? (by - ay) / len : 0,
    cx: (ax + bx) / 2,
    cy: (ay + by) / 2,
  };
}

export function buildBoard(pegs: Peg[]): Board {
  const grid: number[][] = Array.from({ length: GRID_W * GRID_H }, () => []);
  pegs.forEach((p, i) => {
    const pad = p.r + REACH;
    const x0 = Math.max(0, Math.floor((Math.min(p.ax, p.bx) - pad) / CELL));
    const x1 = Math.min(
      GRID_W - 1,
      Math.floor((Math.max(p.ax, p.bx) + pad) / CELL),
    );
    const y0 = Math.max(0, Math.floor((Math.min(p.ay, p.by) - pad) / CELL));
    const y1 = Math.min(
      GRID_H - 1,
      Math.floor((Math.max(p.ay, p.by) + pad) / CELL),
    );
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) grid[y * GRID_W + x].push(i);
  });
  return { pegs, grid };
}

export function createSim(pegCount: number): Sim {
  return {
    tick: 0,
    shotTicks: 0,
    balls: [],
    alive: new Uint8Array(pegCount).fill(1),
    lit: new Uint8Array(pegCount),
    contact: new Uint16Array(pegCount),
    order: [],
    direct: 0,
    bounces: 0,
    caught: 0,
  };
}

export function bucketX(tick: number, tune: Tuning): number {
  const span = W / 2 - tune.bucketW / 2 - 10;
  return W / 2 + span * Math.sin(tick * STEP * tune.bucketRate);
}

export function launch(sim: Sim, tune: Tuning, angle: number) {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  sim.lit.fill(0);
  sim.contact.fill(0);
  sim.order.length = 0;
  sim.direct = 0;
  sim.bounces = 0;
  sim.caught = 0;
  sim.shotTicks = 0;
  sim.balls = [
    {
      x: LAUNCH_X + s * BARREL,
      y: LAUNCH_Y + c * BARREL,
      vx: s * tune.launchSpeed,
      vy: c * tune.launchSpeed,
      state: LIVE,
    },
  ];
}

// Sweep results are returned through these to keep the hot loop allocation-free.
let outNx = 0;
let outNy = 0;

/** Time at which a moving point first touches a circle, or -1. */
function sweepCircle(
  px: number,
  py: number,
  vx: number,
  vy: number,
  cx: number,
  cy: number,
  R: number,
  maxT: number,
): number {
  const dx = px - cx;
  const dy = py - cy;
  const b = dx * vx + dy * vy;
  if (b >= 0) return -1;
  const c = dx * dx + dy * dy - R * R;
  let t = 0;
  if (c > 0) {
    const a = vx * vx + vy * vy;
    const disc = b * b - a * c;
    if (disc < 0) return -1;
    t = (-b - Math.sqrt(disc)) / a;
    if (t > maxT) return -1;
  }
  const hx = dx + vx * t;
  const hy = dy + vy * t;
  const d = Math.hypot(hx, hy) || 1;
  outNx = hx / d;
  outNy = hy / d;
  return t;
}

function sweepPeg(
  px: number,
  py: number,
  vx: number,
  vy: number,
  p: Peg,
  R: number,
  maxT: number,
): number {
  if (p.len === 0) return sweepCircle(px, py, vx, vy, p.ax, p.ay, R, maxT);

  // Flat sides.
  const nx = -p.uy;
  const ny = p.ux;
  const rx = px - p.ax;
  const ry = py - p.ay;
  const s0 = rx * nx + ry * ny;
  const vn = vx * nx + vy * ny;
  const side = s0 >= 0 ? 1 : -1;
  if (vn * side < 0) {
    const t = Math.max(0, (side * R - s0) / vn);
    if (t <= maxT) {
      const along = (rx + vx * t) * p.ux + (ry + vy * t) * p.uy;
      if (along >= 0 && along <= p.len) {
        outNx = nx * side;
        outNy = ny * side;
        return t;
      }
    }
  }

  // Round ends.
  const ta = sweepCircle(px, py, vx, vy, p.ax, p.ay, R, maxT);
  const anx = outNx;
  const any = outNy;
  const tb = sweepCircle(px, py, vx, vy, p.bx, p.by, R, maxT);
  if (ta >= 0 && (tb < 0 || ta <= tb)) {
    outNx = anx;
    outNy = any;
    return ta;
  }
  return tb;
}

const HIT_NONE = -1;
const HIT_WALL = -2;
const HIT_RIM = -3;

function lightPeg(sim: Sim, board: Board, tune: Tuning, i: number, ball: Ball) {
  sim.lit[i] = 1;
  sim.order.push(i);
  sim.direct++;
  const peg = board.pegs[i];

  let blast = 0;
  if (tune.shockEvery > 0 && sim.direct % tune.shockEvery === 0)
    blast = tune.shockRadius;
  if (peg.kind === BONUS) blast = Math.max(blast, tune.chainRadius);
  if (blast > 0) {
    for (let j = 0; j < board.pegs.length; j++) {
      if (!sim.alive[j] || sim.lit[j]) continue;
      const q = board.pegs[j];
      const dx = q.cx - peg.cx;
      const dy = q.cy - peg.cy;
      if (dx * dx + dy * dy <= blast * blast) {
        sim.lit[j] = 1;
        sim.order.push(j);
      }
    }
  }

  if (tune.split && peg.kind === CHARGE) {
    // The twin leaves along the mirror image of the bounce.
    const vn = ball.vx * outNx + ball.vy * outNy;
    sim.balls.push({
      x: ball.x,
      y: ball.y,
      vx: 2 * vn * outNx - ball.vx,
      vy: 2 * vn * outNy - ball.vy,
      state: LIVE,
    });
  }
}

function stepBall(
  sim: Sim,
  board: Board,
  tune: Tuning,
  ball: Ball,
  out: SimEvent[] | null,
) {
  ball.vy += tune.gravity * STEP;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > MAX_SPEED) {
    ball.vx *= MAX_SPEED / speed;
    ball.vy *= MAX_SPEED / speed;
  }

  const bx = bucketX(sim.tick, tune);
  const half = tune.bucketW / 2;
  let remaining = STEP;

  for (let iter = 0; iter < 4 && remaining > 0; iter++) {
    const { x, y, vx, vy } = ball;
    let hitT = remaining;
    let hit = HIT_NONE;
    let nx = 0;
    let ny = 0;

    if (vx < 0) {
      const t = Math.max(0, (BALL_R - x) / vx);
      if (t < hitT) {
        hitT = t;
        hit = HIT_WALL;
        nx = 1;
        ny = 0;
      }
    } else if (vx > 0) {
      const t = Math.max(0, (W - BALL_R - x) / vx);
      if (t < hitT) {
        hitT = t;
        hit = HIT_WALL;
        nx = -1;
        ny = 0;
      }
    }
    if (vy < 0) {
      const t = Math.max(0, (BALL_R - y) / vy);
      if (t < hitT) {
        hitT = t;
        hit = HIT_WALL;
        nx = 0;
        ny = 1;
      }
    }

    const gx = Math.min(GRID_W - 1, Math.max(0, Math.floor(x / CELL)));
    const gy = Math.min(GRID_H - 1, Math.max(0, Math.floor(y / CELL)));
    const cell = board.grid[gy * GRID_W + gx];
    for (let k = 0; k < cell.length; k++) {
      const i = cell[k];
      if (!sim.alive[i]) continue;
      const p = board.pegs[i];
      const t = sweepPeg(x, y, vx, vy, p, p.r + BALL_R, hitT);
      if (t >= 0 && t < hitT) {
        hitT = t;
        hit = i;
        nx = outNx;
        ny = outNy;
      }
    }

    if (y > BUCKET_Y - 40) {
      for (let s = -1; s <= 1; s += 2) {
        const t = sweepCircle(
          x,
          y,
          vx,
          vy,
          bx + s * half,
          BUCKET_Y,
          RIM_R + BALL_R,
          hitT,
        );
        if (t >= 0 && t < hitT) {
          hitT = t;
          hit = HIT_RIM;
          nx = outNx;
          ny = outNy;
        }
      }
    }

    ball.x = x + vx * hitT;
    ball.y = y + vy * hitT;
    remaining -= hitT;
    if (hit === HIT_NONE) break;

    const vn = vx * nx + vy * ny;
    const e = hit === HIT_WALL ? WALL_BOUNCE : tune.restitution;
    ball.vx = vx - (1 + e) * vn * nx;
    ball.vy = vy - (1 + e) * vn * ny;
    const impact = -vn;
    if (impact > IMPACT_SPEED) sim.bounces++;

    if (hit >= 0) {
      if (out && impact > IMPACT_SPEED)
        out.push({
          type: "hit",
          x: ball.x,
          y: ball.y,
          peg: hit,
          speed: impact,
        });
      if (!sim.lit[hit]) {
        const before = sim.order.length;
        outNx = nx;
        outNy = ny;
        lightPeg(sim, board, tune, hit, ball);
        if (out && sim.order.length > before + 1)
          out.push({ type: "shock", x: ball.x, y: ball.y, peg: hit, speed: 0 });
      }
      sim.contact[hit] += impact > IMPACT_SPEED ? STUCK_BOUNCE : 1;
      if (sim.contact[hit] >= STUCK_TICKS) {
        sim.alive[hit] = 0;
        if (out)
          out.push({ type: "freed", x: ball.x, y: ball.y, peg: hit, speed: 0 });
      }
    } else if (out && impact > IMPACT_SPEED) {
      out.push({
        type: hit === HIT_WALL ? "wall" : "rim",
        x: ball.x,
        y: ball.y,
        peg: -1,
        speed: impact,
      });
    }
  }

  if (ball.y >= BUCKET_Y + CATCH_DEPTH && Math.abs(ball.x - bx) < half) {
    ball.state = CAUGHT;
    sim.caught++;
    if (out)
      out.push({ type: "caught", x: ball.x, y: ball.y, peg: -1, speed: 0 });
  } else if (ball.y > H + BALL_R) {
    ball.state = LOST;
    if (out)
      out.push({ type: "lost", x: ball.x, y: ball.y, peg: -1, speed: 0 });
  }
}

/** Advance one tick. Returns true while any ball is still in play. */
export function stepSim(
  sim: Sim,
  board: Board,
  tune: Tuning,
  out: SimEvent[] | null = null,
): boolean {
  let live = false;
  const timedOut = sim.shotTicks >= MAX_SHOT_TICKS;
  for (let i = 0; i < sim.balls.length; i++) {
    const ball = sim.balls[i];
    if (ball.state !== LIVE) continue;
    if (timedOut) {
      ball.state = LOST;
      continue;
    }
    stepBall(sim, board, tune, ball, out);
    if (ball.state === LIVE) live = true;
  }
  sim.tick++;
  sim.shotTicks++;
  return live;
}

// ---- what-if simulation ----------------------------------------------------

let scratch: Sim | null = null;

/** A throwaway copy of `src` with a ball launched at `angle`. Reused between calls. */
function fork(src: Sim, tune: Tuning, angle: number): Sim {
  if (!scratch || scratch.alive.length !== src.alive.length)
    scratch = createSim(src.alive.length);
  scratch.alive.set(src.alive);
  scratch.tick = src.tick;
  launch(scratch, tune, angle);
  return scratch;
}

/** Play a whole shot from the current board state without touching it. */
export function simulateShot(
  src: Sim,
  board: Board,
  tune: Tuning,
  angle: number,
): Sim {
  const sim = fork(src, tune, angle);
  while (stepSim(sim, board, tune)) {
    /* run to completion */
  }
  return sim;
}

export type Trace = {
  angle: number;
  /** One flat [x0, y0, x1, y1, ...] polyline per ball. */
  paths: number[][];
  lit: number[];
  caught: number;
};

/**
 * Record the path a shot would take, stopping after `maxBounces` bounces or
 * `maxLength` units of travel (pass Infinity for the whole shot).
 */
export function traceShot(
  src: Sim,
  board: Board,
  tune: Tuning,
  angle: number,
  maxBounces: number,
  maxLength: number,
): Trace {
  const sim = fork(src, tune, angle);
  const paths: number[][] = [[sim.balls[0].x, sim.balls[0].y]];
  const ended: boolean[] = [];
  let length = 0;
  let live = true;
  while (live) {
    const bouncesBefore = sim.bounces;
    live = stepSim(sim, board, tune);
    const corner = sim.bounces !== bouncesBefore;
    for (let i = 0; i < sim.balls.length; i++) {
      const ball = sim.balls[i];
      const path = (paths[i] ??= [ball.x, ball.y]);
      if (ended[i]) continue;
      if (ball.state !== LIVE) ended[i] = true;
      else if (!corner && sim.shotTicks % 3 !== 0) continue;
      const n = path.length;
      if (i === 0)
        length += Math.hypot(ball.x - path[n - 2], ball.y - path[n - 1]);
      path.push(ball.x, ball.y);
    }
    if (sim.bounces > maxBounces || length >= maxLength) break;
  }
  return { angle, paths, lit: sim.order.slice(), caught: sim.caught };
}
