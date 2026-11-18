import { W, makePeg, type Peg } from "./physics";

export type BoardDef = { name: string; build: () => Peg[] };

const CX = W / 2;
const TOP = 200;
const BOTTOM = 800;
const SIDE = 38;
const MIN_GAP = 40;

const dot = (x: number, y: number) => makePeg(x, y, x, y, 10);

function brick(x: number, y: number, angle: number, length = 30) {
  const dx = (Math.cos(angle) * length) / 2;
  const dy = (Math.sin(angle) * length) / 2;
  return makePeg(x - dx, y - dy, x + dx, y + dy, 7);
}

/** Drop pegs that fall outside the play area or crowd an earlier peg. */
function tidy(pegs: Peg[]): Peg[] {
  const kept: Peg[] = [];
  for (const p of pegs) {
    if (p.cx < SIDE || p.cx > W - SIDE || p.cy < TOP || p.cy > BOTTOM) continue;
    if (kept.some((q) => Math.hypot(q.cx - p.cx, q.cy - p.cy) < MIN_GAP))
      continue;
    kept.push(p);
  }
  return kept;
}

/** Staggered rows of dots, kept where `keep` says so. */
function lattice(
  keep: (x: number, y: number) => boolean,
  dx = 62,
  dy = 56,
): Peg[] {
  const pegs: Peg[] = [];
  let row = 0;
  for (let y = TOP + 20; y <= BOTTOM; y += dy, row++) {
    const offset = row % 2 ? dx / 2 : 0;
    for (let x = CX - dx * 6 + offset; x <= W; x += dx)
      if (keep(x, y)) pegs.push(dot(x, y));
  }
  return pegs;
}

function ring(
  cx: number,
  cy: number,
  radius: number,
  count: number,
  phase = 0,
) {
  return Array.from({ length: count }, (_, i) => {
    const a = phase + (i / count) * Math.PI * 2;
    return dot(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  });
}

/** Bricks laid along the upper part of a circle, with gaps a ball fits through. */
function arch(
  cx: number,
  cy: number,
  radius: number,
  from: number,
  to: number,
) {
  const count = Math.max(2, Math.round((radius * (to - from)) / 62));
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / count;
    return brick(
      cx + Math.cos(a) * radius,
      cy + Math.sin(a) * radius,
      a + Math.PI / 2,
    );
  });
}

export const BOARDS: BoardDef[] = [
  {
    name: "Lattice",
    build: () => tidy(lattice(() => true)),
  },
  {
    name: "Rings",
    build: () =>
      tidy([
        dot(CX, 500),
        ...ring(CX, 500, 84, 10, 0.3),
        ...ring(CX, 500, 168, 20),
        ...ring(CX, 500, 252, 30, 0.1),
        ...ring(CX, 500, 336, 40),
      ]),
  },
  {
    name: "Waves",
    build: () => {
      const pegs: Peg[] = [];
      for (let row = 0; row < 7; row++)
        for (let x = SIDE + 12; x < W - SIDE; x += 50)
          pegs.push(dot(x, 250 + row * 84 + Math.sin(x / 70 + row * 1.3) * 26));
      return tidy(pegs);
    },
  },
  {
    name: "Arches",
    build: () =>
      tidy([
        ...arch(CX, 520, 290, Math.PI * 1.1, Math.PI * 1.9),
        ...arch(CX, 520, 200, Math.PI * 1.12, Math.PI * 1.88),
        ...arch(CX, 520, 110, Math.PI * 1.15, Math.PI * 1.85),
        ...lattice((_, y) => y > 560, 62, 58),
      ]),
  },
  {
    name: "Diamond",
    build: () =>
      tidy(
        lattice(
          (x, y) => Math.abs(x - CX) / 330 + Math.abs(y - 500) / 310 <= 1,
          52,
          46,
        ),
      ),
  },
  {
    name: "Spiral",
    build: () => {
      const pegs: Peg[] = [dot(CX, 500)];
      for (let arm = 0; arm < 2; arm++) {
        let a = 0;
        for (let r = 60; r < 360; ) {
          const angle = a + arm * Math.PI;
          pegs.push(dot(CX + Math.cos(angle) * r, 500 + Math.sin(angle) * r));
          // Step a fixed arc length so pegs stay evenly spaced as r grows.
          const da = 60 / r;
          a += da;
          r += (120 / (Math.PI * 2)) * da;
        }
      }
      return tidy(pegs);
    },
  },
  {
    name: "Hourglass",
    build: () =>
      tidy(
        lattice((x, y) => Math.abs(x - CX) <= 44 + Math.abs(y - 500) * 1.02),
      ),
  },
  {
    name: "Chevrons",
    build: () => {
      const pegs: Peg[] = [];
      let row = 0;
      for (let y = TOP + 30; y <= BOTTOM; y += 66, row++) {
        const offset = row % 2 ? 37 : 0;
        for (let x = SIDE + 20 + offset; x < W - SIDE; x += 74) {
          const tilt = (x < CX ? -1 : 1) * (row % 2 ? 0.5 : 0.3);
          pegs.push(brick(x, y, tilt, 34));
        }
      }
      return tidy(pegs);
    },
  },
];
