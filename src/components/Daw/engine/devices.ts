import type { Device } from "../model/types";
import { createDrumKit } from "./drumKit";
import { createEffect } from "./effects";
import { createQuickSynth } from "./quickSynth";
import { createSynth } from "./synth";

/** Song-level values devices may depend on (tempo-synced delay). */
export type DeviceEnv = { bpm: number };

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
    default:
      return createEffect(ctx, device, env);
  }
}
