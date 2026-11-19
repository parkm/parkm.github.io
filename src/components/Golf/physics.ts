// Deterministic ball physics on a one-sided polyline terrain. The aim preview
// runs this same code, so it always agrees with the real shot.
//
// The ball is a solid sphere with spin. Every contact applies a normal impulse,
// Coulomb friction at the contact point (which trades sliding for spin) and
// rolling resistance, so bouncing, skidding, rolling and coming to rest on a
// slope all fall out of one rule instead of being separate modes.

export const STEP = 1 / 240;
export const BALL_R = 7;
export const GRAVITY = 900;
/** Launch speed at full power. */
export const MAX_SPEED = 760;
/** A shot is settled where it is after this many ticks (25 s). */
export const MAX_SHOT_TICKS = 240 * 25;

const SPEED_CAP = 1400;
/** Air drag: deceleration is DRAG * speed². */
const DRAG = 0.00012;
/** 1 / (I / m r²) for a solid sphere. */
const SPIN = 2.5;
/** Impacts slower than SOFT don't bounce; the bounce is full strength by FULL. */
const SOFT_IMPACT = 25;
const FULL_IMPACT = 115;
const REST_SPEED = 6;
const REST_TICKS = 30;
/** Slower than this into a surface is touching, not approaching. */
const EPS = 1e-7;

export const TURF = 0;
export const GREEN = 1;
export const SAND = 2;
export const CUP = 3;
export type Material = 0 | 1 | 2 | 3;

/**
 * bounce: restitution of a hard impact. grip: friction coefficient.
 * roll: rolling resistance; a ball stays put on slopes up to atan(1.4 * roll).
 */
const SURFACES = [
  { bounce: 0.34, grip: 0.7, roll: 0.2 },
  { bounce: 0.3, grip: 0.7, roll: 0.1 },
  { bounce: 0.04, grip: 1, roll: 0.9 },
  { bounce: 0.22, grip: 0.8, roll: 0.6 },
];

/** Solid ground is on the right-hand side when walking from a to b. */
export type Seg = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  len: number;
  mat: Material;
};

export type Pond = { x0: number; x1: number; y: number };

export type Terrain = {
  segs: Seg[];
  gridX: number;
  grid: number[][];
  /** Centre of the cup's mouth. */
  cupX: number;
  cupY: number;
  cupHalf: number;
  ponds: Pond[];
  /** The ball is out of bounds beyond these. */
  left: number;
  right: number;
};

export const MOVING = 0;
export const RESTING = 1;
export const HOLED = 2;
export const WET = 3;
export const OUT = 4;

export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Angular velocity, radians per second. */
  spin: number;
  angle: number;
  state: 0 | 1 | 2 | 3 | 4;
  /** Contacts so far this shot. */
  hits: number;
  ticks: number;
  /** Ticks since the last contact. */
  air: number;
  still: number;
};

export type BallEvent = {
  type: "bounce" | "splash" | "out" | "holed";
  x: number;
  y: number;
  speed: number;
  mat: Material;
};

const CELL = 16;
const REACH = BALL_R + SPEED_CAP * STEP + 1;

/**
 * `mats[i]` is the surface between point i and point i + 1. Points run left to
 * right; vertical drops and rises (the cup walls) are allowed, overhangs aren't.
 */
export function buildTerrain(
  xs: number[],
  ys: number[],
  mats: Material[],
  cup: { x: number; y: number; half: number },
  ponds: Pond[],
  left: number,
  right: number,
): Terrain {
  const segs: Seg[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const dx = xs[i + 1] - xs[i];
    const dy = ys[i + 1] - ys[i];
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    segs.push({
      ax: xs[i],
      ay: ys[i],
      bx: xs[i + 1],
      by: ys[i + 1],
      ux,
      uy,
      nx: uy,
      ny: -ux,
      len,
      mat: mats[i],
    });
  }

  const gridX = xs[0];
  const cells = Math.ceil((xs[xs.length - 1] - gridX) / CELL) + 1;
  const grid: number[][] = Array.from({ length: cells }, () => []);
  segs.forEach((s, i) => {
    const c0 = Math.max(0, Math.floor((s.ax - REACH - gridX) / CELL));
    const c1 = Math.min(cells - 1, Math.floor((s.bx + REACH - gridX) / CELL));
    for (let c = c0; c <= c1; c++) grid[c].push(i);
  });

  return {
    segs,
    gridX,
    grid,
    cupX: cup.x,
    cupY: cup.y,
    cupHalf: cup.half,
    ponds,
    left,
    right,
  };
}

