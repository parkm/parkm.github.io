import type { Device, SynthDevice } from "../model/types";
import type { DeviceEnv, DeviceInstance } from "./devices";
import {
  DRIVE_CURVE,
  DRIVE_RANGE,
  gain,
  ms,
  noise,
  setParam,
  SILENT,
  velocityGain,
} from "./dsp";
import { choice, describe, resolveParams, type ParamDef } from "./params";

/**
 * Subtractive polysynth in the spirit of Ableton's Analog: three oscillators
 * with unison, noise, a 12/24 dB filter, three envelopes, two LFOs, and a
 * modulation matrix. Each note builds a one-shot voice graph.
 *
 * Envelopes are split across gain stages that multiply (attack/decay/sustain
 * × release × choke), so a release can be scheduled at any time, even
 * mid-attack and ahead of time, without cancelling automation. That avoids
 * needing cancelAndHoldAtTime (missing in Firefox).
 *
 * Cutoff, resonance and the LFOs are shared sources connected into every
 * voice, so turning those knobs moves held notes too.
 */

const WAVES = ["Sine", "Triangle", "Saw", "Square", "Pulse"] as const;
const WAVE_TYPES: OscillatorType[] = ["sine", "triangle", "sawtooth", "square"];
const PULSE = 4;
const FILTER_TYPES = ["Low-pass", "High-pass", "Band-pass"] as const;
const FILTER_NODE_TYPES: BiquadFilterType[] = [
  "lowpass",
  "highpass",
  "bandpass",
];
const LFO_WAVES = ["Sine", "Triangle", "Saw", "Square"] as const;
const LFO_DIVISIONS = [
  "4 bars",
  "2 bars",
  "1 bar",
  "1/2",
  "1/4",
  "1/8",
  "1/16",
  "1/4T",
  "1/8T",
] as const;
const LFO_BEATS = [16, 8, 4, 2, 1, 0.5, 0.25, 2 / 3, 1 / 3];

export const MOD_SOURCES = [
  "Off",
  "LFO 1",
  "LFO 2",
  "Mod env",
  "Filter env",
  "Velocity",
  "Key",
] as const;
export const MOD_DESTINATIONS = [
  "Pitch",
  "Osc 1 pitch",
  "Osc 2 pitch",
  "Osc 3 pitch",
  "Cutoff",
  "Resonance",
  "Amp",
  "Pan",
  "Osc 1 level",
  "Osc 2 level",
  "Osc 3 level",
  "Noise",
] as const;
/** What 100% means for each destination, in the param's own units. */
const DEST_SCALE = [1200, 2400, 2400, 2400, 6000, 20, 1, 1, 1, 1, 1, 0.5];
export const MOD_SLOTS = 6;

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
): ParamDef => ({ key, label, min, max, default: value, unit, group, curve });

const oscParams = (
  n: number,
  wave: number,
  level: number,
  fine: number,
  octave = 0,
): ParamDef[] => {
  const g = `Osc ${n}`;
  const k = (name: string) => `osc${n}${name}`;
  return describe(
    [
      choice(k("Wave"), "Wave", WAVES, wave, g),
      def(k("Pw"), "Width", 5, 95, 50, "%", g),
      def(k("Octave"), "Octave", -3, 3, octave, undefined, g),
      def(k("Semi"), "Semi", -12, 12, 0, "st", g),
      def(k("Fine"), "Fine", -50, 50, fine, "ct", g),
      def(k("Level"), "Level", 0, 100, level, "%", g),
    ],
    {
      [k("Wave")]:
        "Waveform. Sine is pure, Triangle soft, Saw bright and buzzy, Square hollow, Pulse thin and nasal (shaped by Width).",
      [k("Pw")]:
        "Pulse width, used only by the Pulse wave. 50% sounds like a square; narrower is thinner.",
      [k("Octave")]: "Shifts this oscillator by whole octaves.",
      [k("Semi")]:
        "Shifts this oscillator in semitones. 7 adds a fifth, 12 an octave.",
      [k("Fine")]:
        "Detunes this oscillator in cents. A few cents against another oscillator gives a slow, chorus-like beating.",
      [k("Level")]: "This oscillator's volume into the filter. 0 turns it off.",
    },
  );
};

