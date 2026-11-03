import type { VoiceType } from "../model/types";
import {
  drive,
  filter,
  gain,
  ms,
  noise,
  osc,
  percEnv,
  SILENT,
  velocityGain,
} from "./dsp";
import type { ParamDef } from "./params";

/**
 * Synthesized drum voices. Each hit builds a fresh one-shot node graph that
 * starts at `t` and stops itself; the browser frees it afterwards. Parameters
 * are read at trigger time, so edits apply from the next hit.
 */

export type VoiceHandle = {
  start: number;
  end: number;
  /** Fade the voice out quickly from `time` (choke groups, stopping). */
  choke: (time: number) => void;
};

type Play = (
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  velocity: number,
  p: Record<string, number>,
) => VoiceHandle;

export type VoiceDef = { label: string; params: ParamDef[]; play: Play };

/** Every voice ends in a choke gain so it can be cut without fighting its envelope automation. */
function voiceOut(ctx: BaseAudioContext, out: AudioNode) {
  const node = gain(ctx);
  node.connect(out);
  return node;
}

function handle(
  chokeNode: GainNode,
  last: AudioScheduledSourceNode,
  start: number,
  end: number,
): VoiceHandle {
  last.onended = () => chokeNode.disconnect();
  return {
    start,
    end,
    choke(time) {
      chokeNode.gain.setTargetAtTime(0, time, 0.004);
    },
  };
}

const semis = (st: number) => 2 ** (st / 12);

// Kick: sine with a fast exponential pitch drop, a noise click, optional drive.
const kick: VoiceDef = {
  label: "Kick",
  params: [
    {
      key: "tune",
      label: "Tune",
      min: 30,
      max: 120,
      default: 50,
      unit: "Hz",
      curve: "exp",
    },
    { key: "sweep", label: "Sweep", min: 0, max: 48, default: 22, unit: "st" },
    {
      key: "bend",
      label: "Bend",
      min: 5,
      max: 250,
      default: 40,
      unit: "ms",
      curve: "exp",
    },
    {
      key: "decay",
      label: "Decay",
      min: 60,
      max: 2500,
      default: 480,
      unit: "ms",
      curve: "exp",
    },
    { key: "click", label: "Click", min: 0, max: 100, default: 35, unit: "%" },
    { key: "drive", label: "Drive", min: 0, max: 100, default: 10, unit: "%" },
  ],
  play(ctx, out, t, velocity, p) {
    const amp = velocityGain(velocity);
    const end = t + 0.002 + ms(p.decay) + 0.01;
    const outNode = voiceOut(ctx, out);
    const bus = drive(ctx, p.drive / 100, outNode);

    const body = osc(ctx, "sine", p.tune, t, end);
    body.frequency.setValueAtTime(p.tune * semis(p.sweep), t);
    body.frequency.setTargetAtTime(p.tune, t, ms(p.bend) / 3);
    const bodyEnv = gain(ctx, 0);
    percEnv(bodyEnv.gain, t, amp, 0.002, ms(p.decay));
    body.connect(bodyEnv).connect(bus);

    if (p.click > 0) {
      const n = noise(ctx, t, t + 0.03);
      const clickEnv = gain(ctx, 0);
      percEnv(clickEnv.gain, t, amp * (p.click / 100) * 0.7, 0.0005, 0.012);
      n.connect(filter(ctx, "highpass", 1800))
        .connect(clickEnv)
        .connect(bus);
    }
    return handle(outNode, body, t, end);
  },
};