export function restingBall(x: number, y: number): Ball {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    spin: 0,
    angle: 0,
    state: RESTING,
    hits: 0,
    ticks: 0,
    air: 0,
    still: 0,
  };
}

/** `dx, dy` is a unit direction; `power` runs 0 to 1. */
export function launch(ball: Ball, dx: number, dy: number, power: number) {
  const speed = MAX_SPEED * Math.max(0, Math.min(1, power));
  ball.vx = dx * speed;
  ball.vy = dy * speed;
  ball.spin = 0;
  ball.state = MOVING;
  ball.hits = 0;
  ball.ticks = 0;
  ball.air = 0;
  ball.still = 0;
}

// Sweep results come back through these to keep the hot loop allocation-free.
let outNx = 0;
let outNy = 0;
let outDepth = 0;

/** Time at which the ball's centre comes within BALL_R of a point, or -1. */
function sweepPoint(
  px: number,
  py: number,
  vx: number,
  vy: number,
  cx: number,
  cy: number,
  maxT: number,
): number {
  const dx = px - cx;
  const dy = py - cy;
  const b = dx * vx + dy * vy;
  if (b > -EPS) return -1;
  const c = dx * dx + dy * dy - BALL_R * BALL_R;
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
  const d = Math.hypot(hx, hy);
  if (d < 1e-9) return -1;
  outNx = hx / d;
  outNy = hy / d;
  outDepth = c < 0 ? BALL_R - d : 0;
  return t;
}

/** Time at which the ball lands on the open face of a segment, or -1. */
function sweepFace(
  px: number,
  py: number,
  vx: number,
  vy: number,
  s: Seg,
  maxT: number,
): number {
  const vn = vx * s.nx + vy * s.ny;
  if (vn > -EPS) return -1;
  const rx = px - s.ax;
  const ry = py - s.ay;
  const height = rx * s.nx + ry * s.ny;
  if (height < -BALL_R) return -1;
  const t = height > BALL_R ? (height - BALL_R) / -vn : 0;
  if (t > maxT) return -1;
  const along = (rx + vx * t) * s.ux + (ry + vy * t) * s.uy;
  if (along < 0 || along > s.len) return -1;
  outNx = s.nx;
  outNy = s.ny;
  outDepth = height < BALL_R ? BALL_R - height : 0;
  return t;
}

function collide(
  ball: Ball,
  nx: number,
  ny: number,
  mat: Material,
  out: BallEvent[] | null,
) {
  const surface = SURFACES[mat];
  const impact = -(ball.vx * nx + ball.vy * ny);
  const hard = Math.max(
    0,
    Math.min(1, (impact - SOFT_IMPACT) / (FULL_IMPACT - SOFT_IMPACT)),
  );
  const jn = (1 + surface.bounce * hard) * impact;

  // Friction acts on the velocity of the ball's surface at the contact point.
  const tx = ny;
  const ty = -nx;
  const slip = ball.vx * tx + ball.vy * ty + ball.spin * BALL_R;
  const maxJt = surface.grip * jn;
  const jt = Math.max(-maxJt, Math.min(maxJt, -slip / (1 + SPIN)));

  ball.vx += jn * nx + jt * tx;
  ball.vy += jn * ny + jt * ty;
  ball.spin += (jt * SPIN) / BALL_R;

  // Rolling resistance.
  const vt = ball.vx * tx + ball.vy * ty;
  const rolling = Math.abs(vt + ball.spin * BALL_R) < 1;
  const loss = Math.min(Math.abs(vt), surface.roll * jn) * Math.sign(vt);
  ball.vx -= loss * tx;
  ball.vy -= loss * ty;
  if (rolling) ball.spin = -(vt - loss) / BALL_R;

  ball.hits++;
  ball.air = 0;
  if (out && impact > SOFT_IMPACT)
    out.push({ type: "bounce", x: ball.x, y: ball.y, speed: impact, mat });
}

