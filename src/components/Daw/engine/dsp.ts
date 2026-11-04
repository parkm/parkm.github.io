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
