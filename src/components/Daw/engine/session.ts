import {
  loopTick,
  newId,
  overdubClip,
  recordNote,
  setNoteLength,
} from "../model/ops";
import { freeSlot, putClip, type Slot } from "../model/sessionOps";
import type { Store } from "../model/store";
import {
  mod,
  PPQ,
  secondsPerTick,
  ticksPerBar,
  type Tick,
} from "../model/time";
import type { Id, Project } from "../model/types";
import { buildPhrase, detectTempo, type CapturedNote } from "./capture";
import { createEngine, type Engine } from "./engine";
import { createMetronome, type Metronome } from "./metronome";
import { unlockPlayback } from "./unlockAudio";
import type { ClipChoice } from "./schedule";
import {
  createTransport,
  type Launches,
  type TrackLaunch,
  type Transport,
} from "./transport";

/** What a track's clip slots show: the playing clip, and a queued launch (null = queued stop). */
export type TrackPlayState = { playing: Id | null; queued?: Id | null };

export type SessionState = {
  playing: boolean;
  recording: boolean;
  /** Click on every beat while playing. A preference, not part of the document. */
  metronome: boolean;
  /** Sound notes as they're drawn or clicked in the clip editor. Also a preference. */
  preview: boolean;
  tracks: Record<Id, TrackPlayState>;
  /** Tracks with played notes waiting to be captured. */
  capturable: Record<Id, boolean>;
};

export type HitOptions = {
  /** Seconds. Give it for one-shots; leave it out for held keys ended by release(). */
  duration?: number;
  /**
   * Clicks in editors (previewing a note or pad) rather than playing.
   * Auditions aren't recorded or captured. Defaults to true when `duration` is given.
   */
  audition?: boolean;
  /** When the key was pressed (page clock seconds, e.g. event.timeStamp / 1000). */
  time?: number;
};

/** A note heard from live input, kept for Capture. */
type InputEvent = {
  pitch: number;
  velocity: number;
  /** Seconds, page clock. */
  on: number;
  off: number | null;
  /** Transport position (doc ticks) while playing, with the playback run it belongs to. */
  onTick: number | null;
  offTick: number | null;
  run: number;
  oneShot: boolean;
};

/**
 * Capture timing uses the page clock: the AudioContext clock sits at 0 until
 * the context has started, which would squash the first notes played.
 */
const wallClock = () => performance.now() / 1000;

/** The transport position at an earlier moment `at`, given the position now. */
const positionAt = (pos: Tick | null, at: number, bpm: number) =>
  pos === null ? null : pos - (wallClock() - at) / secondsPerTick(bpm);

/** Capture forgets what came before a pause this long, like Live. */
const CAPTURE_GAP = 30;
const CAPTURE_LIMIT = 2048;

const METRONOME_KEY = "daw:metronome";
const PREVIEW_KEY = "daw:preview";
function loadFlag(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function saveFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // Storage blocked; the setting lasts for this visit.
  }
}

/**
 * Connects the document store to live audio and owns clip launch state. The
 * AudioContext is created on the first user gesture (browsers require one);
 * until then editing and launching work silently. React reads transport
 * state through subscribe/getState.
 */
export type Session = ReturnType<typeof createSession>;

