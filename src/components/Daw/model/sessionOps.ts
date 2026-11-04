import {
  createDrumTrack,
  createScene,
  createSynthTrack,
  trackHue,
} from "./defaults";
import { newId, updateTrack } from "./ops";
import type { Clip, Id, Project, Track } from "./types";
import { ticksPerBar } from "./time";

/** Session view edits: tracks, scenes, and clips in slots. */

export type TrackKind = "drums" | "synth" | "quickSynth" | "fmSynth";

export const TRACK_KINDS: Record<TrackKind, string> = {
  drums: "Drums",
  quickSynth: "Quick Synth",
  synth: "Synth",
  fmSynth: "FM Synth",
};

export function addTrack(doc: Project, kind: TrackKind): Project {
  const index = doc.tracks.length;
  const name = TRACK_KINDS[kind];
  const count = doc.tracks.filter((t) => t.name.startsWith(name)).length;
  const label = count ? `${name} ${count + 1}` : name;
  const hue = trackHue(index);
  const track =
    kind === "drums"
      ? createDrumTrack(label, hue, doc.scenes.length)
      : createSynthTrack(label, hue, doc.scenes.length, kind);
  return { ...doc, tracks: [...doc.tracks, track] };
}

/** Remove clips no slot points at any more. */
function pruneClips(doc: Project): Project {
  const used = new Set(doc.tracks.flatMap((t) => t.slots));
  const ids = Object.keys(doc.clips);
  if (ids.every((id) => used.has(id))) return doc;
  return {
    ...doc,
    clips: Object.fromEntries(
      ids.filter((id) => used.has(id)).map((id) => [id, doc.clips[id]]),
    ),
  };
}

export const deleteTrack = (doc: Project, trackId: Id) =>
  pruneClips({ ...doc, tracks: doc.tracks.filter((t) => t.id !== trackId) });

export function insertScene(doc: Project, index: number): Project {
  const scenes = [...doc.scenes];
  scenes.splice(index, 0, createScene());
  return {
    ...doc,
    scenes,
    tracks: doc.tracks.map((t) => {
      const slots = [...t.slots];
      slots.splice(index, 0, null);
      return { ...t, slots };
    }),
  };
}

export function deleteScene(doc: Project, index: number): Project {
  if (doc.scenes.length <= 1) return doc;
  return pruneClips({
    ...doc,
    scenes: doc.scenes.filter((_, i) => i !== index),
    tracks: doc.tracks.map((t) => ({
      ...t,
      slots: t.slots.filter((_, i) => i !== index),
    })),
  });
}

export const renameScene = (doc: Project, index: number, name: string) => ({
  ...doc,
  scenes: doc.scenes.map((s, i) => (i === index ? { ...s, name } : s)),
});

export const updateTrackFields = (
  doc: Project,
  trackId: Id,
  patch: Partial<Pick<Track, "name" | "volume" | "pan" | "mute" | "solo">>,
) => updateTrack(doc, trackId, (t) => ({ ...t, ...patch }));

function setSlot(doc: Project, trackId: Id, scene: number, clipId: Id | null) {
  return updateTrack(doc, trackId, (t) => {
    if (t.slots[scene] === clipId) return t;
    const slots = [...t.slots];
    slots[scene] = clipId;
    return { ...t, slots };
  });
}

/** An empty one-bar clip in an empty slot. */
export function createClip(doc: Project, trackId: Id, scene: number): Project {
  const track = doc.tracks.find((t) => t.id === trackId);
  if (!track || track.slots[scene]) return doc;
  const clip: Clip = {
    id: newId(),
    name: `Clip ${Object.keys(doc.clips).length + 1}`,
    hue: track.hue,
    length: ticksPerBar(doc.timeSignature),
    notes: [],
  };
  return setSlot(
    { ...doc, clips: { ...doc.clips, [clip.id]: clip } },
    trackId,
    scene,
    clip.id,
  );
}

export const deleteClip = (doc: Project, trackId: Id, scene: number) =>
  pruneClips(setSlot(doc, trackId, scene, null));

