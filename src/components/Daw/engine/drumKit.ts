import type { Device, DrumKitDevice, Id, Pad } from "../model/types";
import type { DeviceInstance } from "./devices";
import { dbToGain, setParam } from "./dsp";
import { resolveParams } from "./params";
import { VOICES, type VoiceHandle } from "./voices";

type PadChannel = {
  pad: Pad;
  params: Record<string, number>;
  gain: GainNode;
  panner: StereoPannerNode;
};

/** Drum Rack: maps MIDI pitches to pads, each with its own voice, level and pan. */
export function createDrumKit(
  ctx: BaseAudioContext,
  initial: DrumKitDevice,
): DeviceInstance {
  const output = ctx.createGain();
  const channels = new Map<Id, PadChannel>();
  const byPitch = new Map<number, PadChannel>();
  let active: { handle: VoiceHandle; choke: number | null }[] = [];
  let current: DrumKitDevice | null = null;

  function update(device: Device) {
    if (device.type !== "drumKit" || device === current) return;
    const seen = new Set<Id>();
    byPitch.clear();
    for (const pad of device.pads) {
      seen.add(pad.id);
      let ch = channels.get(pad.id);
      if (!ch) {
        const gain = ctx.createGain();
        const panner = ctx.createStereoPanner();
        gain.connect(panner).connect(output);
        gain.gain.value = dbToGain(pad.level);
        panner.pan.value = pad.pan;
        ch = {
          pad,
          params: resolveParams(VOICES[pad.voice].params, pad.params),
          gain,
          panner,
        };
        channels.set(pad.id, ch);
      } else if (ch.pad !== pad) {
        setParam(ch.gain.gain, dbToGain(pad.level), ctx);
        setParam(ch.panner.pan, pad.pan, ctx);
        ch.params = resolveParams(VOICES[pad.voice].params, pad.params);
        ch.pad = pad;
      }
      byPitch.set(pad.pitch, ch);
    }
    for (const [id, ch] of channels) {
      if (seen.has(id)) continue;
      ch.panner.disconnect();
      channels.delete(id);
    }
    current = device;
  }

  function noteOn(pitch: number, velocity: number, time: number) {
    const ch = byPitch.get(pitch);
    if (!ch || ch.pad.mute) return;
    const now = ctx.currentTime;
    if (active.length > 32) active = active.filter((v) => v.handle.end > now);
    const choke = ch.pad.choke;
    if (choke !== null) {
      for (const v of active) {
        if (v.choke === choke && v.handle.start <= time && v.handle.end > time)
          v.handle.choke(time);
      }
    }
    const handle = VOICES[ch.pad.voice].play(
      ctx,
      ch.gain,
      time,
      velocity,
      ch.params,
    );
    active.push({ handle, choke });
  }

  // Voices already sounding ring out; ones that haven't started are silenced.
  function cancel(time: number) {
    active = active.filter((v) => {
      if (v.handle.start < time) return v.handle.end > time;
      v.handle.choke(time);
      return false;
    });
  }

  update(initial);

  return {
    input: null,
    output,
    noteOn,
    cancel,
    update,
    dispose() {
      for (const v of active) v.handle.choke(ctx.currentTime);
      active = [];
      output.disconnect();
    },
  };
}
