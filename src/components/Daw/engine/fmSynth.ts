import type { Device, FmSynthDevice } from "../model/types";
import type { DeviceInstance } from "./devices";
import { gain, ms, setParam, SILENT, velocityAmp } from "./dsp";
import { choice, describe, resolveParams, type ParamDef } from "./params";

/**
 * FM synth: four sine (or other wave) operators. An algorithm decides which
 * operators are heard (carriers) and which bend another's frequency
 * (modulators); a modulator's Level sets how hard it bends, which is what
 * makes FM bright, metallic or bell-like. Each operator has its own envelope,
 * so the tone can change over a note, like a bright attack fading to a soft
 * body in an electric piano.
 *
 * Operator feedback is left out: Web Audio delays any feedback loop by a
 * 128-sample block, so it can't be done with native nodes. Operator waves
 * other than sine stand in for that edge.
 */

export type Algorithm = {
  name: string;
  /** [from, to]: operator `from` modulates operator `to` (1-based). */
  edges: [number, number][];
  carriers: number[];
  /** Diagram position of each operator, [column, row], row 0 at the top. */
  layout: Record<number, [number, number]>;
  text: string;
};

export const ALGORITHMS: Algorithm[] = [
  {
    name: "Stack",
    edges: [
      [4, 3],
      [3, 2],
      [2, 1],
    ],
    carriers: [1],
    layout: { 4: [0, 0], 3: [0, 1], 2: [0, 2], 1: [0, 3] },
    text: "4→3→2→1, the most complex and brightest",
  },
  {
    name: "Branch",
    edges: [
      [3, 2],
      [4, 2],
      [2, 1],
    ],
    carriers: [1],
    layout: { 3: [0, 0], 4: [1, 0], 2: [0.5, 1], 1: [0.5, 2] },
    text: "3 and 4 → 2 → 1",
  },
  {
    name: "Fork",
    edges: [
      [4, 3],
      [3, 1],
      [2, 1],
    ],
    carriers: [1],
    layout: { 4: [1, 0], 3: [1, 1], 2: [0, 1], 1: [0.5, 2] },
    text: "4→3→1 and 2→1",
  },
  {
    name: "Diamond",
    edges: [
      [4, 2],
      [4, 3],
      [2, 1],
      [3, 1],
    ],
    carriers: [1],
    layout: { 4: [0.5, 0], 2: [0, 1], 3: [1, 1], 1: [0.5, 2] },
    text: "4 → 2 and 3, both → 1",
  },
  {
    name: "Two pairs",
    edges: [
      [2, 1],
      [4, 3],
    ],
    carriers: [1, 3],
    layout: { 2: [0, 0], 1: [0, 1], 4: [1, 0], 3: [1, 1] },
    text: "2→1 and 4→3 heard together, e.g. an e-piano body plus its tine",
  },
  {
    name: "Fan",
    edges: [
      [4, 1],
      [4, 2],
      [4, 3],
    ],
    carriers: [1, 2, 3],
    layout: { 4: [1, 0], 1: [0, 1], 2: [1, 1], 3: [2, 1] },
    text: "4 → 1, 2 and 3, all heard",
  },
  {
    name: "One pair",
    edges: [[4, 3]],
    carriers: [1, 2, 3],
    layout: { 1: [0, 1], 2: [1, 1], 4: [2, 0], 3: [2, 1] },
    text: "4→3, with 1 and 2 heard plain",
  },
  {
    name: "Organ",
    edges: [],
    carriers: [1, 2, 3, 4],
    layout: { 1: [0, 0], 2: [1, 0], 3: [2, 0], 4: [3, 0] },
    text: "no modulation; all four heard, like organ drawbars",
  },
];

export const FM_OPERATORS = 4;
const WAVES = ["Sine", "Triangle", "Saw", "Square"] as const;
const WAVE_TYPES: OscillatorType[] = ["sine", "triangle", "sawtooth", "square"];
/** Modulation index (peak deviation ÷ modulator frequency) at Level 100. */
const MAX_INDEX = 12;
/** Carrier mix level for one carrier, before Volume. */
const FM_MIX = 0.57;

type Unit = ParamDef["unit"];
const def = (
  key: string,
  label: string,
  min: number,
  max: number,
  value: number,
  unit: Unit,
  group: string,
  curve?: "exp",
  step?: number,
): ParamDef => ({
  key,
  label,
  min,
  max,
  default: value,
  unit,
  group,
  curve,
  step,
});

