import type { Device, QuickSynthDevice, SynthDevice } from "../model/types";
import type { DeviceEnv, DeviceInstance } from "./devices";
import { choice, resolveParams, type ParamDef } from "./params";
import { createSynth } from "./synth";

/**
 * Quick Synth: built for getting a usable sound fast. A handful of big,
 * musical controls (one Shape knob that morphs sine → saw → square, a
 * Thickness knob for unison, vibrato that eases in) translated into the full
 * synth's params, so it shares the same tested voice engine.
 */

const p = (
  key: string,
  label: string,
  min: number,
  max: number,
  value: number,
  group: string,
  unit?: ParamDef["unit"],
  curve?: "exp",
): ParamDef => ({ key, label, min, max, default: value, unit, group, curve });

const WOBBLE_RATES = ["1 bar", "1/2", "1/4", "1/8", "1/16", "1/8T"] as const;
/** Index into the full synth's LFO divisions for each wobble rate. */
const WOBBLE_DIVISION = [2, 3, 4, 5, 6, 8];

export const QUICK_PARAMS: ParamDef[] = [
  p("shape", "Shape", 0, 100, 50, "Sound", "%"),
  p("thickness", "Thickness", 0, 100, 20, "Sound", "%"),
  p("sub", "Sub", 0, 100, 0, "Sound", "%"),
  p("octave", "Octave", -2, 2, 0, "Sound"),
  p("brightness", "Brightness", 0, 100, 60, "Tone", "%"),
  p("resonance", "Resonance", 0, 100, 15, "Tone", "%"),
  p("contour", "Contour", -100, 100, 30, "Tone", "%"),
  p("attack", "Attack", 1, 5000, 3, "Envelope", "ms", "exp"),
  p("decay", "Decay", 10, 5000, 500, "Envelope", "ms", "exp"),
  p("sustain", "Sustain", 0, 100, 70, "Envelope", "%"),
  p("release", "Release", 5, 8000, 250, "Envelope", "ms", "exp"),
  p("vibrato", "Vibrato", 0, 100, 0, "Movement", "%"),
  p("vibratoRate", "Rate", 2, 9, 5.5, "Movement", "Hz"),
  p("vibratoDelay", "Delay", 0, 2000, 300, "Movement", "ms"),
  p("wobble", "Wobble", 0, 100, 0, "Movement", "%"),
  choice("wobbleRate", "Wobble rate", WOBBLE_RATES, 3, "Movement"),
  choice("mono", "Mode", ["Poly", "Mono"], 0, "Play"),
  p("glide", "Glide", 0, 500, 0, "Play", "ms"),
  p("velocity", "Vel → tone", 0, 100, 40, "Play", "%"),
  p("drive", "Drive", 0, 100, 0, "Play", "%"),
  p("volume", "Volume", -24, 6, 0, "Play", "dB"),
];

/** One-click envelope shapes; each writes several params. */
export const ENVELOPE_PICKS: Record<string, Record<string, number>> = {
  Pluck: { attack: 1, decay: 300, sustain: 0, release: 200, contour: 50 },
  Keys: { attack: 3, decay: 900, sustain: 40, release: 300 },
  Pad: { attack: 600, decay: 1500, sustain: 85, release: 1800 },
  Swell: { attack: 1800, decay: 2000, sustain: 100, release: 2500 },
  Hold: { attack: 5, decay: 500, sustain: 100, release: 120 },
};

