import { MASTER } from "../model/deviceOps";
import type { Device, Id, Project, Track } from "../model/types";
import {
  createDevice,
  type Clock,
  type DeviceEnv,
  type DeviceInstance,
} from "./devices";
import { createBalance, dbToGain, setParam, type Balance } from "./dsp";

/**
 * Builds and maintains the audio graph for a document. It never touches a
 * global AudioContext: give it a live context to play, or an
 * OfflineAudioContext to render. The same code produces both.
 *
 *   device chain → track gain → track pan ┐
 *   device chain → track gain → track pan ┴→ master effects → master gain → limiter → destination
 *
 * With `meters`, track and master levels can be read every frame (see peak).
 */
export type Engine = {
  ctx: BaseAudioContext;
  /** Bring the graph in line with the document. Cheap when little changed. */
  sync: (doc: Project) => void;
  /** `duration` in seconds; omit for a live note that noteOff will end. */
  noteOn: (
    trackId: Id,
    pitch: number,
    velocity: number,
    time: number,
    duration?: number,
  ) => void;
  noteOff: (trackId: Id, pitch: number, time: number) => void;
  /** Release every held (live) note on every track. */
  allNotesOff: (time: number) => void;
  cancel: (time: number) => void;
  /**
   * Peak level (linear) of each channel over the last ~40 ms: a track after
   * its fader and pan, or the master (null) before the limiter. Needs
   * `meters`. Safe to call every frame.
   */
  peak: (trackId: Id | null) => [number, number] | null;
  /** Tell devices where the beat grid is (playback started, tempo changed, or a render begins at 0). */
  setClock: (clock: Clock) => void;
  /** A device's gain reduction in dB (≤ 0), for devices that report one. `chainId` is a track id or MASTER. */
  reduction: (chainId: Id, deviceId: Id) => number | null;
  dispose: () => void;
};

type Chain = { id: Id; instance: DeviceInstance }[];

type TrackNode = {
  track: Track;
  devices: Chain;
  gain: GainNode;
  pan: Balance;
  meter: Meter | null;
};

type Meter = { read: () => [number, number]; dispose: () => void };

function createMeter(ctx: BaseAudioContext, source: AudioNode): Meter {
  const split = ctx.createChannelSplitter(2);
  const sides = [0, 1].map((c) => {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    split.connect(analyser, c);
    return analyser;
  });
  source.connect(split);
  const buffer = new Float32Array(2048);
  const peakOf = (a: AnalyserNode) => {
    a.getFloatTimeDomainData(buffer);
    let max = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = Math.abs(buffer[i]);
      if (v > max) max = v;
    }
    return max;
  };
  return {
    read: () => [peakOf(sides[0]), peakOf(sides[1])],
    dispose: () => {
      source.disconnect(split);
    },
  };
}

const trackGain = (track: Track, anySolo: boolean) =>
  track.mute || (anySolo && !track.solo) ? 0 : dbToGain(track.volume);

