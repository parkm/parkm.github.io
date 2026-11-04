import type { Device, EffectDevice, EffectType } from "../model/types";
import type { DeviceEnv, DeviceInstance } from "./devices";
import {
  dbToGain,
  DRIVE_CURVE,
  DRIVE_RANGE,
  gain,
  ms,
  mulberry32,
  setParam,
} from "./dsp";
import { choice, describe, resolveParams, type ParamDef } from "./params";

/**
 * Audio effects built from native nodes. Each one sits between a dry and a
 * wet path, so bypass and dry/wet are smooth gain changes, never rewiring.
 */

type Built = {
  update: (p: Record<string, number>, env: DeviceEnv) => void;
  dispose?: () => void;
};

type EffectDef = {
  label: string;
  params: ParamDef[];
  /** Has a dry/wet "mix" param (time-based effects). Others are fully wet. */
  mix?: boolean;
  build: (ctx: BaseAudioContext, input: AudioNode, output: AudioNode) => Built;
};

const p = (
  key: string,
  label: string,
  min: number,
  max: number,
  def: number,
  unit?: ParamDef["unit"],
  curve?: "exp",
): ParamDef => ({ key, label, min, max, default: def, unit, curve });

const MIX: ParamDef = {
  ...p("mix", "Dry/Wet", 0, 100, 25, "%"),
  description:
    "Balance of effect against the original. Up to 50% the original stays at full level, like a send.",
};

const FILTER_TYPES = ["Low-pass", "High-pass", "Band-pass", "Notch"] as const;
const FILTER_NODE_TYPES: BiquadFilterType[] = [
  "lowpass",
  "highpass",
  "bandpass",
  "notch",
];

const filterFx: EffectDef = {
  label: "Filter",
  params: describe(
    [
      choice("type", "Type", FILTER_TYPES),
      p("frequency", "Freq", 30, 18000, 2000, "Hz", "exp"),
      p("resonance", "Reso", 0, 100, 20, "%"),
    ],
    {
      type: "Low-pass removes highs, High-pass removes lows, Band-pass keeps a band around Freq, Notch cuts a narrow band.",
      frequency: "Cutoff or centre frequency.",
      resonance: "Boosts frequencies at Freq. High values whistle.",
    },
  ),
  build(ctx, input, output) {
    const f = ctx.createBiquadFilter();
    input.connect(f).connect(output);
    return {
      update(v) {
        f.type = FILTER_NODE_TYPES[v.type] ?? "lowpass";
        setParam(f.frequency, v.frequency, ctx);
        const r = v.resonance / 100;
        setParam(
          f.Q,
          v.type === 0 || v.type === 1 ? -3 + r * 27 : 0.5 + r * 15,
          ctx,
        );
      },
    };
  },
};

const driveFx: EffectDef = {
  label: "Drive",
  params: describe(
    [
      p("drive", "Drive", 0, 100, 40, "%"),
      p("tone", "Tone", 500, 18000, 9000, "Hz", "exp"),
      p("output", "Output", -24, 6, 0, "dB"),
    ],
    {
      drive: "Amount of saturation, from warm to fuzzy.",
      tone: "Removes harsh highs after the distortion. Lower is darker.",
      output: "Level after the drive.",
    },
  ),
  build(ctx, input, output) {
    const pre = gain(ctx);
    const shaper = ctx.createWaveShaper();
    shaper.curve = DRIVE_CURVE;
    shaper.oversample = "4x";
    const post = gain(ctx);
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    input
      .connect(pre)
      .connect(shaper)
      .connect(tone)
      .connect(post)
      .connect(output);
    return {
      update(v) {
        const k = 0.4 + (v.drive / 100) * 6;
        setParam(pre.gain, k / DRIVE_RANGE, ctx);
        // Quiet signals get k^0.4 louder (about +6 dB at full drive)
        // rather than the full k, so drive adds grit more than volume.
        setParam(
          post.gain,
          ((Math.tanh(DRIVE_RANGE) * k ** 0.4) / k) * dbToGain(v.output),
          ctx,
        );
        setParam(tone.frequency, v.tone, ctx);
      },
    };
  },
};

