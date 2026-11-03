import { mod, type Tick } from "./time";
import type {
  Clip,
  DrumKitDevice,
  Id,
  Note,
  Pad,
  Project,
  Track,
} from "./types";

/** Pure document edits. Each returns a new Project, or the same one if nothing changed. */

export const newId = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_VELOCITY = 100 / 127;
const MAX_CLIP_LENGTH = 960 * 4 * 32;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The step a note is shown in: nearest grid line, wrapping at the clip end. */
export const cellOf = (start: Tick, grid: Tick, steps: number) =>
  mod(Math.round(start / grid), steps);

// The loop window ---------------------------------------------------------------

export const loopStartOf = (clip: Clip) => clip.loopStart ?? 0;
export const loopEndOf = (clip: Clip) => loopStartOf(clip) + clip.length;
export const inLoop = (n: Note, clip: Clip) =>
  n.start >= loopStartOf(clip) && n.start < loopEndOf(clip);
/** A tick inside the loop window, wrapping (`rel` counts from the loop start). */
export const loopTick = (clip: Clip, rel: Tick) =>
  loopStartOf(clip) + mod(rel, clip.length);

const VIEW_UNIT = 960 * 4;

/**
 * How much of the clip the editors show: the loop and every note, rounded up
 * to whole bars, so notes outside the loop stay visible (and editable).
 */
export function clipViewEnd(clip: Clip): Tick {
  let end = loopEndOf(clip);
  for (const n of clip.notes) end = Math.max(end, n.start + 1);
  return Math.ceil(end / VIEW_UNIT) * VIEW_UNIT;
}

/** Steps shown in the step grid. */
const stepCount = (clip: Clip, grid: Tick) =>
  Math.max(1, Math.floor(clipViewEnd(clip) / grid));

const inCell = (
  n: Note,
  pitch: number,
  step: number,
  grid: Tick,
  steps: number,
) =>
  n.pitch === pitch &&
  n.start < steps * grid &&
  cellOf(n.start, grid, steps) === step;

export function updateClip(
  doc: Project,
  clipId: Id,
  fn: (clip: Clip) => Clip,
): Project {
  const clip = doc.clips[clipId];
  if (!clip) return doc;
  const next = fn(clip);
  if (next === clip) return doc;
  return { ...doc, clips: { ...doc.clips, [clipId]: next } };
}

export function updateTrack(
  doc: Project,
  trackId: Id,
  fn: (track: Track) => Track,
): Project {
  let changed = false;
  const tracks = doc.tracks.map((t) => {
    if (t.id !== trackId) return t;
    const next = fn(t);
    if (next !== t) changed = true;
    return next;
  });
  return changed ? { ...doc, tracks } : doc;
}

export function updatePad(
  doc: Project,
  trackId: Id,
  padId: Id,
  fn: (pad: Pad) => Pad,
): Project {
  return updateTrack(doc, trackId, (track) => {
    let changed = false;
    const devices = track.devices.map((d) => {
      if (d.type !== "drumKit") return d;
      const pads = d.pads.map((p) => {
        if (p.id !== padId) return p;
        const next = fn(p);
        if (next !== p) changed = true;
        return next;
      });
      return changed ? { ...d, pads } : d;
    });
    return changed ? { ...track, devices } : track;
  });
}

export const setPadParam = (
  doc: Project,
  trackId: Id,
  padId: Id,
  key: string,
  value: number,
) =>
  updatePad(doc, trackId, padId, (p) =>
    p.params[key] === value
      ? p
      : { ...p, params: { ...p.params, [key]: value } },
  );

export const drumKitOf = (
  track: Track | undefined,
): DrumKitDevice | undefined =>
  track?.devices.find((d): d is DrumKitDevice => d.type === "drumKit");

// Step editing ---------------------------------------------------------------

export function addStep(
  doc: Project,
  clipId: Id,
  pitch: number,
  step: number,
  grid: Tick,
  velocity = DEFAULT_VELOCITY,
): Project {
  return updateClip(doc, clipId, (clip) => {
    const steps = stepCount(clip, grid);
    if (clip.notes.some((n) => inCell(n, pitch, step, grid, steps)))
      return clip;
    const note: Note = {
      id: newId(),
      pitch,
      start: step * grid,
      duration: grid,
      velocity,
    };
    return { ...clip, notes: [...clip.notes, note] };
  });
}