const ENV_TEXT: Record<string, [string, string, string, string]> = {
  "Amp env": [
    "Fade-in time of each note. Long attacks swell, like pads and strings.",
    "Time to fall from full volume to the Sustain level.",
    "Volume held while a note is held down. 0 makes plucked or percussive sounds.",
    "Fade-out time after a note ends. Long releases ring on.",
  ],
  "Filter env": [
    "Time for the filter envelope to rise to its peak, sweeping the cutoff by Env.",
    "Time for the filter envelope to fall from its peak to Sustain.",
    "Filter envelope level held while a note is held down.",
    "Time for the filter envelope to return to zero after a note ends.",
  ],
  "Mod env": [
    "Rise time of the mod envelope. It does nothing unless a Modulation row uses Mod env as its source.",
    "Time for the mod envelope to fall from its peak to Sustain.",
    "Mod envelope level held while a note is held down.",
    "Time for the mod envelope to return to zero after a note ends.",
  ],
};

const envParams = (
  prefix: string,
  group: string,
  a: number,
  d: number,
  s: number,
  r: number,
): ParamDef[] => {
  const k = (name: string) =>
    prefix ? `${prefix}${name}` : name.toLowerCase();
  const [attack, decay, sustain, release] = ENV_TEXT[group];
  return describe(
    [
      def(k("Attack"), "Attack", 1, 10000, a, "ms", group, "exp"),
      def(k("Decay"), "Decay", 1, 10000, d, "ms", group, "exp"),
      def(k("Sustain"), "Sustain", 0, 100, s, "%", group),
      def(k("Release"), "Release", 1, 10000, r, "ms", group, "exp"),
    ],
    {
      [k("Attack")]: attack,
      [k("Decay")]: decay,
      [k("Sustain")]: sustain,
      [k("Release")]: release,
    },
  );
};

const lfoParams = (n: number): ParamDef[] => {
  const g = `LFO ${n}`;
  const k = (name: string) => `lfo${n}${name}`;
  return describe(
    [
      choice(k("Wave"), "Wave", LFO_WAVES, 0, g),
      choice(k("Sync"), "Mode", ["Free", "Sync"], 1, g),
      def(k("Rate"), "Rate", 0.05, 30, 2, "Hz", g, "exp"),
      choice(k("Division"), "Division", LFO_DIVISIONS, 4, g),
      def(k("Fade"), "Fade in", 0, 3000, 0, "ms", g),
    ],
    {
      [k("Wave")]:
        `LFO ${n} shape: smooth Sine or Triangle, ramping Saw, or Square jumping between two values. An LFO does nothing unless a Modulation row uses it.`,
      [k("Sync")]:
        "Free runs at Rate in Hz. Sync follows the tempo using Division.",
      [k("Rate")]: "Speed in cycles per second, used when Mode is Free.",
      [k("Division")]:
        "Speed as a note length, used when Mode is Sync. 1/4 is one cycle per beat; T is a triplet.",
      [k("Fade")]:
        "Delays the LFO's effect after each note starts: silent for the first half, then fading in. Good for delayed vibrato.",
    },
  );
};

