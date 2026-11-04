import type { Device } from "../model/types";
import { createDrumKit } from "./drumKit";
import { createEffect, EFFECTS } from "./effects";
import { createFmSynth, FM_PARAMS } from "./fmSynth";
import { createQuickSynth, QUICK_PARAMS } from "./quickSynth";
import { createSynth, SYNTH_PARAMS } from "./synth";
import type { ParamDef } from "./params";

/** Song-level values devices may depend on (tempo-synced delay). */
export type DeviceEnv = { bpm: number };

/**
 * Where the beat grid sits in AudioContext time: quarter-note `beat` falls
 * at `time`, moving at `bpm`. Tempo-synced LFOs line their cycles up to it.
 */
export type Clock = { time: number; beat: number; bpm: number };

/**
 * A device is one link in a track's chain. Instruments and effects share this
 * shape: instruments implement the note methods and have no input; effects
 * take audio in.
 */
export type DeviceInstance = {
  input: AudioNode | null;
  output: AudioNode;
  /** `duration` (seconds) schedules the release up front; omit it for live notes ended by noteOff. */
  noteOn?: (
    pitch: number,
    velocity: number,
    time: number,
    duration?: number,
  ) => void;
  noteOff?: (pitch: number, time: number) => void;
  /** Release every note still held without a scheduled end. */
  allNotesOff?: (time: number) => void;
  /** Stop: release what's sounding at `time`, silence what hasn't started. */
  cancel?: (time: number) => void;
  update: (device: Device, env: DeviceEnv) => void;
  /** Current gain reduction in dB (≤ 0), for dynamics devices. */
  reduction?: () => number;
  /** Input for a sidechain source; the engine connects the track the device names. */
  sidechain?: AudioNode;
  /** The transport's beat grid, whenever playback starts or the tempo changes. */
  clock?: (clock: Clock) => void;
  dispose: () => void;
};

export function createDevice(
  ctx: BaseAudioContext,
  device: Device,
  env: DeviceEnv,
): DeviceInstance {
  switch (device.type) {
    case "drumKit":
      return createDrumKit(ctx, device);
    case "quickSynth":
      return createQuickSynth(ctx, device, env);
    case "synth":
      return createSynth(ctx, device, env);
    case "fmSynth":
      return createFmSynth(ctx, device);
    default:
      return createEffect(ctx, device, env);
  }
}

/** The params of every device except the drum kit (whose pads have their own). */
export function deviceParams(
  type: Exclude<Device["type"], "drumKit">,
): ParamDef[] {
  switch (type) {
    case "synth":
      return SYNTH_PARAMS;
    case "quickSynth":
      return QUICK_PARAMS;
    case "fmSynth":
      return FM_PARAMS;
    default:
      return EFFECTS[type].params;
  }
}