export const QUICK_PRESETS: Record<string, Record<string, number>> = {
  Init: {},
  "Soft keys": {
    shape: 20,
    thickness: 15,
    brightness: 45,
    contour: 25,
    attack: 3,
    decay: 1200,
    sustain: 30,
    release: 400,
    vibrato: 10,
  },
  Bass: {
    shape: 70,
    thickness: 10,
    sub: 60,
    octave: -1,
    brightness: 30,
    resonance: 25,
    contour: 45,
    attack: 1,
    decay: 350,
    sustain: 60,
    release: 80,
    mono: 1,
    glide: 40,
    drive: 30,
  },
  Lead: {
    shape: 60,
    thickness: 25,
    brightness: 65,
    resonance: 20,
    contour: 20,
    attack: 4,
    sustain: 90,
    release: 200,
    vibrato: 25,
    vibratoDelay: 400,
    mono: 1,
    glide: 60,
  },
  Pad: {
    shape: 50,
    thickness: 75,
    brightness: 40,
    contour: 10,
    attack: 700,
    decay: 1500,
    sustain: 85,
    release: 2000,
    wobble: 10,
    wobbleRate: 0,
  },
  Pluck: {
    shape: 85,
    thickness: 20,
    brightness: 25,
    resonance: 30,
    contour: 60,
    attack: 1,
    decay: 300,
    sustain: 0,
    release: 200,
  },
  Wobble: {
    shape: 65,
    thickness: 30,
    sub: 50,
    octave: -1,
    brightness: 20,
    resonance: 45,
    contour: 0,
    sustain: 100,
    release: 80,
    wobble: 70,
    wobbleRate: 3,
    mono: 1,
    drive: 40,
  },
};

/** Translate Quick Synth params into the full synth's params. */
export function quickToSynthParams(values: Record<string, number>) {
  const q = resolveParams(QUICK_PARAMS, values);
  // Shape: sine → saw over the first half, saw → square over the second,
  // as an equal-power crossfade between two oscillators.
  const s = q.shape / 100;
  const half = s < 0.5;
  const f = half ? s / 0.5 : (s - 0.5) / 0.5;
  const t = q.thickness / 100;
  return {
    osc1Wave: half ? 0 : 2,
    osc2Wave: half ? 2 : 3,
    osc1Level: Math.cos((f * Math.PI) / 2) * 80,
    osc2Level: Math.sin((f * Math.PI) / 2) * 80,
    osc2Fine: 0,
    osc1Octave: q.octave,
    osc2Octave: q.octave,
    osc3Wave: 0,
    osc3Octave: q.octave - 1,
    osc3Level: q.sub * 0.7,
    unison: 1 + Math.round(t * 4),
    detune: t * 40,
    spread: t * 100,
    filterType: 0,
    slope: 1,
    cutoff: 60 * (18000 / 60) ** (q.brightness / 100),
    resonance: q.resonance * 0.8,
    filterEnv: (q.contour / 100) * 36,
    keyTrack: 60,
    velFilter: q.velocity,
    fAttack: q.attack,
    fDecay: q.decay,
    fSustain: 0,
    fRelease: q.release,
    attack: q.attack,
    decay: q.decay,
    sustain: q.sustain,
    release: q.release,
    // Vibrato: LFO 1 → pitch, free-running, easing in after the note starts.
    lfo1Wave: 0,
    lfo1Sync: 0,
    lfo1Rate: q.vibratoRate,
    lfo1Fade: q.vibratoDelay,
    mod1Src: q.vibrato > 0 ? 1 : 0,
    mod1Dst: 0,
    mod1Amt: (q.vibrato / 100) * 5,
    // Wobble: LFO 2 → cutoff, tempo-synced.
    lfo2Wave: 0,
    lfo2Sync: 1,
    lfo2Division: WOBBLE_DIVISION[q.wobbleRate] ?? 5,
    mod2Src: q.wobble > 0 ? 2 : 0,
    mod2Dst: 4,
    mod2Amt: (q.wobble / 100) * 50,
    voices: q.mono ? 1 : 8,
    glide: q.glide,
    drive: q.drive,
    volume: q.volume,
  };
}

export function createQuickSynth(
  ctx: BaseAudioContext,
  initial: QuickSynthDevice,
  env: DeviceEnv,
): DeviceInstance {
  // Keep translated devices stable per input so the synth's change check works.
  let last: { from: QuickSynthDevice; to: SynthDevice } | null = null;
  const translate = (device: QuickSynthDevice): SynthDevice => {
    if (last?.from !== device) {
      last = {
        from: device,
        to: {
          id: device.id,
          type: "synth",
          params: quickToSynthParams(device.params),
        },
      };
    }
    return last.to;
  };
  const synth = createSynth(ctx, translate(initial), env);
  return {
    ...synth,
    update(device: Device, env: DeviceEnv) {
      if (device.type === "quickSynth") synth.update(translate(device), env);
    },
  };
}
