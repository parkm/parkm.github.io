// The course is one endless strip of ground with a pin every few hundred
// units. Hole n is played from pin n - 1 to pin n. Everything is generated from
// the hole number alone, so a given hole is always the same.

import {
  CUP,
  GREEN,
  type Material,
  type Pond,
  SAND,
  TURF,
  type Terrain,
  buildTerrain,
} from "./physics";

/** World units the camera always shows across and down. */
export const VIEW_W = 800;
export const VIEW_H = 450;
export const GREEN_HALF = 34;
export const CUP_HALF = 13;
export const CUP_DEPTH = 22;
/** Holes per round; the scenery changes with each round. */
export const ROUND = 18;

const SAMPLE = 6;
const START_Y = 300;
const START_GAP = 480;
const TOP = 120;
const BOTTOM = 420;
const TAU = Math.PI * 2;

export type Pin = { x: number; y: number };
export type Span = { x0: number; x1: number };

type Section = {
  xs: number[];
  ys: number[];
  /** One per gap between points. */
  mats: Material[];
  ponds: Pond[];
  bunkers: Span[];
};

export type Hole = {
  n: number;
  tee: Pin;
  cup: Pin;
  /** Where the camera sits for this hole. */
  camX: number;
  terrain: Terrain;
  /** The ground outline, for drawing. */
  xs: number[];
  ys: number[];
  pins: Pin[];
  ponds: Pond[];
  bunkers: Span[];
};

function random(n: number, salt: number) {
  let a =
    (Math.imul(n + 0x7f4a7c15, 0x9e3779b1) ^
      Math.imul(salt + 1, 0x85ebca6b)) >>>
    0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const smooth = (v: number) => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};