export function eraseStep(
  doc: Project,
  clipId: Id,
  pitch: number,
  step: number,
  grid: Tick,
) {
  return updateClip(doc, clipId, (clip) => {
    const steps = stepCount(clip, grid);
    const notes = clip.notes.filter(
      (n) => !inCell(n, pitch, step, grid, steps),
    );
    return notes.length === clip.notes.length ? clip : { ...clip, notes };
  });
}

export function setStepVelocity(
  doc: Project,
  clipId: Id,
  pitch: number,
  step: number,
  grid: Tick,
  velocity: number,
) {
  const v = Math.max(1 / 127, clamp01(velocity));
  return updateClip(doc, clipId, (clip) => {
    const steps = stepCount(clip, grid);
    let changed = false;
    const notes = clip.notes.map((n) => {
      if (!inCell(n, pitch, step, grid, steps) || n.velocity === v) return n;
      changed = true;
      return { ...n, velocity: v };
    });
    return changed ? { ...clip, notes } : clip;
  });
}

export function stepVelocity(
  clip: Clip,
  pitch: number,
  step: number,
  grid: Tick,
) {
  const steps = stepCount(clip, grid);
  return clip.notes.find((n) => inCell(n, pitch, step, grid, steps))?.velocity;
}

// Row edits ------------------------------------------------------------------

function mapRow(
  doc: Project,
  clipId: Id,
  pitch: number,
  fn: (notes: Note[], clip: Clip) => Note[],
) {
  return updateClip(doc, clipId, (clip) => {
    const inRow = (n: Note) => n.pitch === pitch && inLoop(n, clip);
    const row = clip.notes.filter(inRow);
    const next = fn(row, clip);
    if (row.length === 0 && next.length === 0) return clip;
    return {
      ...clip,
      notes: [...clip.notes.filter((n) => !inRow(n)), ...next],
    };
  });
}

export const shiftRow = (doc: Project, clipId: Id, pitch: number, by: Tick) =>
  mapRow(doc, clipId, pitch, (row, clip) =>
    row.map((n) => ({
      ...n,
      start: loopTick(clip, n.start - loopStartOf(clip) + by),
    })),
  );

export const clearRow = (doc: Project, clipId: Id, pitch: number) =>
  mapRow(doc, clipId, pitch, () => []);

export const humanizeRow = (doc: Project, clipId: Id, pitch: number) =>
  mapRow(doc, clipId, pitch, (row, clip) =>
    row.map((n) => ({
      ...n,
      start: loopTick(
        clip,
        n.start - loopStartOf(clip) + Math.round((Math.random() - 0.5) * 16),
      ),
      velocity: Math.max(
        0.1,
        clamp01(n.velocity + (Math.random() - 0.5) * 0.25),
      ),
    })),
  );

export const randomizeRow = (
  doc: Project,
  clipId: Id,
  pitch: number,
  grid: Tick,
  density: number,
) =>
  mapRow(doc, clipId, pitch, (_row, clip) => {
    const notes: Note[] = [];
    for (let t = loopStartOf(clip); t < loopEndOf(clip); t += grid) {
      if (Math.random() >= density) continue;
      notes.push({
        id: newId(),
        pitch,
        start: t,
        duration: grid,
        velocity: 0.45 + Math.random() * 0.55,
      });
    }
    return notes;
  });

// Clip edits -----------------------------------------------------------------

export const setClipLength = (doc: Project, clipId: Id, length: Tick) =>
  updateClip(doc, clipId, (clip) =>
    clip.length === length
      ? clip
      : { ...clip, length: Math.min(length, MAX_CLIP_LENGTH) },
  );

/**
 * Double the loop, repeating its content (Ableton's "Duplicate Loop").
 * Notes after the loop move later to make room.
 */
export const doubleClip = (doc: Project, clipId: Id) =>
  updateClip(doc, clipId, (clip) => {
    if (clip.length * 2 > MAX_CLIP_LENGTH) return clip;
    const end = loopEndOf(clip);
    const copies = clip.notes
      .filter((n) => inLoop(n, clip))
      .map((n) => ({ ...n, id: newId(), start: n.start + clip.length }));
    const notes = clip.notes.map((n) =>
      n.start >= end ? { ...n, start: n.start + clip.length } : n,
    );
    return { ...clip, length: clip.length * 2, notes: [...notes, ...copies] };
  });

