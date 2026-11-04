import { useSyncExternalStore } from "react";
import type { Tick } from "../model/time";
import type { Id } from "../model/types";

/**
 * The insert marker: a point in the selected clip, placed by clicking the
 * editor's ruler. Paste goes there, and the clip bar's Set buttons move the
 * loop start or end to it. Shared by both editors; not part of the document.
 */

let marker: { clipId: Id; tick: Tick } | null = null;
const listeners = new Set<() => void>();

export const insertMarker = {
  get: (clipId: Id): Tick | null =>
    marker?.clipId === clipId ? marker.tick : null,
  set(clipId: Id, tick: Tick | null) {
    const next = tick === null ? null : { clipId, tick };
    if (next?.tick === marker?.tick && next?.clipId === marker?.clipId) return;
    if (!next && marker?.clipId !== clipId) return;
    marker = next;
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useInsertMarker = (clipId: Id) =>
  useSyncExternalStore(insertMarker.subscribe, () => insertMarker.get(clipId));