/** Advance a moving ball one tick. */
export function stepBall(
  ball: Ball,
  terrain: Terrain,
  out: BallEvent[] | null = null,
) {
  if (ball.state !== MOVING) return;

  ball.vy += GRAVITY * STEP;
  const speed = Math.hypot(ball.vx, ball.vy);
  const keep =
    Math.min(1, SPEED_CAP / (speed || 1)) * (1 - DRAG * speed * STEP);
  ball.vx *= keep;
  ball.vy *= keep;
  ball.air++;

  const { segs, grid, gridX } = terrain;
  let remaining = STEP;
  for (let iter = 0; iter < 5 && remaining > 1e-9; iter++) {
    const { x, y, vx, vy } = ball;
    const cell = grid[Math.floor((x - gridX) / CELL)];
    let hitT = remaining;
    let hit = -1;
    let nx = 0;
    let ny = 0;
    let depth = 0;
    if (cell) {
      for (let k = 0; k < cell.length; k++) {
        const s = segs[cell[k]];
        let t = sweepFace(x, y, vx, vy, s, hitT);
        if (t >= 0 && (t < hitT || hit < 0)) {
          hitT = t;
          hit = cell[k];
          nx = outNx;
          ny = outNy;
          depth = outDepth;
        }
        t = sweepPoint(x, y, vx, vy, s.ax, s.ay, hitT);
        if (t >= 0 && (t < hitT || hit < 0)) {
          hitT = t;
          hit = cell[k];
          nx = outNx;
          ny = outNy;
          depth = outDepth;
        }
      }
    }

    ball.x = x + vx * hitT + nx * depth;
    ball.y = y + vy * hitT + ny * depth;
    remaining -= hitT;
    if (hit < 0) break;
    collide(ball, nx, ny, segs[hit].mat, out);
  }

  ball.angle += ball.spin * STEP;
  ball.ticks++;

  for (const pond of terrain.ponds) {
    if (ball.x > pond.x0 && ball.x < pond.x1 && ball.y > pond.y) {
      ball.state = WET;
      out?.push({
        type: "splash",
        x: ball.x,
        y: pond.y,
        speed: Math.hypot(ball.vx, ball.vy),
        mat: TURF,
      });
      return;
    }
  }
  if (
    ball.x < terrain.left ||
    ball.x > terrain.right ||
    ball.y > terrain.cupY + 2000
  ) {
    ball.state = OUT;
    out?.push({ type: "out", x: ball.x, y: ball.y, speed: 0, mat: TURF });
    return;
  }

  const slow =
    ball.air <= 2 &&
    ball.vx * ball.vx + ball.vy * ball.vy < REST_SPEED * REST_SPEED &&
    Math.abs(ball.spin * BALL_R) < REST_SPEED;
  ball.still = slow ? ball.still + 1 : 0;
  if (ball.still >= REST_TICKS || ball.ticks >= MAX_SHOT_TICKS) {
    ball.vx = ball.vy = ball.spin = 0;
    const inCup =
      Math.abs(ball.x - terrain.cupX) < terrain.cupHalf &&
      ball.y > terrain.cupY;
    ball.state = inCup ? HOLED : RESTING;
    if (inCup)
      out?.push({ type: "holed", x: ball.x, y: ball.y, speed: 0, mat: CUP });
  }
}

/**
 * The path a shot would fly from where the ball lies, as a flat
 * [x0, y0, x1, y1, ...] polyline. Stops at the first contact or after
 * `maxTicks`.
 */
export function traceFlight(
  from: Ball,
  terrain: Terrain,
  dx: number,
  dy: number,
  power: number,
  maxTicks: number,
): number[] {
  const ball = { ...from };
  launch(ball, dx, dy, power);
  const path = [ball.x, ball.y];
  while (ball.state === MOVING && ball.ticks < maxTicks && ball.hits === 0) {
    stepBall(ball, terrain);
    if (ball.ticks % 4 === 0 || ball.hits > 0) path.push(ball.x, ball.y);
  }
  return path;
}
