import type { Clock, DeviceEnv } from "./devices";
import { BUTTERWORTH_Q } from "./dsp";
import type { ParamDef } from "./params";

/** The shape of an effect, shared by effects.ts and the effects in their own files. */

export type Built = {
  update: (p: Record<string, number>, env: DeviceEnv) => void;
  /** Gain reduction in dB (≤ 0), for dynamics effects. */
  reduction?: () => number;
  /**
   * Replaces the plain dry delay when the wet path also shifts phase (band
   * splits): the dry runs through the same all-passes, so blending the two
   * doesn't cancel at the crossover frequencies.
   */
  dry?: { input: AudioNode; output: AudioNode };
  /** The beat grid, for lining LFO cycles up with the bars. */
  clock?: (clock: Clock) => void;
  dispose?: () => void;
};

export type EffectDef = {
  label: string;
  params: ParamDef[];
  /**
   * How the "mix" param blends. "send" (reverb, delay): up to 50% the dry
   * stays at full level and only the effect fades in. "blend" (parallel
   * drive or compression): a straight crossfade. Without it, fully wet.
   */
  mix?: "send" | "blend";
  /** Named settings for the device's preset menu; each replaces every param. */
  presets?: Record<string, Record<string, number>>;
  /** Seconds the wet path lags (lookahead, oversampling); the dry path is delayed to match. */
  latency?: (sampleRate: number) => number;
  build: (ctx: BaseAudioContext, input: AudioNode, output: AudioNode) => Built;
};

export const p = (
  key: string,
  label: string,
  min: number,
  max: number,
  def: number,
  unit?: ParamDef["unit"],
  curve?: "exp",
  step?: number,
): ParamDef => ({ key, label, min, max, default: def, unit, curve, step });

/** Dry/wet for "send" effects. */
export const SEND_MIX: ParamDef = {
  ...p("mix", "Dry/Wet", 0, 100, 25, "%"),
  description:
    "Balance of effect against the original. Up to 50% the original stays at full level, like a send.",
};

/** Dry/wet for "blend" effects. */
export const blendMix = (value: number, description: string): ParamDef => ({
  ...p("mix", "Dry/Wet", 0, 100, value, "%"),
  description,
});

/** A low-cut or high-cut biquad with a flat (Butterworth) corner. */
export const cut = (ctx: BaseAudioContext, type: "highpass" | "lowpass") => {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = BUTTERWORTH_Q;
  return f;
};

export const LOW_CUT = (value: number, description: string): ParamDef => ({
  ...p("lowCut", "Low cut", 20, 2000, value, "Hz", "exp"),
  description,
});
export const HIGH_CUT = (value: number, description: string): ParamDef => ({
  ...p("highCut", "High cut", 500, 18000, value, "Hz", "exp"),
  description,
});