const modParams = (n: number): ParamDef[] =>
  describe(
    [
      choice(`mod${n}Src`, "Source", MOD_SOURCES, 0, "Modulation"),
      choice(`mod${n}Dst`, "Target", MOD_DESTINATIONS, 4, "Modulation"),
      def(`mod${n}Amt`, "Amount", -100, 100, 0, "%", "Modulation"),
    ],
    {
      [`mod${n}Src`]:
        "What drives this modulation row. LFOs and envelopes move during the note; Velocity and Key are fixed per note (Key runs from -1 five octaves below middle C to +1 five above). Off disables the row.",
      [`mod${n}Dst`]:
        "What this row changes. At 100%: Pitch moves ±1 octave, an oscillator's pitch ±2 octaves, Cutoff ±5 octaves; Amp, Pan and levels move across their full range.",
      [`mod${n}Amt`]:
        "Depth of this row; negative inverts it. For vibrato try LFO → Pitch at 1 to 5%; for a wobble, LFO → Cutoff at 30 to 60%.",
    },
  );

export const SYNTH_PARAMS: ParamDef[] = [
  ...oscParams(1, 2, 80, 0),
  ...oscParams(2, 2, 60, 7),
  ...oscParams(3, 0, 0, 0, -1),
  ...describe(
    [
      def("noise", "Noise", 0, 100, 0, "%", "Mixer"),
      def("unison", "Unison", 1, 7, 1, undefined, "Mixer"),
      def("detune", "Detune", 0, 100, 15, "ct", "Mixer"),
      def("spread", "Spread", 0, 100, 50, "%", "Mixer"),
      choice("filterType", "Type", FILTER_TYPES, 0, "Filter"),
      choice("slope", "Slope", ["12 dB", "24 dB"], 0, "Filter"),
      def("cutoff", "Cutoff", 30, 18000, 1800, "Hz", "Filter", "exp"),
      def("resonance", "Reso", 0, 100, 15, "%", "Filter"),
      def("filterEnv", "Env", -48, 48, 24, "st", "Filter"),
      def("keyTrack", "Key", 0, 100, 50, "%", "Filter"),
      def("velFilter", "Vel", 0, 100, 30, "%", "Filter"),
    ],
    {
      noise: "White noise mixed into the filter, for breath, air or hiss.",
      unison:
        "Copies of each oscillator per note, detuned and panned apart for a thicker, wider sound.",
      detune:
        "How far apart the unison copies are tuned. Needs Unison above 1.",
      spread:
        "How far apart the unison copies are panned. Needs Unison above 1.",
      filterType:
        "Low-pass removes highs (darker), High-pass removes lows (thinner), Band-pass keeps a band around the cutoff.",
      slope:
        "How steeply the filter cuts. 24 dB is stronger and more classic-synth than 12 dB.",
      cutoff:
        "Filter frequency. With low-pass, lower is darker and more muffled. The filter envelope, Key and modulation move it from here.",
      resonance:
        "Boosts frequencies right at the cutoff. High values whistle and squelch.",
      filterEnv:
        "How far the filter envelope moves the cutoff, in semitones. Positive opens the filter at the start of each note; negative closes it.",
      keyTrack:
        "How much the cutoff follows the note's pitch. At 100% high and low notes keep the same tone; at 0% high notes sound darker.",
      velFilter:
        "How much velocity scales the filter envelope. Higher makes soft notes darker and hard notes brighter.",
    },
  ),
  ...envParams("f", "Filter env", 2, 350, 20, 300),
  ...envParams("", "Amp env", 3, 600, 70, 250),
  ...envParams("m", "Mod env", 1, 500, 0, 300),
  ...lfoParams(1),
  ...lfoParams(2),
  ...Array.from({ length: MOD_SLOTS }, (_, i) => modParams(i + 1)).flat(),
  ...describe(
    [
      def("voices", "Voices", 1, 16, 8, undefined, "Voice"),
      def("glide", "Glide", 0, 1000, 0, "ms", "Voice"),
      def("drive", "Drive", 0, 100, 0, "%", "Voice"),
      def("volume", "Volume", -24, 6, 0, "dB", "Voice"),
    ],
    {
      voices:
        "How many notes can sound at once. 1 is monophonic: each new note cuts off the last.",
      glide:
        "Time for the pitch to slide from the previous note to the next. 0 is off.",
      drive: "Saturation after the voices, for grit and extra harmonics.",
      volume: "The synth's output level.",
    },
  ),
];

