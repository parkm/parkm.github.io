import type { Device, EffectDevice, EffectType } from "../model/types";
import type { DeviceEnv, DeviceInstance } from "./devices";
import {
  BUTTERWORTH_Q,
  createAlignDelay,
  createCrossover,
  createCrossoverAllpass,
  createLfo,
  createWidth,
  dbToGain,
  DRIVE_CURVE,
  DRIVE_RANGE,
  gain,
  LFO_SHAPES,
  ms,
  mulberry32,
  nativeMakeup,
  setParam,
  stereoGain,
  SYNC_DIVISIONS,
} from "./dsp";
import {
  blendMix,
  cut,
  HIGH_CUT,
  LOW_CUT,
  p,
  SEND_MIX,
  type EffectDef,
} from "./effectDef";
import { eqFx } from "./eq";
import { autoPanFx } from "./autoPan";
import { modulationFx } from "./modulation";
import { multibandFx } from "./multiband";
import { choice, describe, inGroup, resolveParams, showWhen } from "./params";
import { utilityFx } from "./utility";

/**
 * Audio effects built from native nodes. Each one sits between a dry and a
 * wet path, so bypass and dry/wet are smooth gain changes, never rewiring.
 */

export type { EffectDef } from "./effectDef";

/** Samples of delay Chrome's 4x WaveShaper oversampling adds (measured). */
const OVERSAMPLE_4X_FRAMES = 192;

// Filter ---------------------------------------------------------------------

const FILTER_TYPES = ["Low-pass", "High-pass", "Band-pass", "Notch"] as const;
const FILTER_NODE_TYPES: BiquadFilterType[] = [
  "lowpass",
  "highpass",
  "bandpass",
  "notch",
];
/** LFO depth at 100%: ±3 octaves. */
const FILTER_LFO_CENTS = 3600;

const filterFx: EffectDef = {
  label: "Filter",
  params: describe(
    [
      ...inGroup("Filter", [
        choice("type", "Type", FILTER_TYPES),
        p("frequency", "Freq", 30, 18000, 2000, "Hz", "exp"),
        p("resonance", "Reso", 0, 100, 20, "%"),
        choice("slope", "Slope", ["12 dB", "24 dB"]),
        p("drive", "Drive", 0, 100, 0, "%"),
      ]),
      ...inGroup("LFO", [
        p("lfoAmount", "Amount", 0, 100, 0, "%"),
        choice("lfoRate", "Rate", SYNC_DIVISIONS, 4),
        choice("lfoShape", "Shape", LFO_SHAPES),
      ]),
    ],
    {
      type: "Low-pass removes highs, High-pass removes lows, Band-pass keeps a band around Freq, Notch cuts a narrow band.",
      frequency: "Cutoff or centre frequency. The LFO sweeps around it.",
      resonance: "Boosts frequencies at Freq. High values whistle.",
      slope:
        "How steeply it cuts. 24 dB is stronger and more synth-like than 12 dB.",
      drive:
        "Saturates the sound going into the filter, so resonance growls instead of whistling.",
      lfoAmount:
        "How far the LFO sweeps Freq, up to 3 octaves each way. 0 is off. With a low-pass this makes a wobble or auto-filter.",
      lfoRate: "LFO speed as a note length, synced to the tempo.",
      lfoShape:
        "Sine and Triangle sweep smoothly, Square jumps between two settings, the saws ramp up or down every cycle.",
    },
  ),
  build(ctx, input, output) {
    const pre = gain(ctx);
    const shaper = ctx.createWaveShaper();
    shaper.curve = DRIVE_CURVE;
    shaper.oversample = "4x";
    const post = gain(ctx);
    const f1 = ctx.createBiquadFilter();
    const f2 = ctx.createBiquadFilter();
    input.connect(pre).connect(shaper).connect(post).connect(f1).connect(f2);
    f2.connect(output);
    const lfo = createLfo(ctx);
    const depth = gain(ctx, 0);
    lfo.output.connect(depth);
    depth.connect(f1.detune);
    depth.connect(f2.detune);
    // Low/high-pass read Q in dB (can be negative); the others need Q > 0.
    // Gliding across a type change could pass through an unstable Q, so
    // jump straight to it then.
    const setStage = (
      f: BiquadFilterNode,
      type: BiquadFilterType,
      q: number,
    ) => {
      if (f.type !== type) {
        f.type = type;
        f.Q.cancelScheduledValues(0);
        f.Q.value = q;
      } else setParam(f.Q, q, ctx);
    };
    return {
      update(v, env) {
        const type = FILTER_NODE_TYPES[v.type] ?? "lowpass";
        const passes = v.type === 0 || v.type === 1;
        const r = v.resonance / 100;
        // 24 dB runs a second stage; at 12 dB it's an all-pass (no change in level).
        const q1 = passes ? -3 + r * 27 : 0.5 + r * 15;
        const q2 = v.slope !== 1 ? Math.SQRT1_2 : passes ? BUTTERWORTH_Q : q1;
        setStage(f1, type, q1);
        setStage(f2, v.slope === 1 ? type : "allpass", q2);
        for (const f of [f1, f2]) setParam(f.frequency, v.frequency, ctx);
        // Same drive law as the synth: clean at 0, grit rather than volume.
        const k = 0.05 + (v.drive / 100) * 5;
        setParam(pre.gain, k / DRIVE_RANGE, ctx);
        setParam(
          post.gain,
          (Math.tanh(DRIVE_RANGE) / Math.tanh(k)) * (Math.tanh(k) / k) ** 0.6,
          ctx,
        );
        lfo.set(v.lfoShape, v.lfoRate, env.bpm);
        setParam(depth.gain, (v.lfoAmount / 100) * FILTER_LFO_CENTS, ctx);
      },
      clock: lfo.clock,
      dispose: lfo.stop,
    };
  },
};