export const renameClip = (doc: Project, clipId: Id, name: string): Project => {
  const clip = doc.clips[clipId];
  if (!clip || clip.name === name) return doc;
  return { ...doc, clips: { ...doc.clips, [clipId]: { ...clip, name } } };
};

/**
 * Copy a clip into the slot below, inserting a scene if that slot is taken
 * (Ableton's Cmd+D in session view). Returns the new doc and slot.
 */
export function duplicateClip(
  doc: Project,
  trackId: Id,
  scene: number,
): { doc: Project; scene: number } {
  const track = doc.tracks.find((t) => t.id === trackId);
  const source = track?.slots[scene]
    ? doc.clips[track.slots[scene]]
    : undefined;
  if (!track || !source) return { doc, scene };
  const target = scene + 1;
  let next =
    target < doc.scenes.length && !track.slots[target]
      ? doc
      : insertScene(doc, target);
  const copy: Clip = {
    ...source,
    id: newId(),
    notes: source.notes.map((n) => ({ ...n, id: newId() })),
  };
  next = { ...next, clips: { ...next.clips, [copy.id]: copy } };
  return { doc: setSlot(next, trackId, target, copy.id), scene: target };
}

export type Slot = { trackId: Id; scene: number };

const clipAt = (doc: Project, slot: Slot) => {
  const id = doc.tracks.find((t) => t.id === slot.trackId)?.slots[slot.scene];
  return id ? doc.clips[id] : undefined;
};

const copyOf = (clip: Clip): Clip => ({
  ...clip,
  id: newId(),
  notes: clip.notes.map((n) => ({ ...n, id: newId() })),
});

/** Put a copy of a clip in a slot, replacing what's there (paste). */
export function placeClip(doc: Project, clip: Clip, to: Slot): Project {
  const copy = copyOf(clip);
  return pruneClips(
    setSlot(
      { ...doc, clips: { ...doc.clips, [copy.id]: copy } },
      to.trackId,
      to.scene,
      copy.id,
    ),
  );
}

/** Drag a clip to another slot (any track). Replaces the target; `copy` leaves the source. */
export function moveClip(
  doc: Project,
  from: Slot,
  to: Slot,
  copy: boolean,
): Project {
  const clip = clipAt(doc, from);
  if (!clip || (from.trackId === to.trackId && from.scene === to.scene))
    return doc;
  if (copy) return placeClip(doc, clip, to);
  const cleared = setSlot(doc, from.trackId, from.scene, null);
  return pruneClips(setSlot(cleared, to.trackId, to.scene, clip.id));
}

export function moveTrack(doc: Project, trackId: Id, toIndex: number): Project {
  const from = doc.tracks.findIndex((t) => t.id === trackId);
  const to = Math.max(0, Math.min(doc.tracks.length - 1, toIndex));
  if (from < 0 || from === to) return doc;
  const tracks = [...doc.tracks];
  const [track] = tracks.splice(from, 1);
  tracks.splice(to, 0, track);
  return { ...doc, tracks };
}

/** Put a new clip (as given) into a slot. */
export const putClip = (doc: Project, clip: Clip, to: Slot) =>
  pruneClips(
    setSlot(
      { ...doc, clips: { ...doc.clips, [clip.id]: clip } },
      to.trackId,
      to.scene,
      clip.id,
    ),
  );

/**
 * Where a captured clip goes: the selected slot if it's empty, else the next
 * empty slot below it, else a new scene at the bottom.
 */
export function freeSlot(
  doc: Project,
  trackId: Id,
  from: number,
): { doc: Project; scene: number } {
  const track = doc.tracks.find((t) => t.id === trackId);
  if (!track) return { doc, scene: from };
  for (let s = Math.max(0, from); s < track.slots.length; s++) {
    if (!track.slots[s]) return { doc, scene: s };
  }
  return { doc: insertScene(doc, doc.scenes.length), scene: doc.scenes.length };
}