const smoother = (v: number) => {
  const t = clamp(v, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
/** 0 to 1 over the first 54 holes. */
const difficulty = (n: number) => clamp(n / 54, 0, 1);

const pins: Pin[] = [{ x: 0, y: START_Y }];

/** Pins at and before 0 are flat ground behind the first tee. */
export function pin(n: number): Pin {
  if (n <= 0) return { x: n * START_GAP, y: START_Y };
  for (let i = pins.length; i <= n; i++) {
    const r = random(i, 0);
    const prev = pins[i - 1];
    const swing = 40 + 100 * difficulty(i);
    pins.push({
      x: prev.x + 380 + r() * 200,
      y: clamp(prev.y + (r() * 2 - 1) * swing, 215, 365),
    });
  }
  return pins[n];
}

const sections = new Map<number, Section>();

function section(n: number): Section {
  let s = sections.get(n);
  if (!s) {
    if (sections.size > 24) sections.clear();
    s = buildSection(n);
    sections.set(n, s);
  }
  return s;
}

function buildSection(n: number): Section {
  const a = pin(n - 1);
  const b = pin(n);
  const r = random(n, 1);
  const hard = difficulty(n);
  const count = Math.round((b.x - a.x) / SAMPLE);
  const dx = (b.x - a.x) / count;
  // The ground is flat for GREEN_HALF either side of a pin.
  const x0 = a.x + GREEN_HALF;
  const x1 = b.x - GREEN_HALF;
  const span = x1 - x0;

  const xs: number[] = [];
  const base: number[] = [];
  const hills: number[] = [];
  const rough = n <= 0 ? 0.25 : 0.35 + 0.85 * r();
  const waves = [0, 1, 2].map(() => {
    const freq = 0.8 + r() * 3;
    return {
      freq,
      phase: r() * TAU,
      amp: ((20 + 70 * hard) * rough * (0.5 + r() * 0.8)) / freq ** 0.7,
    };
  });
  const edge = 36 / span;
  for (let i = 0; i <= count; i++) {
    const x = a.x + i * dx;
    const u = clamp((x - x0) / span, 0, 1);
    let h = 0;
    for (const w of waves) h += w.amp * Math.sin(TAU * w.freq * u + w.phase);
    xs.push(x);
    base.push(a.y + (b.y - a.y) * smoother(u));
    hills.push(h * smooth(u / edge) * smooth((1 - u) / edge));
  }

  // Flatten the hills until nothing is steeper than the hole number allows.
  const maxSlope = 0.8 + 0.9 * hard;
  let gain = 1;
  for (let pass = 0; pass < 3; pass++) {
    let steepest = 0;
    for (let i = 0; i < count; i++) {
      const rise = base[i + 1] - base[i] + gain * (hills[i + 1] - hills[i]);
      steepest = Math.max(steepest, Math.abs(rise) / dx);
    }
    if (steepest > maxSlope) gain *= maxSlope / steepest;
  }
  const ys = xs.map((_, i) => base[i] + gain * hills[i]);

  // A raised shelf or a sunken pit with steep sides.
  if (n >= 6 && r() < 0.12 + 0.3 * hard) {
    const height = (r() < 0.5 ? -1 : 1) * (28 + r() * (20 + 50 * hard));
    const width = 70 + r() * 110;
    const mid = x0 + span * (0.3 + r() * 0.4);
    const side = 14 + r() * 14;
    const l = mid - width / 2;
    const rt = mid + width / 2;
    if (l > x0 + 20 && rt < x1 - 20)
      for (let i = 0; i <= count; i++)
        ys[i] +=
          height *
          smooth((xs[i] - l) / side) *
          (1 - smooth((xs[i] - (rt - side)) / side));
  }
  for (let i = 0; i <= count; i++) ys[i] = clamp(ys[i], TOP, BOTTOM);

  /** Scoop out a hollow between l and rt. */
  const dig = (l: number, rt: number, depth: number) => {
    for (let i = 0; i <= count; i++) {
      const v = (xs[i] - l) / (rt - l);
      if (v > 0 && v < 1) ys[i] += depth * Math.sin(Math.PI * v) ** 2;
    }
  };

  const bunkers: Span[] = [];
  if (n >= 4 && r() < 0.3 + 0.2 * hard) {
    const width = 50 + r() * 70;
    const mid = x0 + span * (0.2 + r() * 0.65);
    const l = mid - width / 2;
    const rt = mid + width / 2;
    const depth = 6 + r() * 10;
    if (l > x0 + 10 && rt < x1 - 6) {
      dig(l, rt, depth);
      bunkers.push({ x0: l, x1: rt });
    }
  }

  const ponds: Pond[] = [];
  if (n >= 8 && r() < 0.18 + 0.27 * hard) {
    const width = 64 + r() * 80;
    const mid = x0 + span * (0.25 + r() * 0.5);
    const l = mid - width / 2;
    const rt = mid + width / 2;
    const depth = 26 + r() * 16;
    const clear = bunkers.every((s) => rt < s.x0 - 10 || l > s.x1 + 10);
    if (clear && l > x0 + 30 && rt < x1 - 30) {
      dig(l, rt, depth);
      const at = (x: number) => Math.round((x - a.x) / dx);
      // The surface sits just below the lower bank.
      const level = Math.max(ys[at(l)], ys[at(rt)]) + 5;
      let i0 = at(mid);
      let i1 = i0;
      if (ys[i0] > level + 8) {
        while (ys[i0 - 1] > level) i0--;
        while (ys[i1 + 1] > level) i1++;
        const cross = (wet: number, dry: number) =>
          xs[wet] +
          ((xs[dry] - xs[wet]) * (ys[wet] - level)) / (ys[wet] - ys[dry]);
        ponds.push({ x0: cross(i0, i0 - 1), x1: cross(i1, i1 + 1), y: level });
      }
    }
  }

  const mats: Material[] = [];
  for (let i = 0; i < count; i++) {
    const x = (xs[i] + xs[i + 1]) / 2;
    if (x < x0 || x > x1) mats.push(GREEN);
    else if (bunkers.some((s) => x > s.x0 && x < s.x1)) mats.push(SAND);
    else mats.push(TURF);
  }

  return { xs, ys, mats, ponds, bunkers };
}

/** The ground around hole n, with a cup cut at its pin. */
export function buildHole(n: number): Hole {
  const tee = pin(n - 1);
  const cup = pin(n);
  const first = n - 2;
  const last = n + 2;

  const lineX: number[] = [];
  const lineY: number[] = [];
  const lineMat: Material[] = [];
  const ponds: Pond[] = [];
  const bunkers: Span[] = [];
  const nearPins: Pin[] = [];
  for (let k = first; k <= last; k++) {
    const s = section(k);
    // A section's last point is the next one's first.
    const end = k === last ? s.xs.length : s.xs.length - 1;
    for (let i = 0; i < end; i++) {
      lineX.push(s.xs[i]);
      lineY.push(s.ys[i]);
      lineMat.push(s.mats[i] ?? TURF);
    }
    ponds.push(...s.ponds);
    bunkers.push(...s.bunkers);
    nearPins.push(pin(k));
  }

  const xs: number[] = [lineX[0] - 3000];
  const ys: number[] = [lineY[0]];
  const mats: Material[] = [TURF];
  let cut = false;
  for (let i = 0; i < lineX.length; i++) {
    const x = lineX[i];
    if (x > cup.x - CUP_HALF - 1 && x < cup.x + CUP_HALF + 1) {
      if (!cut) {
        cut = true;
        xs.push(cup.x - CUP_HALF, cup.x - CUP_HALF, cup.x + CUP_HALF);
        ys.push(cup.y, cup.y + CUP_DEPTH, cup.y + CUP_DEPTH);
        mats.push(CUP, CUP, CUP);
        xs.push(cup.x + CUP_HALF);
        ys.push(cup.y);
        mats.push(GREEN);
      }
      continue;
    }
    xs.push(x);
    ys.push(lineY[i]);
    mats.push(lineMat[i]);
  }
  xs.push(xs[xs.length - 1] + 3000);
  ys.push(ys[ys.length - 1]);
  mats.push(TURF);

  const camX = (tee.x + cup.x) / 2;
  const terrain = buildTerrain(
    xs,
    ys,
    mats,
    { x: cup.x, y: cup.y, half: CUP_HALF },
    ponds,
    camX - VIEW_W / 2 - 12,
    camX + VIEW_W / 2 + 12,
  );

  return { n, tee, cup, camX, terrain, xs, ys, pins: nearPins, ponds, bunkers };
}