// Drive ----------------------------------------------------------------------

const DRIVE_MODES = ["Soft", "Hard", "Tube", "Fold"] as const;

/**
 * Each mode's transfer curve over x in -1..1. Every shape has slope 1 at 0,
 * so the same gain law keeps quiet signals at the same level in any mode.
 */
const DRIVE_SHAPES: { range: number; shape: (u: number) => number }[] = [
  { range: DRIVE_RANGE, shape: Math.tanh },
  { range: DRIVE_RANGE, shape: (u) => Math.max(-1, Math.min(1, u)) },
  {
    // Biased tanh: clips one side earlier, for even harmonics.
    range: DRIVE_RANGE,
    shape: (u) =>
      (Math.tanh(u + 0.4) - Math.tanh(0.4)) / (1 - Math.tanh(0.4) ** 2),
  },
  // Wave folding: past the peak the wave turns back on itself.
  { range: 8, shape: Math.sin },
];

const DRIVE_CURVES = DRIVE_SHAPES.map(({ range, shape }) => {
  const n = 4096;
  const raw = Array.from({ length: n }, (_, i) =>
    shape(((i / (n - 1)) * 2 - 1) * range),
  );
  const norm = Math.max(...raw.map(Math.abs));
  return {
    range,
    norm,
    curve: Float32Array.from(raw, (y) => y / norm),
  };
});