export function createSession(store: Store<Project>) {
  let audio: {
    ctx: AudioContext;
    engine: Engine;
    transport: Transport;
    metronome: Metronome;
  } | null = null;
  const listeners = new Set<() => void>();

  // Pressing play starts each track's first clip until something else is launched.
  const launches: Launches = new Map();
  // Everything played on each track since the last capture (always listening).
  const inputs = new Map<Id, InputEvent[]>();
  let run = 0;
  const armFirstClips = () => {
    for (const track of store.get().tracks) {
      const clipId = track.slots.find((id) => id !== null) ?? null;
      if (clipId) launches.set(track.id, idle(clipId));
    }
  };
  armFirstClips();

  let flags = {
    playing: false,
    recording: false,
    metronome: loadFlag(METRONOME_KEY, false),
    preview: loadFlag(PREVIEW_KEY, true),
  };
  let state = snapshot();

  function idle(clipId: Id | null): TrackLaunch {
    return {
      active: clipId ? { clipId, origin: 0 } : null,
      prev: null,
      swapAt: 0,
      next: null,
    };
  }

  function snapshot(): SessionState {
    const tracks: Record<Id, TrackPlayState> = {};
    for (const [id, l] of launches) {
      tracks[id] = {
        playing: l.active?.clipId ?? null,
        ...(l.next && { queued: l.next.clipId }),
      };
    }
    const capturable: Record<Id, boolean> = {};
    for (const [id, events] of inputs) if (events.length) capturable[id] = true;
    return { ...flags, tracks, capturable };
  }

  const emit = () => {
    state = snapshot();
    listeners.forEach((l) => l());
  };

  // Forget launches whose clip was deleted or moved off the track.
  const unsubscribe = store.subscribe(() => {
    const doc = store.get();
    audio?.engine.sync(doc);
    let changed = false;
    for (const [trackId, l] of launches) {
      const track = doc.tracks.find((t) => t.id === trackId);
      const gone = (id: Id | null | undefined) =>
        id && !track?.slots.includes(id);
      if (!track) {
        launches.delete(trackId);
        changed = true;
      } else if (gone(l.active?.clipId) || gone(l.next?.clipId)) {
        if (gone(l.active?.clipId)) l.active = null;
        if (gone(l.next?.clipId)) l.next = null;
        changed = true;
      }
    }
    if (changed) emit();
  });

  /** Call from a user gesture before making sound. */
  function ensureAudio() {
    unlockPlayback();
    if (!audio) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      const engine = createEngine(ctx);
      engine.sync(store.get());
      const metronome = createMetronome(ctx);
      const transport = createTransport(
        ctx,
        engine,
        store.get,
        launches,
        emit,
        {
          on: () => flags.metronome,
          instance: metronome,
        },
      );
      audio = { ctx, engine, transport, metronome };
    }
    if (audio.ctx.state !== "running") void audio.ctx.resume();
    return audio;
  }

  function play() {
    run++;
    ensureAudio().transport.start();
    flags = { ...flags, playing: true };
    emit();
  }

  function stop() {
    audio?.transport.stop();
    flags = { ...flags, playing: false };
    emit();
  }

  /**
   * Launch a clip on a track (null stops the track). While playing it waits
   * for the next launch-quantize boundary; while stopped it starts playback.
   */
  function launch(trackId: Id, clipId: Id | null) {
    queue(trackId, clipId);
    if (!flags.playing && clipId) play();
    else emit();
  }

  function queue(trackId: Id, clipId: Id | null) {
    const transport = audio?.transport;
    if (!flags.playing || !transport) {
      launches.set(trackId, idle(clipId));
      return;
    }
    const l = launches.get(trackId) ?? idle(null);
    const at = transport.launchTick(store.get().launchQuantize);
    l.next = { clipId, at };
    launches.set(trackId, l);
  }

  /**
   * Start a clip right away, in phase with the bar grid, as if it had been
   * playing all along. Used to record into a clip without waiting.
   */
  function launchNow(trackId: Id, clipId: Id) {
    const transport = audio?.transport;
    const clip = store.get().clips[clipId];
    if (!flags.playing || !transport || !clip) {
      launches.set(trackId, idle(clipId));
      return;
    }
    const at = transport.launchTick(0);
    const prev = launches.get(trackId)?.active ?? null;
    launches.set(trackId, {
      active: { clipId, origin: Math.floor(at / clip.length) * clip.length },
      prev,
      swapAt: at,
      next: null,
    });
  }

  /**
   * Session record: make sure `clipId` is playing on the track, start the
   * transport if needed, and turn recording on.
   */
  function recordInto(trackId: Id, clipId: Id) {
    if (launches.get(trackId)?.active?.clipId !== clipId) {
      launchNow(trackId, clipId);
    }
    flags = { ...flags, recording: true };
    if (!flags.playing) play();
    else emit();
  }

  /** Launch every clip in a scene row; tracks with an empty slot stop. */
  function launchScene(scene: number) {
    for (const track of store.get().tracks) {
      queue(track.id, track.slots[scene] ?? null);
    }
    if (!flags.playing) play();
    else emit();
  }

  function stopAll() {
    for (const track of store.get().tracks) queue(track.id, null);
    emit();
  }

  // Pitches sounding from live input (keys, pads, auditions), for display.
  const live = new Map<Id, Map<number, number>>();
  const liveOn = (trackId: Id, pitch: number) => {
    const pitches = live.get(trackId) ?? new Map<number, number>();
    pitches.set(pitch, (pitches.get(pitch) ?? 0) + 1);
    live.set(trackId, pitches);
  };
  const liveOff = (trackId: Id, pitch: number) => {
    const pitches = live.get(trackId);
    const n = pitches?.get(pitch) ?? 0;
    if (n <= 1) pitches?.delete(pitch);
    else pitches?.set(pitch, n - 1);
  };

  // Live notes held on synth tracks, so key-up can end them (and set recorded lengths).
  type Held = { clipId: Id; start: Tick; pressedAt: Tick; grid: Tick } | null;
  const held = new Map<string, Held>();

  /**
   * Play a note now. Give `duration` (seconds) for one-shots like clicks;
   * leave it out for held keys and call release() on key-up. When recording,
   * the note is also written into the playing clip at the nearest grid line.
   */
  function hit(
    trackId: Id,
    pitch: number,
    velocity: number,
    grid: Tick,
    { duration, audition = duration !== undefined, time }: HitOptions = {},
  ) {
    // Stamp the note before any setup work (the first press starts audio).
    const pressedAt = time ?? wallClock();
    const { ctx, engine, transport } = ensureAudio();
    engine.noteOn(trackId, pitch, velocity, ctx.currentTime, duration);
    liveOn(trackId, pitch);
    const doc = store.get();
    const melodic =
      doc.tracks.find((t) => t.id === trackId)?.devices[0]?.type !== "drumKit";
    const sustained = duration === undefined && melodic;
    if (!audition) {
      listen(trackId, {
        pitch,
        velocity,
        on: pressedAt,
        off: sustained ? null : pressedAt + (duration ?? 0),
        onTick: positionAt(transport.position(), pressedAt, doc.bpm),
        offTick: null,
        run,
        oneShot: !sustained,
      });
    }
    const key = `${trackId}:${pitch}`;
    if (sustained) held.set(key, null);
    // One-shots (drum hits, auditions) show briefly; held notes until key-up.
    else setTimeout(() => liveOff(trackId, pitch), (duration ?? 0.15) * 1000);

    if (!flags.recording || audition) return;
    const at = transport.clipPosition(trackId);
    const clip = at && doc.clips[at.clipId];
    if (!at || !clip) return;
    const rel = Math.round(at.tick / grid) * grid;
    const start = loopTick(clip, rel);
    transport.suppress(trackId, pitch, at.origin + rel);
    if (sustained) {
      // The note and its final length are one undo step.
      store.begin();
      held.set(key, { clipId: clip.id, start, pressedAt: at.tick, grid });
    }
    store.update((d) => recordNote(d, clip.id, pitch, start, grid, velocity));
  }

  /** End a held note (key-up). */
  function release(trackId: Id, pitch: number, time = wallClock()) {
    const key = `${trackId}:${pitch}`;
    if (!held.has(key) || !audio) return;
    const h = held.get(key);
    held.delete(key);
    audio.engine.noteOff(trackId, pitch, audio.ctx.currentTime);
    liveOff(trackId, pitch);
    const open = inputs
      .get(trackId)
      ?.findLast((e) => e.pitch === pitch && e.off === null);
    if (open) {
      open.off = time;
      open.offTick = positionAt(
        audio.transport.position(),
        time,
        store.get().bpm,
      );
    }
    if (!h) return;
    const at = audio.transport.clipPosition(trackId);
    if (at && at.clipId === h.clipId) {
      const length = Math.max(
        h.grid,
        Math.round((at.tick - h.pressedAt) / h.grid) * h.grid,
      );
      store.update((d) => setNoteLength(d, h.clipId, pitch, h.start, length));
    }
    store.end();
  }

  function releaseAll() {
    for (const key of [...held.keys()]) {
      const [trackId, pitch] = key.split(":");
      release(trackId, Number(pitch));
    }
  }

  function listen(trackId: Id, event: InputEvent) {
    let events = inputs.get(trackId) ?? [];
    const lastActivity = events.reduce(
      (t, e) => Math.max(t, e.off ?? e.on),
      -Infinity,
    );
    if (event.on - lastActivity > CAPTURE_GAP) events = [];
    events.push(event);
    if (events.length > CAPTURE_LIMIT) events = events.slice(-CAPTURE_LIMIT);
    const wasEmpty = !inputs.get(trackId)?.length;
    inputs.set(trackId, events);
    if (wasEmpty) emit();
  }

  /**
   * Capture: turn what was just played on a track into a clip. Returns the
   * slot that received it (for selection), or null if there was nothing.
   *
   * - Playing, with a clip playing on the track: the notes are added on top
   *   of it (overdub), at the positions they were played.
   * - Playing otherwise: a new clip at the bar positions you played, launched
   *   in place so it carries on seamlessly.
   * - Stopped: the first note is the downbeat. In an empty project the tempo
   *   is detected and adopted; otherwise the playing is conformed onto the
   *   project's tempo. Playback starts.
   */
  function capture(trackId: Id, fromScene: number): Slot | null {
    const events = inputs.get(trackId);
    if (!events?.length) return null;
    const { transport } = ensureAudio();
    const doc = store.get();
    const bar = ticksPerBar(doc.timeSignature);
    const nowTick = transport.position();
    const oneShotTicks = PPQ / 4;
    let phrase;
    let bpm = doc.bpm;
    let placed: "playing" | "stopped";

    const current = flags.playing
      ? events.filter((e) => e.run === run && e.onTick !== null)
      : [];
    if (current.length) {
      // Notes keep the bar positions they were played at.
      placed = "playing";
      const notes: CapturedNote[] = current.map((e) => ({
        pitch: e.pitch,
        velocity: e.velocity,
        on: e.onTick!,
        off: e.oneShot
          ? e.onTick! + oneShotTicks
          : (e.offTick ?? nowTick ?? e.onTick! + oneShotTicks),
      }));
      phrase = buildPhrase(notes, bar);
    } else {
      // Timing from the clock; the first note is the downbeat.
      placed = "stopped";
      const t0 = events[0].on;
      const ends = events.map((e) => e.off ?? wallClock());
      let forcedBars: number | undefined;
      // Empty and stopped: detect the tempo and adopt it, like Live.
      // Otherwise detect the tempo you played at (near the project's) and
      // conform the notes onto the project's grid, so they land on the beat.
      const adopt = Object.keys(doc.clips).length === 0 && !flags.playing;
      let playedBpm = doc.bpm;
      if (adopt || events.length > 1) {
        const guess = detectTempo(
          events.map((e) => e.on),
          events.map((e, i) => ends[i] - e.on),
          doc.timeSignature[0],
          adopt ? undefined : doc.bpm,
        );
        playedBpm = guess.bpm;
        if (adopt) bpm = guess.bpm;
        if (events.length === 1) forcedBars = guess.bars;
      }
      const spt = secondsPerTick(playedBpm);
      const notes: CapturedNote[] = events.map((e, i) => ({
        pitch: e.pitch,
        velocity: e.velocity,
        on: (e.on - t0) / spt,
        off: e.oneShot
          ? (e.on - t0) / spt + oneShotTicks
          : (ends[i] - t0) / spt,
      }));
      phrase = buildPhrase(notes, bar, forcedBars);
    }
    inputs.delete(trackId);
    if (!phrase || phrase.notes.length === 0) {
      emit();
      return null;
    }
    const captured = phrase;

    // Overdub onto the clip playing on this track.
    const playingClip = launches.get(trackId)?.active;
    if (placed === "playing" && playingClip && doc.clips[playingClip.clipId]) {
      // Overdub only the phrase itself, at the positions it was played.
      const offset = captured.start - playingClip.origin - captured.lead;
      store.update((d) =>
        overdubClip(
          d,
          playingClip.clipId,
          captured.notes
            .filter((n) => n.start >= captured.lead)
            .map((n) => ({ ...n, start: n.start + offset })),
          captured.length,
        ),
      );
      emit();
      const scene = doc.tracks
        .find((t) => t.id === trackId)
        ?.slots.indexOf(playingClip.clipId);
      return scene === undefined || scene < 0 ? null : { trackId, scene };
    }

    // New clip in a free slot (one undo step, including any tempo change).
    const track = doc.tracks.find((t) => t.id === trackId);
    const clip = {
      id: newId(),
      name: "Capture",
      hue: track?.hue ?? 55,
      loopStart: captured.lead,
      length: captured.length,
      notes: captured.notes.map((n) => ({ ...n, id: newId() })),
    };
    let scene = fromScene;
    store.update((d) => {
      const free = freeSlot({ ...d, bpm }, trackId, fromScene);
      scene = free.scene;
      return putClip(free.doc, clip, { trackId, scene });
    });

    if (placed === "playing") {
      // Launch in place: the loop's start is a bar already passed, so it
      // carries on from where you are.
      launches.set(trackId, {
        active: { clipId: clip.id, origin: captured.start },
        prev: launches.get(trackId)?.active ?? null,
        swapAt: 0,
        next: null,
      });
      emit();
    } else if (flags.playing) {
      launchNow(trackId, clip.id);
      emit();
    } else {
      launches.set(trackId, idle(clip.id));
      play();
    }
    return { trackId, scene };
  }

  /**
   * Swap in a whole project (new, demo, opened file). It's one undo step;
   * playback stops and each track's first clip is armed again.
   */
  function replaceProject(next: Project) {
    stop();
    allNotesOff();
    store.update(() => next);
    launches.clear();
    inputs.clear();
    armFirstClips();
    emit();
  }

  /** Release every live note, including any that lost their key-up. */
  function allNotesOff() {
    releaseAll();
    if (audio) audio.engine.allNotesOff(audio.ctx.currentTime);
  }

  return {
    ensureAudio,
    allNotesOff,
    play,
    stop,
    toggle: () => (flags.playing ? stop() : play()),
    setRecording(recording: boolean) {
      flags = { ...flags, recording };
      emit();
    },
    setMetronome(metronome: boolean) {
      flags = { ...flags, metronome };
      saveFlag(METRONOME_KEY, metronome);
      emit();
    },
    setPreview(preview: boolean) {
      flags = { ...flags, preview };
      saveFlag(PREVIEW_KEY, preview);
      emit();
    },
    launch,
    launchScene,
    replaceProject,
    recordInto,
    capture,
    stopAll,
    hit,
    release,
    releaseAll,
    /** Where a clip is playing on a track, in ticks within the clip, or null. Safe to call every frame. */
    clipPosition(trackId: Id, clipId: Id, length: Tick): Tick | null {
      const at = audio?.transport.clipPosition(trackId);
      return at && at.clipId === clipId ? mod(at.tick, length) : null;
    },
    /** Pitches currently played live on a track. Safe to call every frame. */
    livePitches: (trackId: Id): ReadonlyMap<number, number> | undefined =>
      live.get(trackId),
    /** The clip each track is playing (or will play on start), for export. */
    clipChoice(): ClipChoice {
      const choice: ClipChoice = {};
      for (const [id, l] of launches)
        if (l.active) choice[id] = l.active.clipId;
      return choice;
    },
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      unsubscribe();
      if (!audio) return;
      audio.transport.dispose();
      audio.engine.dispose();
      audio.metronome.dispose();
      void audio.ctx.close();
      audio = null;
    },
  };
}