const opParams = (
  n: number,
  ratio: number,
  level: number,
  [a, d, s, r]: [number, number, number, number],
): ParamDef[] => {
  const g = `Op ${n}`;
  const k = (name: string) => `op${n}${name}`;
  return describe(
    [
      choice(k("Wave"), "Wave", WAVES, 0, g),
      def(k("Ratio"), "Ratio", 0.25, 16, ratio, undefined, g, "exp", 0.25),
      def(k("Fine"), "Fine", -50, 50, 0, "ct", g),
      def(k("Level"), "Level", 0, 100, level, "%", g),
      def(k("Vel"), "Vel", 0, 100, n === 1 ? 30 : 50, "%", g),
      def(k("Attack"), "Attack", 1, 10000, a, "ms", g, "exp"),
      def(k("Decay"), "Decay", 1, 10000, d, "ms", g, "exp"),
      def(k("Sustain"), "Sustain", 0, 100, s, "%", g),
      def(k("Release"), "Release", 1, 10000, r, "ms", g, "exp"),
    ],
    {
      [k("Wave")]:
        "Operator waveform. Sine is classic FM; the others add harmonics and grit, especially on a modulator.",
      [k("Ratio")]:
        "Frequency as a multiple of the note. Whole numbers sound harmonic; values like 3.5 or 1.25 on a modulator sound metallic or bell-like.",
      [k("Fine")]:
        "Detunes this operator in cents. A few cents on a carrier gives slow beating; on a modulator it makes the tone shimmer.",
      [k("Level")]:
        "On a carrier (heard): volume. On a modulator: how hard it bends its target. More is brighter and harsher; past about 60% it turns noisy and clangy.",
      [k("Vel")]:
        "How much velocity scales Level. On a modulator, high values make hard notes brighter.",
      [k("Attack")]:
        "Time for this operator's level to rise. On a modulator, a slow attack makes the tone brighten during the note, like brass.",
      [k("Decay")]:
        "Time to fall from the peak to Sustain. A short decay on a modulator gives a bright attack that softens: plucks, mallets, e-piano.",
      [k("Sustain")]:
        "Level held while the note is down. On a carrier, 0 makes a sound that dies away like a bell or piano.",
      [k("Release")]:
        "Time to fade after the note ends. Long carrier releases ring on.",
    },
  );
};

const CARRIER_ENV: [number, number, number, number] = [3, 600, 70, 250];
const MOD_ENV: [number, number, number, number] = [1, 400, 40, 250];

export const FM_PARAMS: ParamDef[] = [
  choice(
    "algorithm",
    "Algorithm",
    ALGORITHMS.map((a) => a.name),
    0,
    "Algorithm",
    `Which operators modulate which. Carriers are heard; modulators shape their tone. ${ALGORITHMS.map(
      (a) => `${a.name}: ${a.text}.`,
    ).join(" ")}`,
  ),
  ...opParams(1, 1, 80, CARRIER_ENV),
  ...opParams(2, 1, 40, MOD_ENV),
  ...opParams(3, 2, 0, MOD_ENV),
  ...opParams(4, 1, 0, MOD_ENV),
  ...describe(
    [
      def("lfoRate", "Rate", 0.05, 20, 5, "Hz", "LFO", "exp"),
      def("lfoPitch", "Vibrato", 0, 100, 0, "%", "LFO"),
      def("lfoIndex", "Timbre", 0, 100, 0, "%", "LFO"),
      def("octave", "Octave", -2, 2, 0, undefined, "Voice"),
      def("voices", "Voices", 1, 16, 8, undefined, "Voice"),
      def("glide", "Glide", 0, 1000, 0, "ms", "Voice"),
      def("volume", "Volume", -24, 6, 0, "dB", "Voice"),
    ],
    {
      lfoRate: "LFO speed in cycles per second.",
      lfoPitch: "Vibrato depth. 100% is ±1 semitone; 5 to 15% is subtle.",
      lfoIndex:
        "How much the LFO swells the modulators' levels, so the tone shimmers or wobbles rather than the pitch.",
      octave: "Shifts the whole sound by octaves.",
      voices:
        "How many notes can sound at once. 1 is monophonic: each new note cuts off the last.",
      glide:
        "Time for the pitch to slide from the previous note to the next. 0 is off.",
      volume: "The synth's output level.",
    },
  ),
];