const driveFx: EffectDef = {
  label: "Drive",
  mix: "blend",
  latency: (sampleRate) => OVERSAMPLE_4X_FRAMES / sampleRate,
  params: describe(
    [
      choice("mode", "Mode", DRIVE_MODES),
      p("drive", "Drive", 0, 100, 40, "%"),
      p("tone", "Tone", 500, 18000, 9000, "Hz", "exp"),
      p("cleanLows", "Clean lows", 20, 500, 20, "Hz", "exp"),
      p("output", "Output", -24, 6, 0, "dB"),
      blendMix(
        100,
        "Driven sound against the original. Lower it for parallel drive: grit on top while the original keeps its punch.",
      ),
    ],
    {
      mode: "Soft is warm, smooth saturation. Hard clips flat for buzz and fuzz. Tube is uneven, adding warm even harmonics. Fold bends loud peaks back on themselves for metallic, synth-like overtones.",
      drive: "Amount of saturation, from warm to fuzzy.",
      tone: "Removes harsh highs after the distortion. Lower is darker.",
      cleanLows:
        "Frequencies below this skip the drive, so bass stays tight and clean while the rest gets grit. All the way down is off.",
      output: "Level after the drive.",
    },
  ),
  build(ctx, input, output) {
    const split = createCrossover(ctx, input);
    const pre = gain(ctx);
    const shaper = ctx.createWaveShaper();
    shaper.oversample = "4x";
    // Tube's bias leaves an offset; take it out.
    const dcBlock = cut(ctx, "highpass");
    dcBlock.frequency.value = 10;
    const tone = cut(ctx, "lowpass");
    const post = gain(ctx);
    split.high.connect(pre).connect(shaper).connect(dcBlock).connect(tone);
    tone.connect(post).connect(output);
    // The clean lows wait for the oversampler so the bands line up.
    const align = ctx.createDelay(0.1);
    align.delayTime.value = OVERSAMPLE_4X_FRAMES / ctx.sampleRate;
    split.low.connect(align).connect(output);
    // Dry for Dry/Wet: same phase shift and delay as the split wet path.
    const dryPhase = createCrossoverAllpass(ctx);
    const dryDelay = createAlignDelay(
      ctx,
      OVERSAMPLE_4X_FRAMES / ctx.sampleRate,
    );
    dryPhase.output.connect(dryDelay);
    let mode = -1;
    return {
      dry: { input: dryPhase.input, output: dryDelay },
      update(v) {
        const curve = DRIVE_CURVES[v.mode] ?? DRIVE_CURVES[0];
        if (v.mode !== mode) {
          mode = v.mode;
          shaper.curve = curve.curve;
        }
        const k = 0.4 + (v.drive / 100) * 6;
        setParam(pre.gain, k / curve.range, ctx);
        // Quiet signals pass at unity at 0% and get (k/0.4)^0.25 louder (+6 dB)
        // at full, so drive adds grit more than volume.
        setParam(
          post.gain,
          ((curve.norm * (k / 0.4) ** 0.25) / k) * dbToGain(v.output),
          ctx,
        );
        setParam(tone.frequency, v.tone, ctx);
        // Off parks the crossover at 10 Hz, below anything audible.
        split.set(v.cleanLows <= 20 ? 10 : v.cleanLows);
        dryPhase.set(v.cleanLows <= 20 ? 10 : v.cleanLows);
      },
    };
  },
};

// Delay ----------------------------------------------------------------------

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
const sync = (v: Record<string, number>) => v.mode === 0;