// Snare: two tuned sines for the body plus filtered noise for the snap.
const snare: VoiceDef = {
  label: "Snare",
  params: [
    {
      key: "tune",
      label: "Tune",
      min: 100,
      max: 400,
      default: 185,
      unit: "Hz",
      curve: "exp",
    },
    {
      key: "body",
      label: "Body",
      min: 30,
      max: 600,
      default: 140,
      unit: "ms",
      curve: "exp",
    },
    {
      key: "snappy",
      label: "Snappy",
      min: 0,
      max: 100,
      default: 60,
      unit: "%",
    },
    {
      key: "decay",
      label: "Decay",
      min: 40,
      max: 1000,
      default: 210,
      unit: "ms",
      curve: "exp",
    },
    {
      key: "tone",
      label: "Tone",
      min: 500,
      max: 10000,
      default: 2200,
      unit: "Hz",
      curve: "exp",
    },
  ],
  play(ctx, out, t, velocity, p) {
    const amp = velocityGain(velocity);
    const snappy = p.snappy / 100;
    const end = t + Math.max(ms(p.body), ms(p.decay)) + 0.01;
    const outNode = voiceOut(ctx, out);

    const bodyEnv = gain(ctx, 0);
    percEnv(bodyEnv.gain, t, amp * (1 - snappy * 0.5), 0.001, ms(p.body));
    bodyEnv.connect(outNode);
    let last: AudioScheduledSourceNode | null = null;
    for (const [ratio, level] of [
      [1, 1],
      [1.6, 0.55],
    ]) {
      const f = p.tune * ratio;
      const o = osc(ctx, "sine", f, t, end);
      o.frequency.setValueAtTime(f * 1.25, t);
      o.frequency.setTargetAtTime(f, t, 0.006);
      o.connect(gain(ctx, level)).connect(bodyEnv);
      last = o;
    }

    const n = noise(ctx, t, end);
    const noiseEnv = gain(ctx, 0);
    percEnv(noiseEnv.gain, t, amp * snappy * 1.6, 0.0005, ms(p.decay));
    n.connect(filter(ctx, "highpass", p.tone, 0.9))
      .connect(filter(ctx, "lowpass", 12000))
      .connect(noiseEnv)
      .connect(outNode);

    return handle(outNode, last ?? n, t, end);
  },
};

// Hats: six square waves at the 808's metallic frequency ratios, band-passed then high-passed.
const HAT_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];
const hat: VoiceDef = {
  label: "Hat",
  params: [
    { key: "tune", label: "Tune", min: -12, max: 12, default: 0, unit: "st" },
    {
      key: "decay",
      label: "Decay",
      min: 10,
      max: 2500,
      default: 55,
      unit: "ms",
      curve: "exp",
    },
    {
      key: "tone",
      label: "Tone",
      min: 3000,
      max: 14000,
      default: 7500,
      unit: "Hz",
      curve: "exp",
    },
  ],
  play(ctx, out, t, velocity, p) {
    const amp = velocityGain(velocity);
    const end = t + 0.0005 + ms(p.decay) + 0.01;
    const outNode = voiceOut(ctx, out);
    const env = gain(ctx, 0);
    percEnv(env.gain, t, amp * 8, 0.0005, ms(p.decay));

    const mix = gain(ctx, 1 / 3);
    mix
      .connect(filter(ctx, "bandpass", 10000, 0.8))
      .connect(filter(ctx, "highpass", p.tone, 0.9))
      .connect(env)
      .connect(outNode);

    const base = 40 * semis(p.tune);
    let last: OscillatorNode | null = null;
    for (const r of HAT_RATIOS) {
      last = osc(ctx, "square", base * r, t, end);
      last.connect(mix);
    }
    return handle(outNode, last!, t, end);
  },
};

// Clap: band-passed noise retriggered in quick bursts, then a longer tail.
const clap: VoiceDef = {
  label: "Clap",
  params: [
    {
      key: "tone",
      label: "Tone",
      min: 500,
      max: 4000,
      default: 1200,
      unit: "Hz",
      curve: "exp",
    },
    {
      key: "decay",
      label: "Decay",
      min: 40,
      max: 1500,
      default: 240,
      unit: "ms",
      curve: "exp",
    },
    {
      key: "spread",
      label: "Spread",
      min: 3,
      max: 25,
      default: 10,
      unit: "ms",
    },
  ],
  play(ctx, out, t, velocity, p) {
    const amp = velocityGain(velocity) * 4;
    const spread = ms(p.spread);
    const bursts = 3;
    const tailStart = t + bursts * spread;
    const end = tailStart + ms(p.decay) + 0.01;
    const outNode = voiceOut(ctx, out);

    const env = gain(ctx, 0);
    const g = env.gain;
    g.setValueAtTime(0, t);
    for (let i = 0; i < bursts; i++) {
      const s = t + i * spread;
      g.linearRampToValueAtTime(amp, s + 0.0008);
      g.exponentialRampToValueAtTime(amp * 0.08, s + spread);
    }
    g.linearRampToValueAtTime(amp, tailStart + 0.0008);
    g.exponentialRampToValueAtTime(SILENT, end - 0.01);
    g.setValueAtTime(0, end - 0.01);

    const n = noise(ctx, t, end);
    n.connect(filter(ctx, "bandpass", p.tone, 1.3))
      .connect(filter(ctx, "highpass", 400))
      .connect(env)
      .connect(outNode);
    return handle(outNode, n, t, end);
  },
};

