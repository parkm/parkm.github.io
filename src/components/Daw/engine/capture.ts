import { PPQ, type Tick } from "../model/time";

/**
 * MIDI Capture, after Ableton's: the app is always listening to what you
 * play, and Capture turns the phrase you just played into a loop.
 *
 * - In an empty, stopped project it also detects the tempo (80–160 BPM),
 *   treating your first note as the downbeat.
 * - Otherwise the tempo is kept. While playing, notes keep the bar positions
 *   you played them at. While stopped, the first note becomes the downbeat
 *   and the tempo you played at is detected and conformed onto the
 *   project's tempo, so the phrase lands on the beat.
 * - Loops are whole bars, rounded up to 1, 2, 4, 8 or 16. End your phrase on
 *   the next downbeat to mark the loop end exactly; that closing note isn't
 *   kept (it's the loop's start, played again).
 * - A single note sets the loop to its own length (1, 2, 4 or 8 bars).
 *
 * These functions are pure so they can be tested against simulated playing.
 */

export type CapturedNote = {
  pitch: number;
  velocity: number;
  /** Start and end in ticks (absolute or relative, see callers). */
  on: Tick;
  off: Tick;
};

export type Phrase = {
  /** Where the loop starts, in the same tick domain as the input notes. */
  start: Tick;
  length: Tick;
  /**
   * Whole bars of earlier playing kept before the loop (like Live's notes
   * before the start marker). The clip's loop starts at `lead`.
   */
  lead: Tick;
  /** Notes relative to `start - lead`: lead-in notes first, then the loop. */
  notes: { pitch: number; velocity: number; start: Tick; duration: Tick }[];
};

/** How much earlier playing Capture keeps before the loop. */
const MAX_LEAD_BARS = 16;

export const MIN_BPM = 80;
export const MAX_BPM = 160;
const MAX_BARS = 16;
/** How far from a bar line a closing note may land and still count as "on the downbeat". */
const CLOSING_SLOP = PPQ / 8;
const MIN_DURATION = PPQ / 32;

const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

/**
 * Fit a loop around notes on a known bar grid. The loop ends at the bar
 * after the last note (or exactly at a closing downbeat) and reaches back a
 * power-of-two number of bars.
 */
export function buildPhrase(
  input: CapturedNote[],
  bar: Tick,
  forcedBars?: number,
): Phrase | null {
  const notes = [...input].sort((a, b) => a.on - b.on);
  if (notes.length === 0) return null;
  // The phrase is what you played after your last pause of a bar and a half
  // or more (if that's at least two notes); anything before becomes the
  // lead-in. Sparse parts (a note every bar) stay one phrase.
  let phraseFrom = 0;
  let latestOff = notes[0].off;
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].on - latestOff >= bar * 1.5 && notes.length - i >= 2) {
      phraseFrom = i;
    }
    latestOff = Math.max(latestOff, notes[i].off);
  }
  const phrase = notes.slice(phraseFrom);
  const first = phrase[0];
  const last = phrase[phrase.length - 1];
  // A first note played just ahead of a bar line is that bar's downbeat.
  const nextLine = Math.ceil(first.on / bar) * bar;
  const firstBar =
    nextLine - first.on <= CLOSING_SLOP
      ? nextLine
      : Math.floor(first.on / bar) * bar;

  let end = (Math.floor(last.on / bar) + 1) * bar;
  let closing: CapturedNote | null = null;
  if (phrase.length > 1) {
    const line = Math.round(last.on / bar) * bar;
    const spanBars = (line - firstBar) / bar;
    if (Math.abs(last.on - line) <= CLOSING_SLOP && isPow2(spanBars)) {
      end = line;
      closing = last;
    }
  }

  // The loop starts where the phrase starts (its first downbeat) and is
  // rounded up to 1, 2, 4, 8 or 16 bars. Longer playing keeps the last 16.
  const spanBars = Math.max(1, Math.ceil((end - firstBar) / bar));
  const bars = forcedBars ?? Math.min(MAX_BARS, nextPow2(spanBars));
  const length = bars * bar;
  let start = firstBar;
  if (spanBars > bars) start = end - length;
  else end = start + length;

  // Earlier playing is kept before the loop, in whole bars.
  const loopNotes = phrase.filter(
    (n) => n !== closing && n.on >= start - CLOSING_SLOP && n.on < end,
  );
  const earlier = notes.filter(
    (n) =>
      !loopNotes.includes(n) &&
      n !== closing &&
      n.on < start &&
      n.on >= start - MAX_LEAD_BARS * bar,
  );
  const lead = earlier.length
    ? Math.ceil((start - Math.min(...earlier.map((n) => n.on))) / bar) * bar
    : 0;
  const origin = start - lead;

  return {
    start,
    length,
    lead,
    notes: [...earlier, ...loopNotes].map((n) => ({
      pitch: n.pitch,
      velocity: n.velocity,
      // A note played a hair early for the first downbeat belongs at the loop start.
      start: loopNotes.includes(n)
        ? Math.max(lead, n.on - origin)
        : n.on - origin,
      duration: Math.max(MIN_DURATION, n.off - n.on),
    })),
  };
}

