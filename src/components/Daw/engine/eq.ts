import type { EffectDef } from "./effects";
import { dbToGain, setParam } from "./dsp";
import { choice, describe, type ParamDef } from "./params";

/**
 * A tone EQ for getting a sound quickly: low and high cuts for cleanup, then
 * three broad musical bands (low shelf, mid bell, high shelf) you sweep and
 * boost or cut. Not a parametric: each band has a fixed shape chosen to sound
 * good, and the mid only offers Wide, Medium or Narrow.
 *
 *   in → low cut (2 stages) → low → mid → high → high cut (2 stages) → output
 */

const p = (
  key: string,
  label: string,
  min: number,
  max: number,
  def: number,
  group: string,
  unit?: ParamDef["unit"],
  curve?: "exp",
  step?: number,
): ParamDef => ({
  key,
  label,
  min,
  max,
  default: def,
  group,
  unit,
  curve,
  step,
});

const gainParam = (key: string, group: string) =>
  p(key, "Gain", -15, 15, 0, group, "dB", undefined, 0.1);

export const LOW_CUT_OFF = 20;
export const HIGH_CUT_OFF = 20000;
export const MID_WIDTHS = ["Wide", "Medium", "Narrow"] as const;
const MID_Q = [0.5, 1, 2.5];

export const EQ_PARAMS: ParamDef[] = describe(
  [
    p("lowCut", "Low cut", LOW_CUT_OFF, 1000, LOW_CUT_OFF, "Cuts", "Hz", "exp"),
    p(
      "highCut",
      "High cut",
      1000,
      HIGH_CUT_OFF,
      HIGH_CUT_OFF,
      "Cuts",
      "Hz",
      "exp",
    ),
    choice("slope", "Slope", ["12 dB", "24 dB"], 0, "Cuts"),
    gainParam("lowGain", "Low"),
    p("lowFreq", "Freq", 30, 600, 120, "Low", "Hz", "exp"),
    gainParam("midGain", "Mid"),
    p("midFreq", "Freq", 150, 8000, 1000, "Mid", "Hz", "exp"),
    choice("midWidth", "Width", MID_WIDTHS, 1, "Mid"),
    gainParam("highGain", "High"),
    p("highFreq", "Freq", 1500, 16000, 8000, "High", "Hz", "exp"),
    p("output", "Output", -15, 15, 0, "Output", "dB", undefined, 0.1),
    choice("autoGain", "Auto gain", ["Off", "On"], 0, "Output"),
  ],
  {
    lowCut:
      "Removes everything below this frequency. Clears rumble and mud from anything that isn't bass or kick: try 100 to 200 Hz on synths and pads. All the way down is off.",
    highCut:
      "Removes everything above this frequency. Tames hiss and harshness, or pushes a sound into the background. All the way up is off.",
    slope:
      "How steeply the cuts remove sound. 12 dB is gentle and natural; 24 dB is a firmer wall.",
    lowGain:
      "Boost for weight and warmth, cut to thin a sound out so it sits above the bass.",
    lowFreq:
      "Where the low band starts. Around 60 Hz is sub and thump, 120 Hz body, 300 Hz warmth turning to mud.",
    midGain:
      "Boost to bring a sound forward, cut to scoop it out. Cutting around 300 to 500 Hz clears boxiness and mud; boosting 2 to 4 kHz adds bite and presence.",
    midFreq:
      "Centre of the mid band. 300 Hz is mud, 800 Hz honk, 1.5 kHz nasal, 3 kHz bite and presence, 6 kHz edge.",
    midWidth:
      "How much the mid band covers. Wide for broad tone shaping, Narrow for picking out one problem frequency.",
    highGain: "Boost for brightness and air, cut to darken or soften a sound.",
    highFreq:
      "Where the high band starts. 3 kHz is presence, 8 kHz brightness, 12 kHz and up air.",
    output: "Level after the EQ.",
    autoGain:
      "Keeps the overall level steady as you boost or cut the bands, so you hear the change in tone rather than just a change in volume. The cuts aren't compensated.",
  },
);

// Frequency response ---------------------------------------------------------

type Biquad = {
  type: "lowpass" | "highpass" | "lowshelf" | "highshelf" | "peaking";
  freq: number;
  /** Linear Q for peaking; dB for lowpass/highpass (as BiquadFilterNode); ignored by shelves. */
  q: number;
  gain: number;
};

/** Butterworth: one 12 dB stage, or two stages for 24 dB (Q in dB). */
const BUTTERWORTH_12 = [-3.01];
const BUTTERWORTH_24 = [-5.33, 2.33];

/** The filters the EQ runs for these params. Cuts that are off are left out. */
function stages(v: Record<string, number>): Biquad[] {
  const cut = v.slope === 1 ? BUTTERWORTH_24 : BUTTERWORTH_12;
  return [
    ...(v.lowCut > LOW_CUT_OFF
      ? cut.map(
          (q): Biquad => ({ type: "highpass", freq: v.lowCut, q, gain: 0 }),
        )
      : []),
    ...bands(v),
    ...(v.highCut < HIGH_CUT_OFF
      ? cut.map(
          (q): Biquad => ({ type: "lowpass", freq: v.highCut, q, gain: 0 }),
        )
      : []),
  ];
}