export function createEngine(
  ctx: BaseAudioContext,
  { destination = ctx.destination, meters = false } = {},
): Engine {
  const master = ctx.createGain();
  // Safety limiter: transparent below -1 dBFS.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  master.connect(limiter).connect(destination);
  const masterMeter = meters ? createMeter(ctx, master) : null;
  // Tracks sum here, then run through the master effects into master gain.
  const bus = ctx.createGain();
  bus.channelCount = 2;
  bus.channelCountMode = "explicit";
  bus.connect(master);
  let masterChain: Chain = [];

  const tracks = new Map<Id, TrackNode>();
  let doc: Project | null = null;
  let clock: Clock | null = null;

  /**
   * Bring a chain's instances in line with `devices`. `head` feeds the first
   * device (null when it's an instrument); the last one feeds `tail`.
   */
  function syncChain(
    chain: Chain,
    devices: Device[],
    env: DeviceEnv,
    head: AudioNode | null,
    tail: AudioNode,
  ): Chain {
    const same =
      chain.length === devices.length &&
      chain.every((d, i) => d.id === devices[i].id);
    if (same) {
      devices.forEach((d, i) => chain[i].instance.update(d, env));
      return chain;
    }
    // Chain order changed: reuse instances by id, rewire everything.
    const old = new Map(chain.map((d) => [d.id, d.instance]));
    const next = devices.map((d) => {
      let instance = old.get(d.id);
      if (!instance) {
        instance = createDevice(ctx, d, env);
        if (clock) instance.clock?.(clock);
      }
      old.delete(d.id);
      instance.update(d, env);
      instance.output.disconnect();
      return { id: d.id, instance };
    });
    old.forEach((i) => i.dispose());
    if (head) {
      head.disconnect();
      head.connect(next[0]?.instance.input ?? tail);
    }
    next.forEach((d, i) => {
      d.instance.output.connect(next[i + 1]?.instance.input ?? tail);
    });
    return next;
  }

  const syncDevices = (node: TrackNode, track: Track, env: DeviceEnv) => {
    node.devices = syncChain(node.devices, track.devices, env, null, node.gain);
  };

  function sync(next: Project) {
    if (next === doc) return;
    if (!doc || next.masterVolume !== doc.masterVolume) {
      setParam(master.gain, dbToGain(next.masterVolume), ctx);
    }
    const env: DeviceEnv = { bpm: next.bpm };
    const tempoChanged = doc?.bpm !== next.bpm;
    if (!doc || next.masterDevices !== doc.masterDevices || tempoChanged) {
      masterChain = syncChain(
        masterChain,
        next.masterDevices,
        env,
        bus,
        master,
      );
    }
    const anySolo = next.tracks.some((t) => t.solo);
    const prevAnySolo = doc?.tracks.some((t) => t.solo) ?? false;
    const seen = new Set<Id>();
    for (const track of next.tracks) {
      seen.add(track.id);
      let node = tracks.get(track.id);
      if (!node) {
        // Always stereo into the panner: it treats mono and stereo input
        // differently (-3 dB at centre for mono), which would make levels
        // jump when a stereo effect is added to a mono instrument.
        const gain = ctx.createGain();
        gain.channelCount = 2;
        gain.channelCountMode = "explicit";
        gain.channelInterpretation = "speakers";
        const pan = createBalance(ctx, track.pan);
        gain.connect(pan.input);
        pan.output.connect(bus);
        gain.gain.value = trackGain(track, anySolo);
        const meter = meters ? createMeter(ctx, pan.output) : null;
        node = { track, devices: [], gain, pan, meter };
        tracks.set(track.id, node);
        syncDevices(node, track, env);
        continue;
      }
      if (node.track !== track || anySolo !== prevAnySolo) {
        setParam(node.gain.gain, trackGain(track, anySolo), ctx);
        node.pan.set(track.pan);
      }
      if (node.track.devices !== track.devices || tempoChanged) {
        syncDevices(node, track, env);
      }
      node.track = track;
    }
    for (const [id, node] of tracks) {
      if (seen.has(id)) continue;
      node.devices.forEach((d) => d.instance.dispose());
      node.meter?.dispose();
      node.pan.output.disconnect();
      tracks.delete(id);
    }
    doc = next;
  }

  return {
    ctx,
    sync,
    noteOn(trackId, pitch, velocity, time, duration) {
      const node = tracks.get(trackId);
      node?.devices[0]?.instance.noteOn?.(pitch, velocity, time, duration);
    },
    allNotesOff(time) {
      for (const node of tracks.values()) {
        node.devices[0]?.instance.allNotesOff?.(time);
      }
    },
    noteOff(trackId, pitch, time) {
      tracks.get(trackId)?.devices[0]?.instance.noteOff?.(pitch, time);
    },
    cancel(time) {
      for (const node of tracks.values()) {
        for (const d of node.devices) d.instance.cancel?.(time);
      }
    },
    peak(trackId) {
      const meter = trackId === null ? masterMeter : tracks.get(trackId)?.meter;
      return meter ? meter.read() : null;
    },
    setClock(next) {
      clock = next;
      for (const node of tracks.values())
        node.devices.forEach((d) => d.instance.clock?.(next));
      masterChain.forEach((d) => d.instance.clock?.(next));
    },
    reduction(chainId, deviceId) {
      const chain =
        chainId === MASTER ? masterChain : tracks.get(chainId)?.devices;
      const device = chain?.find((d) => d.id === deviceId)?.instance;
      return device?.reduction?.() ?? null;
    },
    dispose() {
      for (const node of tracks.values()) {
        node.devices.forEach((d) => d.instance.dispose());
        node.meter?.dispose();
      }
      masterChain.forEach((d) => d.instance.dispose());
      masterChain = [];
      masterMeter?.dispose();
      tracks.clear();
      limiter.disconnect();
    },
  };
}
