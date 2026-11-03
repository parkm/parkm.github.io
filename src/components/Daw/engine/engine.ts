import type { Id, Project, Track } from "../model/types";
import { createDevice, type DeviceEnv, type DeviceInstance } from "./devices";
import { dbToGain, setParam } from "./dsp";

/**
 * Builds and maintains the audio graph for a document. It never touches a
 * global AudioContext: give it a live context to play, or an
 * OfflineAudioContext to render. The same code produces both.
 *
 *   device chain → track gain → track pan → master gain → limiter → destination
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
  dispose: () => void;
};

type TrackNode = {
  track: Track;
  devices: { id: Id; instance: DeviceInstance }[];
  gain: GainNode;
  panner: StereoPannerNode;
};

const trackGain = (track: Track, anySolo: boolean) =>
  track.mute || (anySolo && !track.solo) ? 0 : dbToGain(track.volume);

export function createEngine(
  ctx: BaseAudioContext,
  destination: AudioNode = ctx.destination,
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

  const tracks = new Map<Id, TrackNode>();
  let doc: Project | null = null;

  function syncDevices(node: TrackNode, track: Track, env: DeviceEnv) {
    const same =
      node.devices.length === track.devices.length &&
      node.devices.every((d, i) => d.id === track.devices[i].id);
    if (same) {
      track.devices.forEach((d, i) => node.devices[i].instance.update(d, env));
      return;
    }
    // Chain order changed: reuse instances by id, rewire everything.
    const old = new Map(node.devices.map((d) => [d.id, d.instance]));
    node.devices = track.devices.map((d) => {
      const instance = old.get(d.id) ?? createDevice(ctx, d, env);
      old.delete(d.id);
      instance.update(d, env);
      instance.output.disconnect();
      return { id: d.id, instance };
    });
    old.forEach((i) => i.dispose());
    node.devices.forEach((d, i) => {
      const next = node.devices[i + 1]?.instance.input ?? node.gain;
      d.instance.output.connect(next);
    });
  }

  function sync(next: Project) {
    if (next === doc) return;
    if (!doc || next.masterVolume !== doc.masterVolume) {
      setParam(master.gain, dbToGain(next.masterVolume), ctx);
    }
    const env: DeviceEnv = { bpm: next.bpm };
    const tempoChanged = doc?.bpm !== next.bpm;
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
        const panner = ctx.createStereoPanner();
        gain.connect(panner).connect(master);
        gain.gain.value = trackGain(track, anySolo);
        panner.pan.value = track.pan;
        node = { track, devices: [], gain, panner };
        tracks.set(track.id, node);
        syncDevices(node, track, env);
        continue;
      }
      if (node.track !== track || anySolo !== prevAnySolo) {
        setParam(node.gain.gain, trackGain(track, anySolo), ctx);
        setParam(node.panner.pan, track.pan, ctx);
      }
      if (node.track.devices !== track.devices || tempoChanged) {
        syncDevices(node, track, env);
      }
      node.track = track;
    }
    for (const [id, node] of tracks) {
      if (seen.has(id)) continue;
      node.devices.forEach((d) => d.instance.dispose());
      node.panner.disconnect();
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
    dispose() {
      for (const node of tracks.values())
        node.devices.forEach((d) => d.instance.dispose());
      tracks.clear();
      limiter.disconnect();
    },
  };
}