const DELAY_TIMES = [
  "1/16",
  "1/8T",
  "1/8",
  "1/8D",
  "1/4",
  "1/4D",
  "1/2",
  "1 bar",
] as const;
const DELAY_BEATS = [0.25, 1 / 3, 0.5, 0.75, 1, 1.5, 2, 4];

const delayFx: EffectDef = {
  label: "Delay",
  mix: true,
  params: describe(
    [
      choice("time", "Time", DELAY_TIMES, 3),
      p("feedback", "Feedback", 0, 95, 40, "%"),
      p("tone", "Tone", 500, 18000, 5000, "Hz", "exp"),
      choice("pingPong", "Ping-pong", ["Off", "On"], 1),
      MIX,
    ],
    {
      time: "Echo time, synced to the tempo. T is a triplet, D is dotted.",
      feedback: "How much each echo feeds the next. Higher repeats longer.",
      tone: "Removes highs from the echoes, so each repeat gets darker. Lower sounds like tape.",
      pingPong: "On bounces the echoes between left and right.",
    },
  ),
  build(ctx, input, output) {
    // Force stereo so mono instruments feed both sides.
    const stereo = ctx.createGain();
    stereo.channelCount = 2;
    stereo.channelCountMode = "explicit";
    stereo.channelInterpretation = "speakers";
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    input.connect(stereo).connect(split);

    const side = () => {
      const delay = ctx.createDelay(4);
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      delay.connect(tone);
      return { delay, tone, self: gain(ctx, 0), cross: gain(ctx, 0) };
    };
    const L = side();
    const R = side();
    // Straight feedback feeds each side back into itself; ping-pong crosses over.
    L.tone.connect(L.self).connect(L.delay);
    R.tone.connect(R.self).connect(R.delay);
    L.tone.connect(L.cross).connect(R.delay);
    R.tone.connect(R.cross).connect(L.delay);
    L.tone.connect(merge, 0, 0);
    R.tone.connect(merge, 0, 1);
    merge.connect(output);

    const inL = gain(ctx);
    const inR = gain(ctx);
    const inRtoL = gain(ctx, 0);
    split.connect(inL, 0).connect(L.delay);
    split.connect(inR, 1).connect(R.delay);
    split.connect(inRtoL, 1).connect(L.delay);

    return {
      update(v, env) {
        const seconds = ((DELAY_BEATS[v.time] ?? 0.5) * 60) / env.bpm;
        const fb = v.feedback / 100;
        const ping = v.pingPong === 1;
        for (const s of [L, R]) {
          setParam(s.delay.delayTime, Math.min(4, seconds), ctx);
          setParam(s.tone.frequency, v.tone, ctx);
          setParam(s.self.gain, ping ? 0 : fb, ctx);
          setParam(s.cross.gain, ping ? fb : 0, ctx);
        }
        // Ping-pong sums the input into the left delay so echoes alternate L, R, L…
        setParam(inR.gain, ping ? 0 : 1, ctx);
        setParam(inRtoL.gain, ping ? 1 : 0, ctx);
      },
    };
  },
};

// Reverb impulses: seeded decaying noise, cached by sample rate and length.
const impulses = new Map<string, AudioBuffer>();

function impulse(ctx: BaseAudioContext, seconds: number) {
  const length = Math.max(1, Math.round(seconds * ctx.sampleRate));
  const key = `${ctx.sampleRate}:${length}`;
  let buffer = impulses.get(key);
  if (buffer) return buffer;
  buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const fadeIn = Math.round(ctx.sampleRate * 0.002);
  for (let c = 0; c < 2; c++) {
    const rand = mulberry32(0x5eed + c);
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      // -60 dB at the end of the impulse.
      const env = Math.exp((-6.9 * i) / length) * Math.min(1, i / fadeIn);
      data[i] = (rand() * 2 - 1) * env;
    }
  }
  if (impulses.size > 16) impulses.clear();
  impulses.set(key, buffer);
  return buffer;
}

