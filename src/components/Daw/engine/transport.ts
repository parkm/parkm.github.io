import {
  PPQ,
  secondsPerTick,
  swingTick,
  ticksPerBar,
  ticksPerBeat,
  unswingTick,
  type Tick,
} from "../model/time";
import type { Id, Project, Track } from "../model/types";
import type { Engine } from "./engine";
import type { Metronome } from "./metronome";
import { forEachNoteInRange } from "./schedule";

/**
 * Lookahead scheduler. A timer wakes every 25 ms and schedules every note due
 * in the next ~120 ms at sample-accurate AudioContext times. The document is
 * read on each pass, so edits are heard as soon as they're ahead of the
 * scheduling window — the music never stops.
 *
 * Two tick domains:
 *   - doc ticks: where notes are stored (straight grid)
 *   - timeline ticks: doc ticks after swing; time advances linearly in these
 *
 * Positions are counted from when playback started. Each playing clip has an
 * origin (the tick it was launched on) and loops from there. Launches are
 * queued to a quantized tick and swapped in sample-accurately by the scheduler.
 */

const INTERVAL = 0.025;
const LOOKAHEAD = 0.12;
const START_DELAY = 0.05;

export type ClipPlay = { clipId: Id; origin: Tick };

export type TrackLaunch = {
  active: ClipPlay | null;
  /** What played before the last swap, until the swap is audible. */
  prev: ClipPlay | null;
  swapAt: Tick;
  /** A queued launch; clipId null stops the track. */
  next: { clipId: Id | null; at: Tick } | null;
};

/** Per-track launch state, shared with the session. The transport advances it while playing. */
export type Launches = Map<Id, TrackLaunch>;

export type Transport = {
  start: () => void;
  stop: () => void;
  isPlaying: () => boolean;
  /** Audible position in doc ticks, or null when stopped. */
  position: () => Tick | null;
  /** The audible clip on a track and the position within it (unwrapped), or null. */
  clipPosition: (
    trackId: Id,
  ) => { clipId: Id; origin: Tick; tick: Tick } | null;
  /** The earliest tick a launch can take effect, on the quantize grid (0 = immediately). */
  launchTick: (quantize: Tick) => Tick;
  /** Don't play this note when the scheduler reaches it (it was just played live). */
  suppress: (trackId: Id, pitch: number, at: Tick) => void;
  dispose: () => void;
};

/** setInterval in a worker keeps ticking when the tab is in the background. */
function createTimer(onTick: () => void) {
  try {
    const src = `let id;onmessage=e=>{clearInterval(id);if(e.data)id=setInterval(()=>postMessage(0),${INTERVAL * 1000})}`;
    const url = URL.createObjectURL(
      new Blob([src], { type: "text/javascript" }),
    );
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = onTick;
    return {
      run: (on: boolean) => worker.postMessage(on),
      dispose: () => worker.terminate(),
    };
  } catch {
    let id: ReturnType<typeof setInterval> | undefined;
    return {
      run: (on: boolean) => {
        clearInterval(id);
        if (on) id = setInterval(onTick, INTERVAL * 1000);
      },
      dispose: () => clearInterval(id),
    };
  }
}

