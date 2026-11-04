/** Small building blocks shared by instruments. Everything takes a BaseAudioContext so it renders offline too. */

/** Exponential ramps can't reach 0; this is -80 dB. */
export const SILENT = 0.0001;

export const ms = (v: number) => v / 1000;

export const dbToGain = (db: number) => (db <= -60 ? 0 : 10 ** (db / 20));

/** Perceptual velocity curve. */
export const velocityGain = (v: number) => Math.max(0.01, v) ** 1.5;

/**
 * Note level for a velocity, with `amount` (0..1) of velocity sensitivity:
 * 0 plays every note at full level, 1 follows velocityGain fully.
 */
export const velocityAmp = (v: number, amount: number) =>
  1 - amount * (1 - velocityGain(v));

/** Linear attack, then exponential decay to silence. Returns the time it's silent. */
export function percEnv(
  param: AudioParam,
  t: number,
  peak: number,
  attack: number,
  decay: number,
) {
  const end = t + attack + decay;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(Math.max(peak, SILENT * 2), t + attack);
  param.exponentialRampToValueAtTime(SILENT, end);
  param.setValueAtTime(0, end);
  return end;
}

/** Smoothly move a parameter, or set it outright when the context isn't running yet. */
export function setParam(
  param: AudioParam,
  value: number,
  ctx: BaseAudioContext,
) {
  if (ctx.currentTime === 0) {
    param.value = value;
    return;
  }
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, 0.015);
}

// Seeded noise ---------------------------------------------------------------

export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of white noise, identical on every render. */
function noiseBuffer(ctx: BaseAudioContext) {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rand = mulberry32(0x5eed);
    for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** A looping noise source. The read offset is derived from `t`, so hits vary but renders stay deterministic. */
export function noise(ctx: BaseAudioContext, t: number, end: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.start(t, (t * 7.31) % 1);
  src.stop(end);
  return src;
}

export function osc(
  ctx: BaseAudioContext,
  type: OscillatorType,
  freq: number,
  t: number,
  end: number,
) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(t);
  o.stop(end);
  return o;
}

export function filter(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  freq: number,
  Q = Math.SQRT1_2,
) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = Q;
  return f;
}

export function gain(ctx: BaseAudioContext, value = 1) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

// Drive ----------------------------------------------------------------------

export const DRIVE_RANGE = 3;
export const DRIVE_CURVE = (() => {
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * DRIVE_RANGE) / Math.tanh(DRIVE_RANGE);
  }
  return curve;
})();

/**
 * tanh saturation. `amount` 0..1. Output is level-matched so a full-scale
 * input stays near full scale. Returns the input node and connects to `out`.
 */
export function drive(
  ctx: BaseAudioContext,
  amount: number,
  out: AudioNode,
): AudioNode {
  if (amount <= 0) return out;
  const k = 0.4 + amount * 4;
  const pre = gain(ctx, k / DRIVE_RANGE);
  const shaper = ctx.createWaveShaper();
  shaper.curve = DRIVE_CURVE;
  shaper.oversample = "4x";
  const post = gain(ctx, Math.tanh(DRIVE_RANGE) / Math.tanh(k));
  pre.connect(shaper).connect(post).connect(out);
  return pre;
}

// Stereo tools -----------------------------------------------------------------

/**
 * Balance pan, like a mixer's: turning towards one side lowers the other side
 * and leaves this one alone. (StereoPannerNode instead folds the far channel
 * into the near one, so panning a stereo sound made it up to 6 dB louder.)
 */
export type Balance = {
  input: AudioNode;
  output: AudioNode;
  set: (pan: number) => void;
};

export function createBalance(ctx: BaseAudioContext, pan: number): Balance {
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const left = ctx.createGain();
  const right = ctx.createGain();
  split.connect(left, 0).connect(merge, 0, 0);
  split.connect(right, 1).connect(merge, 0, 1);
  const gains = (p: number) => [
    p > 0 ? Math.cos((p * Math.PI) / 2) : 1,
    p < 0 ? Math.cos((-p * Math.PI) / 2) : 1,
  ];
  [left.gain.value, right.gain.value] = gains(pan);
  return {
    input: split,
    output: merge,
    set(p) {
      const [l, r] = gains(p);
      setParam(left.gain, l, ctx);
      setParam(right.gain, r, ctx);
    },
  };
}