const mod = (n: number, src: number, dst: number, amt: number) => ({
  [`mod${n}Src`]: src,
  [`mod${n}Dst`]: dst,
  [`mod${n}Amt`]: amt,
});

export const SYNTH_PRESETS: Record<string, Record<string, number>> = {
  Init: {},
  Bass: {
    osc1Wave: 2,
    osc1Octave: -1,
    osc2Wave: 3,
    osc2Octave: -1,
    osc2Fine: -5,
    osc2Level: 45,
    osc3Wave: 0,
    osc3Octave: -2,
    osc3Level: 40,
    cutoff: 260,
    resonance: 25,
    filterEnv: 30,
    fDecay: 220,
    fSustain: 0,
    attack: 1,
    decay: 400,
    sustain: 80,
    release: 60,
    voices: 1,
    glide: 40,
  },
  Lead: {
    osc1Wave: 2,
    osc2Wave: 4,
    osc2Pw: 30,
    osc2Octave: 1,
    osc2Fine: 4,
    osc2Level: 35,
    cutoff: 2400,
    resonance: 30,
    filterEnv: 18,
    fDecay: 500,
    fSustain: 40,
    attack: 4,
    sustain: 85,
    release: 180,
    voices: 1,
    glide: 70,
    ...mod(1, 1, 0, 2),
    lfo1Sync: 0,
    lfo1Rate: 5.5,
  },
  Pad: {
    osc1Wave: 2,
    osc2Wave: 2,
    osc2Octave: 1,
    osc2Level: 50,
    unison: 3,
    detune: 22,
    spread: 80,
    cutoff: 1100,
    resonance: 10,
    filterEnv: 12,
    fAttack: 900,
    fDecay: 2000,
    fSustain: 60,
    fRelease: 2500,
    attack: 700,
    decay: 1500,
    sustain: 85,
    release: 2200,
    ...mod(1, 2, 4, 8),
    lfo2Sync: 0,
    lfo2Rate: 0.2,
  },
  Pluck: {
    osc1Wave: 3,
    osc2Wave: 2,
    osc2Octave: 1,
    osc2Level: 40,
    cutoff: 500,
    resonance: 35,
    filterEnv: 40,
    fDecay: 180,
    fSustain: 0,
    fRelease: 150,
    attack: 1,
    decay: 450,
    sustain: 0,
    release: 300,
  },
  Supersaw: {
    osc1Wave: 2,
    osc2Wave: 2,
    osc2Octave: -1,
    osc2Level: 45,
    unison: 7,
    detune: 35,
    spread: 100,
    cutoff: 5000,
    resonance: 5,
    filterEnv: 8,
    attack: 5,
    sustain: 90,
    release: 400,
    volume: -3,
  },
  Wobble: {
    osc1Wave: 2,
    osc1Octave: -1,
    osc2Wave: 3,
    osc2Octave: -1,
    osc2Fine: -8,
    osc2Level: 60,
    osc3Wave: 0,
    osc3Octave: -2,
    osc3Level: 50,
    slope: 1,
    cutoff: 300,
    resonance: 45,
    filterEnv: 0,
    voices: 1,
    glide: 30,
    attack: 2,
    sustain: 100,
    release: 80,
    ...mod(1, 1, 4, 55),
    lfo1Division: 5,
  },
};

const midiHz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);

/** Voice filters sit at this frequency; the shared cutoff source detunes them to the real cutoff. */
const REF_CUTOFF = 1000;
const cutoffCents = (hz: number) => 1200 * Math.log2(hz / REF_CUTOFF);

/** Low/high-pass Q is in dB in Web Audio (-3 is flat); band-pass Q is a plain quality factor. */
const resonanceQ = (filterType: number, amount: number) =>
  filterType === 2 ? 0.5 + amount * 15 : -3 + amount * 27;