// Rim: two short tones through a highpass, slightly driven.
const rim: VoiceDef = {
  label: "Rim",
  params: [
    { key: "tune", label: "Tune", min: -12, max: 12, default: 0, unit: "st" },
    {
      key: "decay",
      label: "Decay",
      min: 8,
      max: 250,
      default: 30,
      unit: "ms",
      curve: "exp",
    },
    {
      key: "tone",
      label: "Tone",
      min: 200,
      max: 4000,
      default: 700,
      unit: "Hz",
      curve: "exp",
    },
  ],
  play(ctx, out, t, velocity, p) {
    const amp = velocityGain(velocity);
    const end = t + ms(p.decay) + 0.01;
    const outNode = voiceOut(ctx, out);
    const env = gain(ctx, 0);
    percEnv(env.gain, t, amp * 1.4, 0.0003, ms(p.decay));
    const bus = drive(ctx, 0.35, outNode);
    env.connect(filter(ctx, "highpass", p.tone)).connect(bus);

    const r = semis(p.tune);
    const a = osc(ctx, "triangle", 1720 * r, t, end);
    const b = osc(ctx, "square", 460 * r, t, end);
    a.connect(env);
    b.connect(gain(ctx, 0.5)).connect(env);
    return handle(outNode, b, t, end);
  },
};

// Tom: a kick with less sweep, plus a little low-passed noise.
const tom: VoiceDef = {
  label: "Tom",
  params: [
    {
      key: "tune",
      label: "Tune",
      min: 50,
      max: 400,
      default: 110,
      unit: "Hz",
      curve: "exp",
    },
    { key: "sweep", label: "Sweep", min: 0, max: 24, default: 7, unit: "st" },
    {
      key: "decay",
      label: "Decay",
      min: 50,
      max: 2000,
      default: 380,
      unit: "ms",
      curve: "exp",
    },
    { key: "noise", label: "Noise", min: 0, max: 100, default: 20, unit: "%" },
  ],
  play(ctx, out, t, velocity, p) {
    const amp = velocityGain(velocity);
    const decay = ms(p.decay);
    const end = t + decay + 0.012;
    const outNode = voiceOut(ctx, out);

    const body = osc(ctx, "sine", p.tune, t, end);
    body.frequency.setValueAtTime(p.tune * semis(p.sweep), t);
    body.frequency.setTargetAtTime(p.tune, t, decay / 6);
    const env = gain(ctx, 0);
    percEnv(env.gain, t, amp, 0.002, decay);
    body.connect(env).connect(outNode);

    if (p.noise > 0) {
      const n = noise(ctx, t, end);
      const nEnv = gain(ctx, 0);
      percEnv(nEnv.gain, t, amp * (p.noise / 100) * 0.8, 0.001, decay * 0.3);
      n.connect(filter(ctx, "lowpass", p.tune * 10))
        .connect(nEnv)
        .connect(outNode);
    }
    return handle(outNode, body, t, end);
  },
};

// Cowbell: two detuned squares through a bandpass with a two-stage decay.
const cowbell: VoiceDef = {
  label: "Cowbell",
  params: [
    { key: "tune", label: "Tune", min: -12, max: 12, default: 0, unit: "st" },
    {
      key: "decay",
      label: "Decay",
      min: 50,
      max: 1500,
      default: 350,
      unit: "ms",
      curve: "exp",
    },
    {
      key: "tone",
      label: "Tone",
      min: 400,
      max: 5000,
      default: 1100,
      unit: "Hz",
      curve: "exp",
    },
  ],
  play(ctx, out, t, velocity, p) {
    const amp = velocityGain(velocity) * 1.2;
    const end = t + ms(p.decay) + 0.01;
    const outNode = voiceOut(ctx, out);
    const env = gain(ctx, 0);
    const g = env.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(amp, t + 0.001);
    g.exponentialRampToValueAtTime(amp * 0.3, t + 0.03);
    g.exponentialRampToValueAtTime(SILENT, end - 0.01);
    g.setValueAtTime(0, end - 0.01);

    const mix = gain(ctx, 0.5);
    mix
      .connect(filter(ctx, "bandpass", p.tone, 0.9))
      .connect(env)
      .connect(outNode);
    const r = semis(p.tune);
    const a = osc(ctx, "square", 540 * r, t, end);
    const b = osc(ctx, "square", 800 * r, t, end);
    a.connect(mix);
    b.connect(mix);
    return handle(outNode, b, t, end);
  },
};

export const VOICES: Record<VoiceType, VoiceDef> = {
  kick,
  snare,
  clap,
  rim,
  hat,
  tom,
  cowbell,
};