/** A gain that always outputs stereo, so mono sources feed both sides. */
export function stereoGain(ctx: BaseAudioContext, value = 1) {
  const g = gain(ctx, value);
  g.channelCount = 2;
  g.channelCountMode = "explicit";
  g.channelInterpretation = "speakers";
  return g;
}

/**
 * Stereo width as a matrix: 0 is mono, 1 unchanged, 2 doubles the
 * difference between the sides. Mono content keeps its level at any width.
 */
export function createWidth(ctx: BaseAudioContext) {
  const input = stereoGain(ctx);
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const [ll, rr, lr, rl] = [gain(ctx), gain(ctx), gain(ctx, 0), gain(ctx, 0)];
  input.connect(split);
  split.connect(ll, 0).connect(merge, 0, 0);
  split.connect(rl, 1).connect(merge, 0, 0);
  split.connect(rr, 1).connect(merge, 0, 1);
  split.connect(lr, 0).connect(merge, 0, 1);
  return {
    input,
    output: merge as AudioNode,
    set(width: number) {
      // L' = L(1+w)/2 + R(1-w)/2, and the mirror for R'.
      for (const g of [ll, rr]) setParam(g.gain, (1 + width) / 2, ctx);
      for (const g of [lr, rl]) setParam(g.gain, (1 - width) / 2, ctx);
    },
  };
}

/** Q (in dB, as BiquadFilterNode reads it for low/high-pass) of a flat Butterworth stage. */
export const BUTTERWORTH_Q = -3.01;

/**
 * Linkwitz-Riley crossover (24 dB/oct): `low` and `high` add back up to the
 * input with a flat response, so the bands can be processed apart.
 */
export function createCrossover(ctx: BaseAudioContext, input: AudioNode) {
  const stage = (type: BiquadFilterType) => filter(ctx, type, 100);
  const lows = [stage("lowpass"), stage("lowpass")];
  const highs = [stage("highpass"), stage("highpass")];
  for (const f of [...lows, ...highs]) f.Q.value = BUTTERWORTH_Q;
  input.connect(lows[0]).connect(lows[1]);
  input.connect(highs[0]).connect(highs[1]);
  return {
    low: lows[1] as AudioNode,
    high: highs[1] as AudioNode,
    set(freq: number) {
      for (const f of [...lows, ...highs]) setParam(f.frequency, freq, ctx);
    },
  };
}

/**
 * What a crossover does to phase without splitting: its two bands summed.
 * Put on a dry path so it lines up with a band-split wet path.
 */
export function createCrossoverAllpass(ctx: BaseAudioContext) {
  const input = gain(ctx);
  const output = gain(ctx);
  const x = createCrossover(ctx, input);
  x.low.connect(output);
  x.high.connect(output);
  return { input: input as AudioNode, output: output as AudioNode, set: x.set };
}

/** A fixed delay as a node pair. */
export function createAlignDelay(ctx: BaseAudioContext, seconds: number) {
  const d = ctx.createDelay(Math.max(1, seconds * 2));
  d.delayTime.value = seconds;
  return d;
}

// Tempo-synced LFOs --------------------------------------------------------------

export const SYNC_DIVISIONS = [
  "4 bars",
  "2 bars",
  "1 bar",
  "1/2",
  "1/4",
  "1/8",
  "1/16",
  "1/32",
  "1/2T",
  "1/4T",
  "1/8T",
  "1/16T",
  "1/4D",
  "1/8D",
] as const;
const SYNC_BEATS = [
  16,
  8,
  4,
  2,
  1,
  0.5,
  0.25,
  0.125,
  4 / 3,
  2 / 3,
  1 / 3,
  1 / 6,
  1.5,
  0.75,
];

/** Cycles per second of a SYNC_DIVISIONS entry at a tempo. */
export const syncHz = (division: number, bpm: number) =>
  bpm / 60 / (SYNC_BEATS[division] ?? 1);

export const LFO_SHAPES = [
  "Sine",
  "Triangle",
  "Square",
  "Saw up",
  "Saw down",
] as const;
const LFO_TYPES: OscillatorType[] = [
  "sine",
  "triangle",
  "square",
  "sawtooth",
  "sawtooth",
];

/** The beat grid (see Clock in devices.ts), repeated here to keep dsp.ts free of device types. */
type BeatClock = { time: number; beat: number; bpm: number };