const ops = (
  values: Record<
    number,
    Partial<
      Record<
        | "Wave"
        | "Ratio"
        | "Fine"
        | "Level"
        | "Vel"
        | "Attack"
        | "Decay"
        | "Sustain"
        | "Release",
        number
      >
    >
  >,
) =>
  Object.fromEntries(
    Object.entries(values).flatMap(([n, v]) =>
      Object.entries(v).map(([k, x]) => [`op${n}${k}`, x]),
    ),
  );

const algo = (name: string) => ALGORITHMS.findIndex((a) => a.name === name);

export const FM_PRESETS: Record<string, Record<string, number>> = {
  Init: {},
  "E-piano": {
    algorithm: algo("Two pairs"),
    ...ops({
      1: {
        Ratio: 1,
        Level: 80,
        Attack: 1,
        Decay: 2500,
        Sustain: 15,
        Release: 400,
      },
      2: {
        Ratio: 1,
        Level: 30,
        Vel: 70,
        Attack: 1,
        Decay: 1500,
        Sustain: 10,
        Release: 400,
      },
      3: {
        Ratio: 1,
        Fine: 3,
        Level: 35,
        Attack: 1,
        Decay: 700,
        Sustain: 0,
        Release: 300,
      },
      4: {
        Ratio: 14,
        Level: 30,
        Vel: 80,
        Attack: 1,
        Decay: 120,
        Sustain: 0,
        Release: 100,
      },
    }),
    lfoPitch: 4,
  },
  Bell: {
    algorithm: algo("Two pairs"),
    ...ops({
      1: {
        Ratio: 1,
        Level: 75,
        Attack: 1,
        Decay: 4000,
        Sustain: 0,
        Release: 3000,
      },
      2: {
        Ratio: 3.5,
        Level: 45,
        Attack: 1,
        Decay: 2500,
        Sustain: 0,
        Release: 2500,
      },
      3: {
        Ratio: 2,
        Fine: 6,
        Level: 35,
        Attack: 1,
        Decay: 2500,
        Sustain: 0,
        Release: 2000,
      },
      4: {
        Ratio: 5.75,
        Level: 30,
        Attack: 1,
        Decay: 900,
        Sustain: 0,
        Release: 900,
      },
    }),
  },
  Mallet: {
    algorithm: algo("Fork"),
    ...ops({
      1: {
        Ratio: 1,
        Level: 85,
        Attack: 1,
        Decay: 700,
        Sustain: 0,
        Release: 300,
      },
      2: {
        Ratio: 4,
        Level: 40,
        Vel: 70,
        Attack: 1,
        Decay: 60,
        Sustain: 0,
        Release: 60,
      },
      3: {
        Ratio: 10,
        Level: 15,
        Attack: 1,
        Decay: 30,
        Sustain: 0,
        Release: 30,
      },
      4: { Ratio: 1, Level: 0 },
    }),
  },
  "FM bass": {
    algorithm: algo("Stack"),
    ...ops({
      1: {
        Ratio: 1,
        Level: 85,
        Attack: 1,
        Decay: 800,
        Sustain: 70,
        Release: 60,
      },
      2: {
        Ratio: 1,
        Level: 55,
        Vel: 60,
        Attack: 1,
        Decay: 250,
        Sustain: 20,
        Release: 60,
      },
      3: {
        Ratio: 2,
        Level: 25,
        Attack: 1,
        Decay: 120,
        Sustain: 0,
        Release: 60,
      },
      4: { Ratio: 1, Level: 0 },
    }),
    octave: -1,
    voices: 1,
    glide: 30,
  },
  Brass: {
    algorithm: algo("Stack"),
    ...ops({
      1: {
        Ratio: 1,
        Level: 80,
        Attack: 40,
        Decay: 600,
        Sustain: 85,
        Release: 150,
      },
      2: {
        Ratio: 1,
        Level: 50,
        Vel: 60,
        Attack: 90,
        Decay: 400,
        Sustain: 65,
        Release: 150,
      },
      3: {
        Ratio: 1,
        Fine: 5,
        Level: 15,
        Attack: 60,
        Decay: 400,
        Sustain: 50,
        Release: 150,
      },
      4: { Ratio: 1, Level: 0 },
    }),
    lfoRate: 5.5,
    lfoPitch: 6,
  },
  "Glass pad": {
    algorithm: algo("Fan"),
    ...ops({
      1: {
        Ratio: 1,
        Level: 60,
        Attack: 600,
        Decay: 2000,
        Sustain: 80,
        Release: 2200,
      },
      2: {
        Ratio: 2,
        Fine: 5,
        Level: 35,
        Attack: 800,
        Decay: 2000,
        Sustain: 80,
        Release: 2200,
      },
      3: {
        Ratio: 0.5,
        Level: 35,
        Attack: 600,
        Decay: 2000,
        Sustain: 80,
        Release: 2200,
      },
      4: {
        Ratio: 7,
        Level: 18,
        Attack: 1200,
        Decay: 3000,
        Sustain: 60,
        Release: 2200,
      },
    }),
    lfoRate: 0.3,
    lfoIndex: 40,
  },
  Clang: {
    algorithm: algo("Diamond"),
    ...ops({
      1: {
        Ratio: 1,
        Level: 80,
        Attack: 1,
        Decay: 1800,
        Sustain: 0,
        Release: 1200,
      },
      2: {
        Ratio: 3.75,
        Level: 55,
        Attack: 1,
        Decay: 900,
        Sustain: 0,
        Release: 900,
      },
      3: {
        Ratio: 2.25,
        Level: 50,
        Attack: 1,
        Decay: 1200,
        Sustain: 0,
        Release: 900,
      },
      4: {
        Ratio: 1.5,
        Level: 40,
        Attack: 1,
        Decay: 600,
        Sustain: 0,
        Release: 600,
      },
    }),
  },
  Organ: {
    algorithm: algo("Organ"),
    ...ops({
      1: {
        Ratio: 0.5,
        Level: 60,
        Attack: 5,
        Decay: 100,
        Sustain: 100,
        Release: 80,
      },
      2: {
        Ratio: 1,
        Level: 70,
        Attack: 5,
        Decay: 100,
        Sustain: 100,
        Release: 80,
      },
      3: {
        Ratio: 2,
        Level: 40,
        Attack: 5,
        Decay: 100,
        Sustain: 100,
        Release: 80,
      },
      4: {
        Ratio: 3,
        Level: 30,
        Attack: 5,
        Decay: 100,
        Sustain: 100,
        Release: 80,
      },
    }),
    lfoRate: 6,
    lfoPitch: 8,
  },
};