const bands = (v: Record<string, number>): Biquad[] => [
  { type: "lowshelf", freq: v.lowFreq, q: 0, gain: v.lowGain },
  {
    type: "peaking",
    freq: v.midFreq,
    q: MID_Q[v.midWidth] ?? 1,
    gain: v.midGain,
  },
  { type: "highshelf", freq: v.highFreq, q: 0, gain: v.highGain },
];

/**
 * |H| of one BiquadFilterNode at frequency f, from the Web Audio spec's
 * coefficients (the Audio EQ Cookbook), so the curve matches what plays.
 */
function magnitude(b: Biquad, f: number, sampleRate: number) {
  const w0 = (2 * Math.PI * Math.min(b.freq, sampleRate / 2)) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = 10 ** (b.gain / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (b.type) {
    case "lowpass":
    case "highpass": {
      const alpha = sin / (2 * 10 ** (b.q / 20));
      const sign = b.type === "lowpass" ? -1 : 1;
      b0 = (1 + sign * cos) / 2;
      b1 = -sign * (1 + sign * cos);
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case "peaking": {
      const alpha = sin / (2 * b.q);
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    }
    default: {
      // Shelves use slope S = 1.
      const s = 2 * Math.sqrt(A) * (sin / 2) * Math.SQRT2;
      const k = b.type === "lowshelf" ? 1 : -1;
      b0 = A * (A + 1 - k * (A - 1) * cos + s);
      b1 = 2 * k * A * (A - 1 - k * (A + 1) * cos);
      b2 = A * (A + 1 - k * (A - 1) * cos - s);
      a0 = A + 1 + k * (A - 1) * cos + s;
      a1 = -2 * k * (A - 1 + k * (A + 1) * cos);
      a2 = A + 1 + k * (A - 1) * cos - s;
    }
  }
  const w = (2 * Math.PI * f) / sampleRate;
  const [c1, s1, c2, s2] = [
    Math.cos(w),
    Math.sin(w),
    Math.cos(2 * w),
    Math.sin(2 * w),
  ];
  const nr = b0 + b1 * c1 + b2 * c2;
  const ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2;
  const di = -(a1 * s1 + a2 * s2);
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
}

/** The EQ's response in dB at each frequency (before Output and Auto gain). */
export function eqResponse(
  v: Record<string, number>,
  freqs: number[],
  sampleRate = 48000,
) {
  const all = stages(v);
  return freqs.map((f) => {
    let m = 1;
    for (const b of all) m *= magnitude(b, f, sampleRate);
    return 20 * Math.log10(Math.max(m, 1e-6));
  });
}

/** Log-spaced frequencies from `lo` to `hi`. */
export const logFrequencies = (lo: number, hi: number, n: number) =>
  Array.from({ length: n }, (_, i) => lo * (hi / lo) ** (i / (n - 1)));

const AUTO_FREQS = logFrequencies(40, 12000, 48);

/**
 * Gain that undoes the bands' average level change, weighting every octave
 * equally (as music's energy roughly is). Cuts are left alone.
 */
export function autoGain(v: Record<string, number>, sampleRate = 48000) {
  const b = bands(v);
  let power = 0;
  for (const f of AUTO_FREQS) {
    let m = 1;
    for (const s of b) m *= magnitude(s, f, sampleRate);
    power += m * m;
  }
  return 1 / Math.sqrt(power / AUTO_FREQS.length);
}

// Audio ----------------------------------------------------------------------

export const eqFx: EffectDef = {
  label: "EQ",
  params: EQ_PARAMS,
  build(ctx, input, output) {
    const node = (type: BiquadFilterType) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      return f;
    };
    const lowCut = [node("highpass"), node("highpass")];
    const low = node("lowshelf");
    const mid = node("peaking");
    const high = node("highshelf");
    const highCut = [node("lowpass"), node("lowpass")];
    const out = ctx.createGain();
    [input, ...lowCut, low, mid, high, ...highCut, out, output].reduce((a, b) =>
      a.connect(b),
    );
    const nyquist = ctx.sampleRate / 2;

    return {
      update(v) {
        // Cuts that are off (or the unused second stage at 12 dB) move to
        // where they're transparent: high-pass at 1 Hz, low-pass at Nyquist.
        const cut = v.slope === 1 ? BUTTERWORTH_24 : BUTTERWORTH_12;
        lowCut.forEach((f, i) => {
          const on = v.lowCut > LOW_CUT_OFF && i < cut.length;
          setParam(f.frequency, on ? v.lowCut : 1, ctx);
          setParam(f.Q, cut[i] ?? -3.01, ctx);
        });
        highCut.forEach((f, i) => {
          const on = v.highCut < HIGH_CUT_OFF && i < cut.length;
          setParam(f.frequency, on ? v.highCut : nyquist, ctx);
          setParam(f.Q, cut[i] ?? -3.01, ctx);
        });
        setParam(low.frequency, v.lowFreq, ctx);
        setParam(low.gain, v.lowGain, ctx);
        setParam(mid.frequency, v.midFreq, ctx);
        setParam(mid.gain, v.midGain, ctx);
        setParam(mid.Q, MID_Q[v.midWidth] ?? 1, ctx);
        setParam(high.frequency, v.highFreq, ctx);
        setParam(high.gain, v.highGain, ctx);
        setParam(
          out.gain,
          dbToGain(v.output) *
            (v.autoGain === 1 ? autoGain(v, ctx.sampleRate) : 1),
          ctx,
        );
      },
    };
  },
};