/** Move or resize the loop (the loop brace). */
export const setLoop = (
  doc: Project,
  clipId: Id,
  loopStart: Tick,
  length: Tick,
) =>
  updateClip(doc, clipId, (clip) =>
    loopStartOf(clip) === loopStart && clip.length === length
      ? clip
      : {
          ...clip,
          loopStart: Math.max(0, loopStart),
          length: Math.max(1, Math.min(length, MAX_CLIP_LENGTH)),
        },
  );

/**
 * Crop to the loop, like Ableton: notes outside it are removed, ones running
 * past its end are shortened, and the loop becomes the start of the clip.
 */
export const cropClip = (doc: Project, clipId: Id) =>
  updateClip(doc, clipId, (clip) => {
    const start = loopStartOf(clip);
    const end = loopEndOf(clip);
    const notes = clip.notes
      .filter((n) => inLoop(n, clip))
      .map((n) => ({
        ...n,
        start: n.start - start,
        duration: Math.min(n.duration, end - n.start),
      }));
    if (start === 0 && notes.length === clip.notes.length) {
      const trimmed = notes.some(
        (n, i) => n.duration !== clip.notes[i].duration,
      );
      if (!trimmed) return clip;
    }
    return { ...clip, loopStart: 0, notes };
  });

/** Whether Crop would change anything. */
export const canCrop = (clip: Clip) =>
  loopStartOf(clip) > 0 ||
  clip.notes.some(
    (n) => !inLoop(n, clip) || n.start + n.duration > loopEndOf(clip),
  );

/** Add a note at an exact tick unless one is already there (live recording). */
export function recordNote(
  doc: Project,
  clipId: Id,
  pitch: number,
  start: Tick,
  duration: Tick,
  velocity: number,
) {
  return updateClip(doc, clipId, (clip) => {
    if (
      clip.notes.some(
        (n) => n.pitch === pitch && Math.abs(n.start - start) < duration / 2,
      )
    ) {
      return clip;
    }
    return {
      ...clip,
      notes: [...clip.notes, { id: newId(), pitch, start, duration, velocity }],
    };
  });
}

/** Set the length of the note at an exact start (finishing a recorded held note). */
export const setNoteLength = (
  doc: Project,
  clipId: Id,
  pitch: number,
  start: Tick,
  duration: Tick,
) =>
  updateClip(doc, clipId, (clip) => {
    let changed = false;
    const notes = clip.notes.map((n) => {
      if (n.pitch !== pitch || n.start !== start || n.duration === duration) {
        return n;
      }
      changed = true;
      return { ...n, duration };
    });
    return changed ? { ...clip, notes } : clip;
  });

// Note editing (piano roll) -------------------------------------------------

export const addNotes = (doc: Project, clipId: Id, notes: Note[]) =>
  notes.length === 0
    ? doc
    : updateClip(doc, clipId, (clip) => ({
        ...clip,
        notes: [...clip.notes, ...notes],
      }));

export const removeNotes = (doc: Project, clipId: Id, ids: Set<Id>) =>
  updateClip(doc, clipId, (clip) => {
    const notes = clip.notes.filter((n) => !ids.has(n.id));
    return notes.length === clip.notes.length ? clip : { ...clip, notes };
  });

/** Replace notes by id with edited copies. */
export const patchNotes = (doc: Project, clipId: Id, edits: Map<Id, Note>) =>
  edits.size === 0
    ? doc
    : updateClip(doc, clipId, (clip) => ({
        ...clip,
        notes: clip.notes.map((n) => edits.get(n.id) ?? n),
      }));

/**
 * Add notes on top of a clip (capture overdub). The clip doubles, repeating
 * its content, until it's at least `minLength` long. Notes that duplicate an
 * existing one (same pitch, within a 32nd) are skipped.
 */