const flatQ = (filterType: number) => (filterType === 2 ? 0.7 : -3.01);

// Pulse waves as PeriodicWaves (the browser band-limits them), cached by width.
const pulses = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
function pulseWave(ctx: BaseAudioContext, widthPercent: number) {
  let cache = pulses.get(ctx);
  if (!cache) pulses.set(ctx, (cache = new Map()));
  const w = Math.round(widthPercent);
  let wave = cache.get(w);
  if (!wave) {
    const n = 256;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    const d = w / 100;
    for (let k = 1; k < n; k++) {
      real[k] = (2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * d);
      imag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * d));
    }
    wave = ctx.createPeriodicWave(real, imag);
    cache.set(w, wave);
  }
  return wave;
}

type Voice = {
  pitch: number;
  start: number;
  end: number;
  releaseAt: number | null;
  release: (time: number) => void;
  choke: (time: number) => void;
};

type ModSlot = { src: number; dst: number; amount: number };

const HELD = Number.POSITIVE_INFINITY;

export function createSynth(
  ctx: BaseAudioContext,
  initial: SynthDevice,
  initialEnv: DeviceEnv,
): DeviceInstance {
  // Voices → drive → volume. Drive is unity for quiet signals at 0 and
  // adds at most ~6 dB at full, so it changes tone more than level.
  const voiceBus = gain(ctx);
  const shaper = ctx.createWaveShaper();
  shaper.curve = DRIVE_CURVE;
  shaper.oversample = "4x";
  const drivePost = gain(ctx);
  const output = gain(ctx);
  voiceBus.connect(shaper).connect(drivePost).connect(output);
  const cutoff = ctx.createConstantSource();
  const resonance = ctx.createConstantSource();
  const lfos = [ctx.createOscillator(), ctx.createOscillator()];
  for (const node of [cutoff, resonance, ...lfos]) node.start();

  let current: SynthDevice | null = null;
  let bpm = 0;
  let p = resolveParams(SYNTH_PARAMS, {});
  let mods: ModSlot[] = [];
  let voices: Voice[] = [];
  let lastPitch: number | null = null;

  function update(device: Device, env: DeviceEnv) {
    if (device.type !== "synth" || (device === current && env.bpm === bpm))
      return;
    p = resolveParams(SYNTH_PARAMS, device.params);
    setParam(cutoff.offset, cutoffCents(p.cutoff), ctx);
    setParam(
      resonance.offset,
      resonanceQ(p.filterType, p.resonance / 100),
      ctx,
    );
    setParam(output.gain, 10 ** (p.volume / 20), ctx);
    const k = 0.05 + (p.drive / 100) * 5;
    setParam(voiceBus.gain, k / DRIVE_RANGE, ctx);
    setParam(
      drivePost.gain,
      (Math.tanh(DRIVE_RANGE) / Math.tanh(k)) * (Math.tanh(k) / k) ** 0.6,
      ctx,
    );
    lfos.forEach((lfo, i) => {
      const n = i + 1;
      lfo.type = WAVE_TYPES[p[`lfo${n}Wave`]] ?? "sine";
      const hz = p[`lfo${n}Sync`]
        ? env.bpm / 60 / (LFO_BEATS[p[`lfo${n}Division`]] ?? 1)
        : p[`lfo${n}Rate`];
      setParam(lfo.frequency, hz, ctx);
    });
    mods = [];
    for (let n = 1; n <= MOD_SLOTS; n++) {
      const src = p[`mod${n}Src`];
      const amount = p[`mod${n}Amt`] / 100;
      if (src > 0 && amount !== 0)
        mods.push({ src, dst: p[`mod${n}Dst`], amount });
    }
    current = device;
    bpm = env.bpm;
  }

  function startVoice(pitch: number, velocity: number, t: number): Voice {
    const sources: AudioScheduledSourceNode[] = [];
    const cleanup: (() => void)[] = [];
    // Shared sources keep a reference to anything they feed, so unhook them when the voice ends.
    const connectShared = (from: AudioNode, to: AudioNode | AudioParam) => {
      if (to instanceof AudioParam) {
        from.connect(to);
        cleanup.push(() => from.disconnect(to));
      } else {
        from.connect(to);
        cleanup.push(() => from.disconnect(to));
      }
    };

    // Output stages: amp env → amp mod → pan → release → choke.
    const chokeNode = gain(ctx);
    chokeNode.connect(voiceBus);
    const rel = gain(ctx);
    const panner = ctx.createStereoPanner();
    const ampMod = gain(ctx);
    const env = gain(ctx, 0);
    env.connect(ampMod).connect(panner).connect(rel).connect(chokeNode);

    // Filter: one or two biquads. Resonance goes on the last; the first stays flat.
    const type = FILTER_NODE_TYPES[p.filterType] ?? "lowpass";
    const filters = Array.from({ length: p.slope ? 2 : 1 }, () => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = REF_CUTOFF;
      f.detune.value = (pitch - 60) * p.keyTrack;
      connectShared(cutoff, f.detune);
      return f;
    });
    const lastFilter = filters[filters.length - 1];
    lastFilter.Q.value = 0;
    connectShared(resonance, lastFilter.Q);
    if (filters.length > 1) {
      filters[0].Q.value = flatQ(p.filterType);
      filters[0].connect(lastFilter);
    }
    lastFilter.connect(env);

    // Oscillators, each stacked into unison copies spread across detune and pan.
    const freq = midiHz(pitch);
    const glideFrom =
      p.glide > 0 && lastPitch !== null ? midiHz(lastPitch) : null;
    const unison = Math.max(1, Math.round(p.unison));
    const oscDetune: AudioParam[][] = [[], [], []];
    const oscLevel: GainNode[] = [];
    const allDetune: AudioParam[] = [];
    for (let n = 1; n <= 3; n++) {
      const level = gain(ctx, p[`osc${n}Level`] / 100 / Math.sqrt(unison));
      oscLevel.push(level);
      const modulated = mods.some((m) => m.dst === 7 + n);
      if (p[`osc${n}Level`] <= 0 && !modulated) continue;
      level.connect(filters[0]);
      const wave = p[`osc${n}Wave`];
      const base =
        p[`osc${n}Octave`] * 1200 + p[`osc${n}Semi`] * 100 + p[`osc${n}Fine`];
      for (let u = 0; u < unison; u++) {
        const spreadPos = unison === 1 ? 0 : (u / (unison - 1)) * 2 - 1;
        const o = ctx.createOscillator();
        if (wave === PULSE) o.setPeriodicWave(pulseWave(ctx, p[`osc${n}Pw`]));
        else o.type = WAVE_TYPES[wave] ?? "sawtooth";
        o.detune.value = base + (spreadPos * p.detune) / 2;
        if (glideFrom === null) {
          o.frequency.value = freq;
        } else {
          o.frequency.setValueAtTime(glideFrom, t);
          o.frequency.setTargetAtTime(freq, t, ms(p.glide) / 3);
        }
        if (unison > 1) {
          const pan = ctx.createStereoPanner();
          pan.pan.value = (spreadPos * p.spread) / 100;
          o.connect(pan).connect(level);
        } else {
          o.connect(level);
        }
        o.start(t);
        sources.push(o);
        oscDetune[n - 1].push(o.detune);
        allDetune.push(o.detune);
      }
    }
    const noiseLevel = gain(ctx, (p.noise / 100) * 0.5);
    if (p.noise > 0 || mods.some((m) => m.dst === 11)) {
      const n = noise(ctx, t, t + 3600);
      n.connect(noiseLevel).connect(filters[0]);
      sources.push(n);
    }

    // Envelope sources (0..1), each with its own release stage.
    const envSource = (prefix: string) => {
      const k = (name: string) => `${prefix}${name}`;
      const src = ctx.createConstantSource();
      src.offset.setValueAtTime(0, t);
      src.offset.linearRampToValueAtTime(1, t + ms(p[k("Attack")]));
      src.offset.setTargetAtTime(
        p[k("Sustain")] / 100,
        t + ms(p[k("Attack")]),
        ms(p[k("Decay")]) / 4,
      );
      const release = gain(ctx);
      src.connect(release);
      src.start(t);
      sources.push(src);
      return {
        out: release,
        release: release.gain,
        length: ms(p[k("Release")]),
      };
    };
    const fEnv = envSource("f");
    const mEnv = mods.some((m) => m.src === 3) ? envSource("m") : null;

    // Fixed routing: filter envelope → cutoff, scaled by velocity.
    const velScale = 1 - (p.velFilter / 100) * (1 - velocity);
    const fAmt = gain(ctx, p.filterEnv * 100 * velScale);
    fEnv.out.connect(fAmt);
    for (const f of filters) fAmt.connect(f.detune);

    // Modulation matrix.
    const destParams = (dst: number): AudioParam[] => {
      if (dst === 0) return allDetune;
      if (dst <= 3) return oscDetune[dst - 1];
      if (dst === 4) return filters.map((f) => f.detune);
      if (dst === 5) return [lastFilter.Q];
      if (dst === 6) return [ampMod.gain];
      if (dst === 7) return [panner.pan];
      if (dst <= 10) return [oscLevel[dst - 8].gain];
      return [noiseLevel.gain];
    };
    for (const m of mods) {
      const targets = destParams(m.dst);
      const scale = m.amount * (DEST_SCALE[m.dst] ?? 0);
      if (m.src === 5 || m.src === 6) {
        // Static per-note sources: velocity 0..1, key -1..1 across ±5 octaves from middle C.
        const value =
          m.src === 5 ? velocity : Math.max(-1, Math.min(1, (pitch - 60) / 60));
        for (const param of targets) param.value += value * scale;
        continue;
      }
      const route = gain(ctx, scale);
      const fade = m.src === 1 || m.src === 2 ? ms(p[`lfo${m.src}Fade`]) : 0;
      if (fade > 0) {
        // Delayed vibrato: hold off for the first half, then fade in.
        route.gain.setValueAtTime(0, t);
        route.gain.setValueAtTime(0, t + fade / 2);
        route.gain.linearRampToValueAtTime(scale, t + fade);
      }
      if (m.src === 1 || m.src === 2) connectShared(lfos[m.src - 1], route);
      else (m.src === 3 && mEnv ? mEnv : fEnv).out.connect(route);
      for (const param of targets) route.connect(param);
    }

    // Amp envelope: attack, then decay to sustain. Release lives on `rel`.
    const peak = velocityGain(velocity) * 0.22;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + ms(p.attack));
    env.gain.setTargetAtTime(
      peak * (p.sustain / 100),
      t + ms(p.attack),
      ms(p.decay) / 4,
    );

    const releases: [AudioParam, number][] = [
      [rel.gain, ms(p.release)],
      [fEnv.release, fEnv.length],
    ];
    if (mEnv) releases.push([mEnv.release, mEnv.length]);
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
        // Only this method automates the release stages, so cancelling can't cut an attack short.
        for (const [param, length] of releases) {
          param.cancelScheduledValues(time);
          param.setValueAtTime(1, time);
          param.exponentialRampToValueAtTime(SILENT, time + length);
          param.setValueAtTime(0, time + length);
        }
        voice.releaseAt = time;
        voice.end = time + ms(p.release);
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

  update(initial, initialEnv);

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
      for (const node of [cutoff, resonance, ...lfos]) node.stop();
      output.disconnect();
    },
  };
}