/**
 * A tempo-synced LFO with output -1..1. Given the transport's clock, every
 * cycle starts on a multiple of its length counted from the song's start, so
 * a 1/4 LFO restarts on every beat and a 1-bar one on every downbeat.
 *
 * An OscillatorNode's phase can't be set, only its start time, so lining up
 * means starting a fresh oscillator at the next cycle boundary and stopping
 * the old one there. Until then the old one keeps going at the new rate.
 */
export function createLfo(ctx: BaseAudioContext) {
  const out = gain(ctx);
  let shape = 0;
  let division = 4;
  let bpm = 120;
  let clock: BeatClock | null = null;
  const hz = () => syncHz(division, bpm);
  const make = (at: number) => {
    const osc = ctx.createOscillator();
    osc.type = LFO_TYPES[shape] ?? "sine";
    osc.frequency.value = hz();
    osc.connect(out);
    osc.onended = () => osc.disconnect();
    osc.start(at);
    return osc;
  };
  let current = make(0);
  let pending: { osc: OscillatorNode; at: number } | null = null;

  function align() {
    if (!clock) return;
    const now = ctx.currentTime;
    if (pending && pending.at <= now) {
      current = pending.osc;
      pending = null;
    }
    // Live contexts need a moment to schedule; offline ones start at 0.
    const margin = now > 0 ? 0.01 : 0;
    const cycle = SYNC_BEATS[division] ?? 1;
    const bps = clock.bpm / 60;
    const beatNow = clock.beat + (now + margin - clock.time) * bps;
    const next = Math.max(
      clock.beat,
      Math.ceil(beatNow / cycle - 1e-9) * cycle,
    );
    const at = Math.max(now, clock.time + (next - clock.beat) / bps);
    if (pending) pending.osc.stop();
    current.stop(at);
    pending = { osc: make(at), at };
  }

  return {
    output: out as AudioNode,
    /** Shape (LFO_SHAPES index), rate (SYNC_DIVISIONS index) and tempo. */
    set(nextShape: number, nextDivision: number, nextBpm: number) {
      const shapeChanged = nextShape !== shape;
      const rateChanged = nextDivision !== division || nextBpm !== bpm;
      [shape, division, bpm] = [nextShape, nextDivision, nextBpm];
      for (const osc of [current, pending?.osc]) {
        if (!osc) continue;
        if (shapeChanged) osc.type = LFO_TYPES[shape] ?? "sine";
        setParam(osc.frequency, hz(), ctx);
      }
      if (shapeChanged) setParam(out.gain, shape === 4 ? -1 : 1, ctx);
      if (rateChanged) align();
    },
    clock(next: BeatClock) {
      clock = next;
      bpm = next.bpm;
      align();
    },
    stop() {
      current.stop();
      pending?.osc.stop();
    },
  };
}

// Dynamics ---------------------------------------------------------------------

/**
 * The makeup gain DynamicsCompressorNode adds on its own, as a linear factor.
 * The spec has it boost by (1 / curve(0 dBFS))^0.6, so lowering the threshold
 * or raising the ratio also turns the sound up. This is the static curve from
 * the spec's reference implementation (Chromium, WebKit and Gecko share it).
 */
export function nativeMakeup(
  thresholdDb: number,
  kneeDb: number,
  ratio: number,
) {
  const toDb = (x: number) => 20 * Math.log10(x);
  const toLin = (db: number) => 10 ** (db / 20);
  const linearThreshold = toLin(thresholdDb);
  const kneeCurve = (x: number, k: number) =>
    x < linearThreshold
      ? x
      : linearThreshold + (1 - Math.exp(-k * (x - linearThreshold))) / k;
  const slopeAt = (x: number, k: number) => {
    if (x < linearThreshold) return 1;
    const x2 = x * 1.001;
    return (
      (toDb(kneeCurve(x2, k)) - toDb(kneeCurve(x, k))) / (toDb(x2) - toDb(x))
    );
  };
  // Find the knee sharpness whose slope at the knee's end matches the ratio.
  const kneeEndDb = thresholdDb + kneeDb;
  const kneeEnd = toLin(kneeEndDb);
  let [minK, maxK, k] = [0.1, 10000, 5];
  for (let i = 0; i < 15; i++) {
    if (slopeAt(kneeEnd, k) < 1 / ratio) maxK = k;
    else minK = k;
    k = Math.sqrt(minK * maxK);
  }
  const fullRange =
    1 < kneeEnd
      ? kneeCurve(1, k)
      : toLin(toDb(kneeCurve(kneeEnd, k)) + (0 - kneeEndDb) / ratio);
  return (1 / fullRange) ** 0.6;
}