const delayFx: EffectDef = {
  label: "Delay",
  mix: "send",
  params: describe(
    [
      ...inGroup("Time", [
        choice("mode", "Mode", ["Sync", "Free"]),
        ...showWhen(sync, [
          choice("timeL", "Left", DELAY_TIMES, 3),
          choice("timeR", "Right", DELAY_TIMES, 3),
        ]),
        ...showWhen(
          (v) => !sync(v),
          [
            p("msL", "Left", 1, 2000, 300, "ms", "exp"),
            p("msR", "Right", 1, 2000, 300, "ms", "exp"),
          ],
        ),
      ]),
      ...inGroup("Feedback", [
        p("feedback", "Feedback", 0, 95, 40, "%"),
        choice("pingPong", "Ping-pong", ["Off", "On"], 1),
        p("wobble", "Wobble", 0, 100, 0, "%"),
      ]),
      ...inGroup("Echoes", [
        LOW_CUT(
          100,
          "Removes lows from the echoes so they don't muddy the bass. Each repeat gets thinner.",
        ),
        HIGH_CUT(
          5000,
          "Removes highs from the echoes, so each repeat gets darker. Lower sounds like tape.",
        ),
        SEND_MIX,
      ]),
    ],
    {
      mode: "Sync sets the echo time as a note length that follows the tempo. Free sets it in milliseconds.",
      timeL:
        "Left echo time, synced to the tempo. T is a triplet, D is dotted. Different left and right times make a wide, bouncing echo.",
      timeR: "Right echo time, synced to the tempo.",
      msL: "Left echo time in milliseconds. Short times (20 to 80 ms) give slapback and doubling.",
      msR: "Right echo time in milliseconds.",
      feedback: "How much each echo feeds the next. Higher repeats longer.",
      pingPong: "On bounces the echoes between left and right.",
      wobble:
        "Slow, uneven pitch drift on the echoes, like a worn tape machine.",
    },
  ),
  build(ctx, input, output) {
    const stereo = stereoGain(ctx);
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    input.connect(stereo).connect(split);

    const side = () => {
      const delay = ctx.createDelay(4);
      const low = cut(ctx, "highpass");
      const high = cut(ctx, "lowpass");
      delay.connect(low).connect(high);
      return { delay, low, high, self: gain(ctx, 0), cross: gain(ctx, 0) };
    };
    const L = side();
    const R = side();
    // Straight feedback feeds each side back into itself; ping-pong crosses over.
    L.high.connect(L.self).connect(L.delay);
    R.high.connect(R.self).connect(R.delay);
    L.high.connect(L.cross).connect(R.delay);
    R.high.connect(R.cross).connect(L.delay);
    L.high.connect(merge, 0, 0);
    R.high.connect(merge, 0, 1);
    merge.connect(output);

    const inL = gain(ctx);
    const inR = gain(ctx);
    const inRtoL = gain(ctx, 0);
    split.connect(inL, 0).connect(L.delay);
    split.connect(inR, 1).connect(R.delay);
    split.connect(inRtoL, 1).connect(L.delay);

    // Wobble: a slow drift plus a little flutter on the delay times,
    // opposite on each side so it also widens.
    const drift = ctx.createOscillator();
    const flutter = ctx.createOscillator();
    drift.frequency.value = 0.7;
    flutter.frequency.value = 5.3;
    const driftDepth = gain(ctx, 0);
    const flutterDepth = gain(ctx, 0);
    drift.connect(driftDepth);
    flutter.connect(flutterDepth);
    const flip = gain(ctx, -1);
    for (const depth of [driftDepth, flutterDepth]) {
      depth.connect(L.delay.delayTime);
      depth.connect(flip);
    }
    flip.connect(R.delay.delayTime);
    drift.start();
    flutter.start();

    return {
      update(v, env) {
        const time = (division: number, msValue: number) =>
          Math.min(
            4,
            sync(v)
              ? ((DELAY_BEATS[division] ?? 0.5) * 60) / env.bpm
              : ms(msValue),
          );
        const fb = v.feedback / 100;
        const ping = v.pingPong === 1;
        for (const [s, t] of [
          [L, time(v.timeL, v.msL)],
          [R, time(v.timeR, v.msR)],
        ] as const) {
          setParam(s.delay.delayTime, t, ctx);
          setParam(s.low.frequency, v.lowCut, ctx);
          setParam(s.high.frequency, v.highCut, ctx);
          setParam(s.self.gain, ping ? 0 : fb, ctx);
          setParam(s.cross.gain, ping ? fb : 0, ctx);
        }
        // Ping-pong sums the input into the left delay so echoes alternate L, R, L…
        setParam(inR.gain, ping ? 0 : 1, ctx);
        setParam(inRtoL.gain, ping ? 1 : 0, ctx);
        const w = v.wobble / 100;
        setParam(driftDepth.gain, w * 0.003, ctx);
        setParam(flutterDepth.gain, w * 0.0003, ctx);
      },
      dispose() {
        drift.stop();
        flutter.stop();
      },
    };
  },
};

// Reverb ---------------------------------------------------------------------

const REVERB_TYPES = ["Room", "Hall", "Plate"] as const;

// Reverb impulses: seeded decaying noise, cached by sample rate, length and type.
const impulses = new Map<string, AudioBuffer>();

/**
 * Room: a few distinct early reflections, then a tail that darkens quickly.
 * Hall: no early slap, a tail that swells in and darkens slowly.
 * Plate: dense and bright from the first moment.
 */
