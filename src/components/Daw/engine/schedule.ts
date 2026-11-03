import type { Tick } from "../model/time";
import type { Clip, Id, Note, Project, Track } from "../model/types";

/** Which clip each track plays, by track id. */
export type ClipChoice = Record<Id, Id>;

export function chosenClip(
  doc: Project,
  track: Track,
  clips: ClipChoice,
): Clip | null {
  const id = clips[track.id];
  return (id && doc.clips[id]) || null;
}

/**
 * Visit every note of a looping clip that starts in [from, to), where ticks
 * count from the start of playback. No allocation per call.
 */
export function forEachNoteInRange(
  clip: Clip,
  from: Tick,
  to: Tick,
  visit: (note: Note, at: Tick) => void,
) {
  const length = clip.length;
  if (length <= 0 || to <= from) return;
  // Only the loop window plays; `at` counts from its start.
  const loopStart = clip.loopStart ?? 0;
  const loopEnd = loopStart + length;
  const last = Math.floor((to - 1) / length);
  for (let loop = Math.floor(from / length); loop <= last; loop++) {
    const offset = loop * length - loopStart;
    for (const note of clip.notes) {
      if (note.start < loopStart || note.start >= loopEnd) continue;
      const at = offset + note.start;
      if (at >= from && at < to) visit(note, at);
    }
  }
}

/** Longest chosen clip, used as the export length. */
export function loopLength(doc: Project, clips: ClipChoice): Tick {
  let length = 0;
  for (const track of doc.tracks) {
    const clip = chosenClip(doc, track, clips);
    if (clip) length = Math.max(length, clip.length);
  }
  return length;
}