export type TempoGuess = { bpm: number; bars?: number };

/**
 * Guess the tempo from note-on times (seconds, first note = downbeat).
 *
 * Every tempo in range is scored by how closely the notes sit on a 16th-note
 * grid. A phrase that ends on a downbeat after 1, 2, 4 or 8 bars is the
 * strongest hint, so those tempos are tried exactly and favoured. The winner
 * is refined by least squares against the grid positions.
 */
export function detectTempo(
  onsets: number[],
  durations: number[],
  beatsPerBar: number,
  /**
   * The project's tempo, when conforming to it: the search then covers
   * ±50% around it and leans toward it instead of toward 120.
   */
  prefer?: number,
): TempoGuess {
  const lo = prefer ? prefer / 1.5 : MIN_BPM;
  const hi = prefer ? prefer * 1.5 : MAX_BPM;
  const centre = prefer ?? 120;
  const t0 = onsets[0];
  const times = onsets.map((t) => t - t0);

  if (times.length === 1) {
    // Single note: its length is the loop; pick the bar count that puts the tempo in range, nearest the centre.
    const d = durations[0];
    let best: TempoGuess = { bpm: 120, bars: 1 };
    let bestDist = Infinity;
    for (const bars of [1, 2, 4, 8]) {
      const bpm = (60 * bars * beatsPerBar) / d;
      const dist =
        bpm < lo
          ? lo - bpm + 1000
          : bpm > hi
            ? bpm - hi + 1000
            : Math.abs(bpm - centre);
      if (dist < bestDist) {
        bestDist = dist;
        best = { bpm, bars };
      }
    }
    return {
      bpm: Math.min(hi, Math.max(lo, best.bpm)),
      bars: best.bars,
    };
  }

  // Mean squared distance from the 16th grid, in 16ths (0 = perfect, 0.083 = random).
  const gridError = (spb: number, ts: number[]) => {
    const sixteenth = spb / 4;
    let err = 0;
    for (const t of ts) {
      const x = t / sixteenth;
      err += (x - Math.round(x)) ** 2;
    }
    return err / ts.length;
  };

  // Evenly spaced notes fit many tempos perfectly (quarters at 90 are dotted
  // 8ths at 112.5), so prefer readings that use common note values.
  const gaps = times
    .slice(1)
    .map((t, i) => t - times[i])
    .filter((g) => g > 0.03);
  const complexity = (spb: number) => {
    if (gaps.length === 0) return 0;
    let cost = 0;
    for (const g of gaps) {
      const k = Math.round(g / (spb / 4));
      cost += [1, 2, 4, 8, 16, 32].includes(k)
        ? 0
        : [3, 6, 12, 24].includes(k)
          ? 0.5
          : 1;
    }
    return cost / gaps.length;
  };

  type Candidate = { spb: number; score: number; bars?: number };
  const candidates: Candidate[] = [];
  const minSpb = 60 / hi;
  const maxSpb = 60 / lo;
  for (let i = 0; i <= 800; i++) {
    const spb = minSpb * (maxSpb / minSpb) ** (i / 800);
    candidates.push({ spb, score: gridError(spb, times) });
  }
  // Closing-downbeat hypotheses: the last note lands exactly N bars after the first.
  const span = times[times.length - 1];
  for (const bars of [1, 2, 4, 8]) {
    const spb = span / (bars * beatsPerBar);
    if (spb < minSpb || spb > maxSpb) continue;
    const body = times.slice(0, -1);
    candidates.push({ spb, score: gridError(spb, body), bars });
  }
  // Best grid fit, then simple note values, then a phrase that closes on a
  // downbeat; near-ties lean toward 120 BPM.
  const weight = (c: Candidate) =>
    c.score +
    0.03 * complexity(c.spb) -
    (c.bars && c.score < 0.01 ? 0.05 : 0) +
    0.002 * Math.abs(Math.log2(60 / c.spb / centre));
  const best = candidates.reduce((a, b) => (weight(b) < weight(a) ? b : a));

  // Refine: snap each note to its nearest 16th and fit the spacing through the downbeat.
  let num = 0;
  let den = 0;
  for (const t of times) {
    const k = Math.round(t / (best.spb / 4));
    num += t * k;
    den += k * k;
  }
  const sixteenth = den > 0 ? num / den : best.spb / 4;
  const bpm = Math.min(hi, Math.max(lo, 60 / (sixteenth * 4)));
  return { bpm: Math.round(bpm * 100) / 100, bars: best.bars };
}