function impulse(ctx: BaseAudioContext, seconds: number, type: number) {
  const sr = ctx.sampleRate;
  const length = Math.max(1, Math.round(seconds * sr));
  const key = `${sr}:${length}:${type}`;
  let buffer = impulses.get(key);
  if (buffer) return buffer;
  buffer = ctx.createBuffer(2, length, sr);
  const fadeIn = Math.round(sr * [0.008, 0.035, 0.001][type]);
  // One-pole low-pass that closes over the tail: highs die before lows.
  const [brightStart, brightEnd] = [
    [0.7, 0.08],
    [0.6, 0.15],
    [0.95, 0.35],
  ][type];
  for (let c = 0; c < 2; c++) {
    const rand = mulberry32(0x5eed + c + type * 7);
    const data = buffer.getChannelData(c);
    let y = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // -60 dB at the end of the impulse.
      const env = Math.exp(-6.9 * t) * Math.min(1, i / fadeIn);
      const a = brightStart + (brightEnd - brightStart) * t;
      y += a * (rand() * 2 - 1 - y);
      // The low-pass also lowers the noise level; put it back so only the tone changes.
      data[i] = y * env * Math.sqrt((2 - a) / a);
    }
    if (type === 0) {
      // Early reflections: walls a few metres away, different on each side.
      for (let r = 0; r < 8; r++) {
        const at = Math.round(sr * (0.004 + rand() * 0.05));
        if (at < length) data[at] += (rand() < 0.5 ? -1 : 1) * (0.9 - r * 0.08);
      }
    }
  }
  if (impulses.size > 16) impulses.clear();
  impulses.set(key, buffer);
  return buffer;
}

const reverbFx: EffectDef = {
  label: "Reverb",
  mix: "send",
  params: describe(
    [
      ...inGroup("Space", [
        choice("type", "Type", REVERB_TYPES, 1),
        p("decay", "Decay", 0.3, 12, 2.2, "s", "exp"),
        p("predelay", "Pre-delay", 0, 200, 15, "ms"),
        p("width", "Width", 0, 150, 100, "%"),
      ]),
      ...inGroup("Tone", [
        LOW_CUT(
          150,
          "Removes lows from the reverb. The single best fix for a muddy mix: try 200 to 400 Hz on anything but pads.",
        ),
        HIGH_CUT(
          7000,
          "Removes highs from the reverb. Lower is darker and softer, and sits further back.",
        ),
        SEND_MIX,
      ]),
    ],
    {
      type: "Room is small and close, with audible early reflections. Hall swells in and lingers. Plate is dense and bright, classic on vocals and snares.",
      decay: "Length of the reverb tail, from a small room to a huge hall.",
      predelay:
        "Gap before the reverb starts. Keeps the original sound clear of the room.",
      width:
        "Stereo spread of the reverb. 0% is mono, 100% natural, above that extra wide.",
    },
  ),
  build(ctx, input, output) {
    const predelay = ctx.createDelay(0.5);
    const convolver = ctx.createConvolver();
    const low = cut(ctx, "highpass");
    const high = cut(ctx, "lowpass");
    const width = createWidth(ctx);
    input.connect(predelay).connect(convolver).connect(low).connect(high);
    high.connect(width.input);
    width.output.connect(output);

    let applied = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const live = !(ctx instanceof OfflineAudioContext);
    return {
      update(v) {
        setParam(predelay.delayTime, ms(v.predelay), ctx);
        setParam(low.frequency, v.lowCut, ctx);
        setParam(high.frequency, v.highCut, ctx);
        width.set(v.width / 100);
        const decay = Math.round(v.decay * 20) / 20;
        const next = `${decay}:${v.type}`;
        if (next === applied) return;
        applied = next;
        // Regenerating a long impulse is costly; while a knob is dragging, do it once it settles.
        clearTimeout(timer);
        const apply = () => (convolver.buffer = impulse(ctx, decay, v.type));
        if (live && convolver.buffer) timer = setTimeout(apply, 80);
        else apply();
      },
      dispose: () => clearTimeout(timer),
    };
  },
};

// Compressor -------------------------------------------------------------------