export function overdubClip(
  doc: Project,
  clipId: Id,
  /** Starts count from the loop start (they wrap into the loop). */
  notes: Omit<Note, "id">[],
  minLength: Tick,
): Project {
  return updateClip(doc, clipId, (clip) => {
    const start = loopStartOf(clip);
    const end = loopEndOf(clip);
    let length = clip.length;
    let inside = clip.notes.filter((n) => inLoop(n, clip));
    while (length < minLength && length * 2 <= MAX_CLIP_LENGTH) {
      const offset = length;
      inside = [
        ...inside,
        ...inside.map((n) => ({ ...n, id: newId(), start: n.start + offset })),
      ];
      length *= 2;
    }
    // Notes outside the loop stay; ones after it move later if it grew.
    const outside = clip.notes
      .filter((n) => !inLoop(n, clip))
      .map((n) =>
        n.start >= end ? { ...n, start: n.start + length - clip.length } : n,
      );
    const added: Note[] = [];
    for (const n of notes) {
      const at = start + mod(n.start, length);
      const dup = [...inside, ...added].some(
        (e) => e.pitch === n.pitch && Math.abs(e.start - at) < 30,
      );
      if (!dup) added.push({ ...n, id: newId(), start: at });
    }
    if (added.length === 0 && length === clip.length) return clip;
    return { ...clip, length, notes: [...outside, ...inside, ...added] };
  });
}

export type QuantizeOptions = {
  /** 0..1: how far toward the grid each note moves (1 = all the way). */
  amount?: number;
  /** Also snap note ends, so lengths become whole grid steps. */
  ends?: boolean;
};

/** Snap notes to the grid (all notes, or just `ids`). */
export const quantizeNotes = (
  doc: Project,
  clipId: Id,
  grid: Tick,
  ids?: Set<Id>,
  { amount = 1, ends = false }: QuantizeOptions = {},
) =>
  updateClip(doc, clipId, (clip) => {
    let changed = false;
    const toward = (t: Tick) => t + (Math.round(t / grid) * grid - t) * amount;
    const notes = clip.notes.map((n) => {
      if (ids && !ids.has(n.id)) return n;
      const start = Math.round(toward(n.start));
      const end = ends
        ? Math.round(toward(n.start + n.duration))
        : start + n.duration;
      const duration = Math.max(
        ends ? Math.round(grid * amount) || 1 : 1,
        end - start,
      );
      if (start === n.start && duration === n.duration) return n;
      changed = true;
      return { ...n, start, duration };
    });
    return changed ? { ...clip, notes } : clip;
  });

/** Extend each note (all, or `ids`) to the next note's start; the last runs to the loop end. */
export const legatoNotes = (doc: Project, clipId: Id, ids?: Set<Id>) =>
  updateClip(doc, clipId, (clip) => {
    const starts = [...new Set(clip.notes.map((n) => n.start))].sort(
      (a, b) => a - b,
    );
    let changed = false;
    const notes = clip.notes.map((n) => {
      if (ids && !ids.has(n.id)) return n;
      const next =
        starts.find((s) => s > n.start) ??
        Math.max(loopEndOf(clip), n.start + n.duration);
      const duration = next - n.start;
      if (duration === n.duration || duration <= 0) return n;
      changed = true;
      return { ...n, duration };
    });
    return changed ? { ...clip, notes } : clip;
  });

/** Stretch notes in time around `anchor` by `factor` (positions and lengths). */
export const stretchNotes = (
  doc: Project,
  clipId: Id,
  ids: Set<Id>,
  anchor: Tick,
  factor: number,
) =>
  updateClip(doc, clipId, (clip) => ({
    ...clip,
    notes: clip.notes.map((n) =>
      ids.has(n.id)
        ? {
            ...n,
            start: Math.max(
              0,
              Math.round(anchor + (n.start - anchor) * factor),
            ),
            duration: Math.max(1, Math.round(n.duration * factor)),
          }
        : n,
    ),
  }));

/** Rotate every note in the loop by `by` ticks, wrapping at the loop end (fixing a downbeat). */
export const shiftClip = (doc: Project, clipId: Id, by: Tick) =>
  updateClip(doc, clipId, (clip) => ({
    ...clip,
    notes: clip.notes.map((n) =>
      inLoop(n, clip)
        ? { ...n, start: loopTick(clip, n.start - loopStartOf(clip) + by) }
        : n,
    ),
  }));

/** Halve the loop. Notes in the second half are kept, just outside the loop. */
export const halveClip = (doc: Project, clipId: Id, minLength: Tick) =>
  updateClip(doc, clipId, (clip) =>
    clip.length / 2 < minLength ? clip : { ...clip, length: clip.length / 2 },
  );

/** Loop a time range and crop to it in one step ("crop to selection"). */
export const cropToRange = (doc: Project, clipId: Id, start: Tick, end: Tick) =>
  cropClip(setLoop(doc, clipId, start, Math.max(1, end - start)), clipId);