export function createTransport(
  ctx: AudioContext,
  engine: Engine,
  getDoc: () => Project,
  launches: Launches,
  /** Called when a queued launch becomes audible. */
  onSwap: () => void,
  /** Clicks on every beat while this returns true. */
  metronome: { on: () => boolean; instance: Metronome },
): Transport {
  let playing = false;
  let anchorTime = 0;
  let anchorPos = 0; // timeline ticks at anchorTime
  let bpm = 120;
  let spt = secondsPerTick(bpm);
  let scheduled = 0; // doc ticks: everything before this is scheduled
  const suppressed = new Set<string>();

  const posAt = (time: number) => anchorPos + (time - anchorTime) / spt;
  const timeAt = (pos: number) => anchorTime + (pos - anchorPos) * spt;

  function playRange(
    doc: Project,
    track: Track,
    play: ClipPlay | null,
    from: Tick,
    to: Tick,
    swing: number,
  ) {
    const clip = play && doc.clips[play.clipId];
    if (!clip) return;
    const origin = play.origin;
    forEachNoteInRange(clip, from - origin, to - origin, (note, rel) => {
      const at = rel + origin;
      if (
        suppressed.size &&
        suppressed.delete(`${track.id}:${note.pitch}:${at}`)
      )
        return;
      const time = timeAt(swingTick(at, swing));
      const end = timeAt(swingTick(at + note.duration, swing));
      engine.noteOn(track.id, note.pitch, note.velocity, time, end - time);
    });
  }

  const position = () => {
    if (!playing) return null;
    const audible =
      ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    return Math.max(0, unswingTick(posAt(audible), getDoc().swing));
  };

  function pump() {
    if (!playing) return;
    const doc = getDoc();
    if (doc.bpm !== bpm) {
      // Re-anchor so the tempo change takes effect from now without a jump.
      anchorPos = posAt(ctx.currentTime);
      anchorTime = ctx.currentTime;
      bpm = doc.bpm;
      spt = secondsPerTick(bpm);
      engine.setClock({ time: anchorTime, beat: anchorPos / PPQ, bpm });
    }
    const swing = doc.swing;
    const horizon = unswingTick(posAt(ctx.currentTime + LOOKAHEAD), swing);
    if (horizon <= scheduled) return;

    for (const track of doc.tracks) {
      const launch = launches.get(track.id);
      if (!launch) continue;
      let from = scheduled;
      const next = launch.next;
      if (next && next.at < horizon) {
        const at = Math.max(next.at, from);
        playRange(doc, track, launch.active, from, at, swing);
        launch.prev = launch.active;
        launch.active = next.clipId
          ? { clipId: next.clipId, origin: at }
          : null;
        launch.swapAt = at;
        launch.next = null;
        from = at;
        const delay = timeAt(swingTick(at, swing)) - ctx.currentTime;
        setTimeout(onSwap, Math.max(0, delay * 1000));
      }
      playRange(doc, track, launch.active, from, horizon, swing);
    }
    if (metronome.on()) {
      const beat = ticksPerBeat(doc.timeSignature);
      const bar = ticksPerBar(doc.timeSignature);
      for (
        let at = Math.ceil(scheduled / beat) * beat;
        at < horizon;
        at += beat
      )
        metronome.instance.click(timeAt(swingTick(at, swing)), at % bar === 0);
    }
    scheduled = horizon;
    if (suppressed.size > 64) suppressed.clear();
  }

  const timer = createTimer(pump);

  return {
    start() {
      if (playing) return;
      const doc = getDoc();
      bpm = doc.bpm;
      spt = secondsPerTick(bpm);
      anchorTime = ctx.currentTime + START_DELAY;
      anchorPos = 0;
      scheduled = 0;
      suppressed.clear();
      for (const launch of launches.values()) {
        if (launch.active) launch.active = { ...launch.active, origin: 0 };
        launch.prev = null;
        launch.next = null;
        launch.swapAt = 0;
      }
      playing = true;
      engine.setClock({ time: anchorTime, beat: 0, bpm });
      pump();
      timer.run(true);
    },
    stop() {
      if (!playing) return;
      playing = false;
      timer.run(false);
      // Silence notes already handed to the audio thread; let sounding tails ring out.
      engine.cancel(ctx.currentTime + 0.005);
      for (const launch of launches.values()) launch.next = null;
    },
    isPlaying: () => playing,
    position,
    clipPosition(trackId) {
      const pos = position();
      const launch = launches.get(trackId);
      if (pos === null || !launch) return null;
      const play = pos >= launch.swapAt ? launch.active : launch.prev;
      return play && { ...play, tick: pos - play.origin };
    },
    launchTick(quantize) {
      const now = Math.max(
        0,
        unswingTick(posAt(ctx.currentTime), getDoc().swing),
      );
      const snap = (t: Tick) =>
        quantize > 0 ? Math.ceil(t / quantize) * quantize : t;
      const at = snap(now);
      return at >= scheduled ? at : snap(scheduled);
    },
    suppress(trackId, pitch, at) {
      if (playing && at >= scheduled)
        suppressed.add(`${trackId}:${pitch}:${at}`);
    },
    dispose() {
      playing = false;
      timer.dispose();
    },
  };
}