const compressorFx: EffectDef = {
  label: "Compressor",
  mix: "blend",
  // The native compressor looks ahead 6 ms.
  latency: () => 0.006,
  params: describe(
    [
      ...inGroup("Compression", [
        p("threshold", "Threshold", -60, 0, -18, "dB"),
        p("ratio", "Ratio", 1, 20, 4),
        p("attack", "Attack", 0.1, 100, 10, "ms", "exp"),
        p("release", "Release", 10, 1000, 150, "ms", "exp"),
        p("knee", "Knee", 0, 30, 6, "dB"),
      ]),
      ...inGroup("Output", [
        choice("makeup", "Makeup", ["Off", "Auto"]),
        p("output", "Output", -24, 24, 0, "dB"),
        blendMix(
          100,
          "Compressed sound against the original. Around 30 to 50% is parallel (New York) compression: density and sustain without losing the hits.",
        ),
      ]),
    ],
    {
      threshold:
        "Level above which it starts turning the sound down. Lower compresses more.",
      ratio:
        "How hard sound above the threshold is turned down. 2 is gentle, 4 typical, 10 and up limits.",
      attack:
        "How fast it reacts. Fast tames peaks; slower lets the initial hit punch through.",
      release: "How fast it lets go after the level drops.",
      knee: "How gradually compression starts around the threshold. 0 is abrupt and obvious; higher is smoother and more transparent.",
      makeup:
        "Auto turns the sound back up by an estimate of what compression took away, so harder settings also sound louder. Off leaves the level to Output, which makes it easier to judge what the compressor is doing.",
      output:
        "Level after compression. Use it to match the level with the compressor on and off.",
    },
  ),
  build(ctx, input, output) {
    const comp = ctx.createDynamicsCompressor();
    const makeup = gain(ctx);
    input.connect(comp).connect(makeup).connect(output);
    return {
      update(v) {
        setParam(comp.threshold, v.threshold, ctx);
        setParam(comp.ratio, v.ratio, ctx);
        setParam(comp.attack, ms(v.attack), ctx);
        setParam(comp.release, ms(v.release), ctx);
        setParam(comp.knee, v.knee, ctx);
        // Undo the node's built-in makeup unless Auto asks for it.
        const native = nativeMakeup(v.threshold, v.knee, v.ratio);
        setParam(
          makeup.gain,
          dbToGain(v.output) / (v.makeup === 1 ? 1 : native),
          ctx,
        );
      },
      reduction: () => comp.reduction,
    };
  },
};

export const EFFECTS: Record<EffectType, EffectDef> = {
  eq: eqFx,
  filter: filterFx,
  drive: driveFx,
  compressor: compressorFx,
  delay: delayFx,
  reverb: reverbFx,
  multiband: multibandFx,
  modulation: modulationFx,
  autoPan: autoPanFx,
  utility: utilityFx,
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
  input.connect(wetIn);
  wet.connect(output);
  const built = def.build(ctx, wetIn, wet);
  const latency = def.latency?.(ctx.sampleRate) ?? 0;
  if (built.dry) {
    input.connect(built.dry.input);
    built.dry.output.connect(dry);
  } else if (latency > 0) {
    const align = ctx.createDelay(Math.max(1, latency * 2));
    align.delayTime.value = latency;
    input.connect(align).connect(dry);
  } else {
    input.connect(dry);
  }
  dry.connect(output);

  let current: EffectDevice | null = null;
  let bpm = 0;

  function update(device: Device, env: DeviceEnv) {
    if (device.type !== initial.type || (device === current && env.bpm === bpm))
      return;
    const effect = device as EffectDevice;
    const v = resolveParams(def.params, effect.params);
    built.update(v, env);
    const mix = def.mix ? v.mix / 100 : 1;
    const [dryGain, wetGain] =
      def.mix === "send"
        ? // Up to 50% keeps the dry signal at full level, like a send.
          [Math.min(1, 2 * (1 - mix)), Math.min(1, 2 * mix)]
        : [1 - mix, mix];
    setParam(dry.gain, effect.bypass ? 1 : dryGain, ctx);
    setParam(wet.gain, effect.bypass ? 0 : wetGain, ctx);
    current = effect;
    bpm = env.bpm;
  }

  update(initial, initialEnv);

  return {
    input,
    output,
    update,
    reduction: built.reduction,
    clock: built.clock,
    dispose() {
      built.dispose?.();
      output.disconnect();
    },
  };
}
