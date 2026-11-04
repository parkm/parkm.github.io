/** Ticks per quarter note. All document timing is stored in ticks. */
export const PPQ = 960;

export type Tick = number;
export type TimeSignature = [beats: number, unit: number];

export const ticksPerBeat = (ts: TimeSignature) => (PPQ * 4) / ts[1];
export const ticksPerBar = (ts: TimeSignature) => ticksPerBeat(ts) * ts[0];
export const secondsPerTick = (bpm: number) => 60 / (bpm * PPQ);

export const GRID_DIVISIONS = [
  { label: "1/8", ticks: PPQ / 2 },
  { label: "1/8T", ticks: PPQ / 3 },
  { label: "1/16", ticks: PPQ / 4 },
  { label: "1/16T", ticks: PPQ / 6 },
  { label: "1/32", ticks: PPQ / 8 },
] as const;

export const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * Swing as a warp of the tick timeline: the second 16th of every 8th is
 * pushed later. `amount` 0 is straight, 1 puts it 3/4 of the way through the
 * 8th (75% swing). The warp is monotonic, so off-grid notes move smoothly.
 */
const EIGHTH = PPQ / 2;
const SIXTEENTH = PPQ / 4;

export function swingTick(tick: Tick, amount: number): Tick {
  if (amount <= 0) return tick;
  const base = Math.floor(tick / EIGHTH) * EIGHTH;
  const p = tick - base;
  const mid = SIXTEENTH * (1 + amount);
  return p < SIXTEENTH
    ? base + (p * mid) / SIXTEENTH
    : base + mid + ((p - SIXTEENTH) * (EIGHTH - mid)) / (EIGHTH - SIXTEENTH);
}

export function unswingTick(tick: Tick, amount: number): Tick {
  if (amount <= 0) return tick;
  const base = Math.floor(tick / EIGHTH) * EIGHTH;
  const p = tick - base;
  const mid = SIXTEENTH * (1 + amount);
  return p < mid
    ? base + (p * SIXTEENTH) / mid
    : base + SIXTEENTH + ((p - mid) * (EIGHTH - SIXTEENTH)) / (EIGHTH - mid);
}

/** Swing amount 0..1 shown the way drum machines label it (50%..75%). */
export const swingPercent = (amount: number) => 50 + amount * 25;

/**
 * Bars.beats.sixteenths, like Live: positions count from 1 ("1.1.1" is the
 * clip's start), lengths from 0 ("1.0.0" is one bar). Ticks finer than a
 * sixteenth show as a fourth part.
 */
function units(ts: TimeSignature) {
  const beat = ticksPerBeat(ts);
  return { bar: ticksPerBar(ts), beat, six: Math.min(PPQ / 4, beat) };
}

export function formatBeatTime(
  tick: Tick,
  ts: TimeSignature,
  kind: "position" | "length",
): string {
  const u = units(ts);
  const t = Math.max(0, Math.round(tick));
  const o = kind === "position" ? 1 : 0;
  const parts = [
    Math.floor(t / u.bar) + o,
    Math.floor((t % u.bar) / u.beat) + o,
    Math.floor((t % u.beat) / u.six) + o,
  ];
  const rest = t % u.six;
  return (rest ? [...parts, rest] : parts).join(".");
}

/** Parses "bars.beats.sixteenths[.ticks]"; missing parts are the first one. Null if invalid. */
export function parseBeatTime(
  text: string,
  ts: TimeSignature,
  kind: "position" | "length",
): Tick | null {
  const parts = text.trim().split(/[.:\s]+/);
  if (!parts[0] || parts.length > 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const u = units(ts);
  const o = kind === "position" ? 1 : 0;
  const [bars, beats = o, sixes = o, ticks = 0] = nums;
  return Math.round(
    (bars - o) * u.bar + (beats - o) * u.beat + (sixes - o) * u.six + ticks,
  );
}

/** Tick size of each part of a bars.beats.sixteenths value. */
export const beatTimeSteps = (ts: TimeSignature) => {
  const u = units(ts);
  return [u.bar, u.beat, u.six] as const;
};