const reverbFx: EffectDef = {
  label: "Reverb",
  mix: true,
  params: describe(
    [
      p("decay", "Decay", 0.3, 12, 2.2, "s", "exp"),
      p("predelay", "Pre-delay", 0, 200, 15, "ms"),
      p("tone", "Tone", 1000, 18000, 7000, "Hz", "exp"),
      MIX,
    ],
    {
      decay: "Length of the reverb tail, from a small room to a huge hall.",
      predelay:
        "Gap before the reverb starts. Keeps the original sound clear of the room.",
      tone: "Removes highs from the reverb. Lower is darker and softer.",
    },
  ),
  build(ctx, input, output) {
    const predelay = ctx.createDelay(0.5);
    const convolver = ctx.createConvolver();
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    input.connect(predelay).connect(convolver).connect(tone).connect(output);

    let decay = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const live = !(ctx instanceof OfflineAudioContext);
    return {
      update(v) {
        setParam(predelay.delayTime, ms(v.predelay), ctx);
        setParam(tone.frequency, v.tone, ctx);
        const next = Math.round(v.decay * 20) / 20;
        if (next === decay) return;
        decay = next;
        // Regenerating a long impulse is costly; while a knob is dragging, do it once it settles.
        clearTimeout(timer);
        const apply = () => (convolver.buffer = impulse(ctx, decay));
        if (live && convolver.buffer) timer = setTimeout(apply, 80);
        else apply();
      },
      dispose: () => clearTimeout(timer),
    };
  },
};

const compressorFx: EffectDef = {
  label: "Compressor",
  params: describe(
    [
      p("threshold", "Threshold", -60, 0, -18, "dB"),
      p("ratio", "Ratio", 1, 20, 4),
      p("attack", "Attack", 0.1, 100, 10, "ms", "exp"),
      p("release", "Release", 10, 1000, 150, "ms", "exp"),
      // The native compressor already applies makeup gain; this is a plain trim.
      p("output", "Output", -24, 12, 0, "dB"),
    ],
    {
      threshold:
        "Level above which it starts turning the sound down. Lower compresses more.",
      ratio:
        "How hard sound above the threshold is turned down. 2 is gentle, 4 typical, 10 and up limits.",
      attack:
        "How fast it reacts. Fast tames peaks; slower lets the initial hit punch through.",
      release: "How fast it lets go after the level drops.",
      output: "Level after compression.",
    },
  ),
  build(ctx, input, output) {
    const comp = ctx.createDynamicsCompressor();
    comp.knee.value = 6;
    const makeup = gain(ctx);
    input.connect(comp).connect(makeup).connect(output);
    return {
      update(v) {
        setParam(comp.threshold, v.threshold, ctx);
        setParam(comp.ratio, v.ratio, ctx);
        setParam(comp.attack, ms(v.attack), ctx);
        setParam(comp.release, ms(v.release), ctx);
        setParam(makeup.gain, dbToGain(v.output), ctx);
      },
    };
  },
};

export const EFFECTS: Record<EffectType, EffectDef> = {
  filter: filterFx,
  drive: driveFx,
  delay: delayFx,
  reverb: reverbFx,
  compressor: compressorFx,
};

export function createEffect(
  ctx: BaseAudioContext,
  initial: EffectDevice,
  initialEnv: DeviceEnv,
): DeviceInstance {
  const def = EFFECTS[initial.type];
  const input = gain(ctx);
  const output = gain(ctx);
  const dry = gain(ctx, 0);
  const wetIn = gain(ctx);
  const wet = gain(ctx, 0);
  input.connect(dry).connect(output);
  input.connect(wetIn);
  wet.connect(output);
  const built = def.build(ctx, wetIn, wet);

  let current: EffectDevice | null = null;
  let bpm = 0;

  function update(device: Device, env: DeviceEnv) {
    if (device.type !== initial.type || (device === current && env.bpm === bpm))
      return;
    const effect = device as EffectDevice;
    const v = resolveParams(def.params, effect.params);
    built.update(v, env);
    // Up to 50% mix keeps the dry signal at full level, like a send.
    const mix = def.mix ? v.mix / 100 : 1;
    setParam(dry.gain, effect.bypass ? 1 : Math.min(1, 2 * (1 - mix)), ctx);
    setParam(wet.gain, effect.bypass ? 0 : Math.min(1, 2 * mix), ctx);
    current = effect;
    bpm = env.bpm;
  }

  update(initial, initialEnv);

  return {
    input,
    output,
    update,
    dispose() {
      built.dispose?.();
      output.disconnect();
    },
  };
}
