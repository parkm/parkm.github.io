import type { Tick, TimeSignature } from "./time";

/**
 * The project document. Plain serializable data, updated immutably. The audio
 * engine follows it by reference diffing; nothing audio-related lives here.
 */

export type Id = string;

export type Note = {
  id: Id;
  pitch: number;
  start: Tick;
  duration: Tick;
  /** 0..1 */
  velocity: number;
};

export type Clip = {
  id: Id;
  name: string;
  /** Hue (OKLCH degrees) used for the clip's color. */
  hue: number;
  /**
   * Where the loop starts in the clip's content (Ableton's loop brace).
   * Missing means 0. Notes outside [loopStart, loopStart + length) are kept
   * but not played; Crop removes them.
   */
  loopStart?: Tick;
  /** Loop length. */
  length: Tick;
  notes: Note[];
};

export type VoiceType =
  | "kick"
  | "snare"
  | "clap"
  | "rim"
  | "hat"
  | "tom"
  | "cowbell";

export type Pad = {
  id: Id;
  name: string;
  /** MIDI note that triggers this pad (General MIDI drum map). */
  pitch: number;
  voice: VoiceType;
  /** Voice parameters by key. Missing keys use the voice's defaults. */
  params: Record<string, number>;
  /** dB */
  level: number;
  /** -1..1 */
  pan: number;
  /** Velocity sensitivity in percent. Missing means 100. */
  vel?: number;
  mute: boolean;
  /** Pads in the same choke group cut each other off. */
  choke: number | null;
};

export type DrumKitDevice = {
  id: Id;
  type: "drumKit";
  pads: Pad[];
};

/** Subtractive polysynth. Params are keyed by SYNTH_PARAMS. */
export type SynthDevice = {
  id: Id;
  type: "synth";
  params: Record<string, number>;
};

/**
 * Quick Synth: a few big, musical controls. Its params are translated into
 * the full synth's params, so both share one voice engine.
 */
export type QuickSynthDevice = {
  id: Id;
  type: "quickSynth";
  params: Record<string, number>;
};

/** Four-operator FM synth. Params are keyed by FM_PARAMS. */
export type FmSynthDevice = {
  id: Id;
  type: "fmSynth";
  params: Record<string, number>;
};

export type EffectType =
  | "eq"
  | "filter"
  | "drive"
  | "delay"
  | "reverb"
  | "compressor"
  | "multiband"
  | "modulation"
  | "autoPan"
  | "utility";

export type EffectDevice = {
  id: Id;
  type: EffectType;
  params: Record<string, number>;
  bypass: boolean;
};

export type InstrumentDevice =
  | DrumKitDevice
  | SynthDevice
  | QuickSynthDevice
  | FmSynthDevice;
export type Device = InstrumentDevice | EffectDevice;

export type Track = {
  id: Id;
  name: string;
  /** Hue (OKLCH degrees) for the track and its new clips. */
  hue: number;
  /** Instrument first, then effects, in signal order. */
  devices: Device[];
  /** Session view clip slots, one per scene. */
  slots: (Id | null)[];
  /** dB */
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
};

/** A row of the session grid. Launching it launches every clip in the row. */
export type Scene = {
  id: Id;
  name: string;
};

export type Project = {
  version: 1;
  bpm: number;
  timeSignature: TimeSignature;
  /** 0..1, see swingTick */
  swing: number;
  /** dB */
  masterVolume: number;
  /** Effects on the master, in signal order, before the master volume. */
  masterDevices: EffectDevice[];
  /** Clip launches wait for the next multiple of this many ticks (0 = immediately). */
  launchQuantize: Tick;
  scenes: Scene[];
  tracks: Track[];
  clips: Record<Id, Clip>;
};