const midiHz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);

type Voice = {
  pitch: number;
  start: number;
  end: number;
  releaseAt: number | null;
  release: (time: number) => void;
  choke: (time: number) => void;
};

const HELD = Number.POSITIVE_INFINITY;

export function createFmSynth(
  ctx: BaseAudioContext,
  initial: FmSynthDevice,
): DeviceInstance {
  const output = gain(ctx);
  // Shared LFO, scaled to cents for vibrato and to ±1 for timbre.
  const lfo = ctx.createOscillator();
  const vibrato = gain(ctx, 0);
  const timbre = gain(ctx, 0);
  lfo.connect(vibrato);
  lfo.connect(timbre);
  lfo.start();

  let current: FmSynthDevice | null = null;
  let p = resolveParams(FM_PARAMS, {});
  let voices: Voice[] = [];
  let lastPitch: number | null = null;

  function update(device: Device) {
    if (device.type !== "fmSynth" || device === current) return;
    p = resolveParams(FM_PARAMS, device.params);
    setParam(output.gain, 10 ** (p.volume / 20), ctx);
    setParam(lfo.frequency, p.lfoRate, ctx);
    setParam(vibrato.gain, p.lfoPitch, ctx);
    setParam(timbre.gain, p.lfoIndex / 100, ctx);
    current = device;
  }

  function startVoice(pitch: number, velocity: number, t: number): Voice {
    const algorithm = ALGORITHMS[p.algorithm] ?? ALGORITHMS[0];
    const sources: OscillatorNode[] = [];
    const cleanup: (() => void)[] = [];
    const shared = (from: AudioNode, to: AudioParam) => {
      from.connect(to);
      cleanup.push(() => from.disconnect(to));
    };

    const chokeNode = gain(ctx);
    chokeNode.connect(output);
    const mix = gain(ctx, FM_MIX / Math.sqrt(algorithm.carriers.length));
    mix.connect(chokeNode);

    const note = pitch + p.octave * 12;
    const freq = midiHz(note);
    const glideFrom =
      p.glide > 0 && lastPitch !== null
        ? midiHz(lastPitch + p.octave * 12)
        : null;

    // Each operator: oscillator → envelope → release → level, where level is
    // either volume (carrier) or frequency deviation in Hz (modulator).
    const releases: [AudioParam, number][] = [];
    const level: GainNode[] = [];
    const oscs: OscillatorNode[] = [];
    let carrierRelease = 0;
    for (let n = 1; n <= FM_OPERATORS; n++) {
      const k = (name: string) => p[`op${n}${name}`];
      const o = ctx.createOscillator();
      o.type = WAVE_TYPES[k("Wave")] ?? "sine";
      const opFreq = freq * k("Ratio");
      if (glideFrom === null) {
        o.frequency.value = opFreq;
      } else {
        o.frequency.setValueAtTime(glideFrom * k("Ratio"), t);
        o.frequency.setTargetAtTime(opFreq, t, ms(p.glide) / 3);
      }
      o.detune.value = k("Fine");
      shared(vibrato, o.detune);
      oscs.push(o);

      const env = gain(ctx, 0);
      const peak = velocityAmp(velocity, k("Vel") / 100);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + ms(k("Attack")));
      env.gain.setTargetAtTime(
        peak * (k("Sustain") / 100),
        t + ms(k("Attack")),
        ms(k("Decay")) / 4,
      );
      const rel = gain(ctx);
      const isCarrier = algorithm.carriers.includes(n);
      const amount = isCarrier
        ? k("Level") / 100
        : (k("Level") / 100) ** 2 * MAX_INDEX * opFreq;
      const out = gain(ctx, amount);
      o.connect(env).connect(rel).connect(out);
      if (!isCarrier && amount > 0) {
        // Timbre LFO swells the modulation depth by up to ±100%.
        const swell = gain(ctx, amount);
        timbre.connect(swell);
        cleanup.push(() => timbre.disconnect(swell));
        swell.connect(out.gain);
      }
      level.push(out);
      releases.push([rel.gain, ms(k("Release"))]);
      if (isCarrier) {
        out.connect(mix);
        carrierRelease = Math.max(carrierRelease, ms(k("Release")));
      }
    }
    for (const [from, to] of algorithm.edges)
      level[from - 1].connect(oscs[to - 1].frequency);
    for (const o of oscs) {
      o.start(t);
      sources.push(o);
    }

    const stopAll = (time: number) => {
      for (const s of sources) {
        try {
          s.stop(time);
        } catch {
          // Already stopped.
        }
      }
    };
    sources[0].onended = () => {
      chokeNode.disconnect();
      cleanup.forEach((fn) => fn());
    };

    const voice: Voice = {
      pitch,
      start: t,
      end: HELD,
      releaseAt: null,
      release(time) {
        if (voice.releaseAt !== null && voice.releaseAt <= time) return;
        for (const [param, length] of releases) {
          param.cancelScheduledValues(time);
          param.setValueAtTime(1, time);
          param.exponentialRampToValueAtTime(SILENT, time + length);
          param.setValueAtTime(0, time + length);
        }
        voice.releaseAt = time;
        voice.end = time + carrierRelease;
        stopAll(voice.end + 0.02);
      },
      choke(time) {
        chokeNode.gain.setTargetAtTime(0, time, 0.003);
        voice.end = Math.min(voice.end, time + 0.02);
        stopAll(time + 0.03);
      },
    };
    return voice;
  }

  function noteOn(
    pitch: number,
    velocity: number,
    time: number,
    duration?: number,
  ) {
    const now = ctx.currentTime;
    voices = voices.filter((v) => v.end > now);
    const sounding = voices.filter((v) => v.start <= time && v.end > time);
    // Steal the oldest voices when over the limit.
    for (let i = 0; i <= sounding.length - Math.max(1, p.voices); i++) {
      sounding[i].choke(time);
    }
    const voice = startVoice(pitch, velocity, time);
    voices.push(voice);
    lastPitch = pitch;
    if (duration !== undefined) voice.release(time + duration);
  }

  function noteOff(pitch: number, time: number) {
    const held = voices.find((v) => v.pitch === pitch && v.releaseAt === null);
    held?.release(Math.max(time, held.start));
  }

  function allNotesOff(time: number) {
    for (const v of voices) if (v.releaseAt === null) v.release(time);
  }

  function cancel(time: number) {
    for (const v of voices) {
      if (v.start >= time) v.choke(time);
      else if (v.end > time) v.release(time);
    }
  }

  update(initial);

  return {
    input: null,
    output,
    noteOn,
    noteOff,
    allNotesOff,
    cancel,
    update,
    dispose() {
      for (const v of voices) v.choke(ctx.currentTime);
      voices = [];
      lfo.stop();
      output.disconnect();
    },
  };
}
