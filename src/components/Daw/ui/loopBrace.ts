import type { Tick } from "../model/time";

/**
 * The loop brace, shared by the clip editors: drag its ends to resize the
 * loop, its middle to move it, or drag on empty strip to draw a new one.
 * Snaps to the grid; ⌘ drags freely.
 */

export type LoopRange = { start: Tick; length: Tick };
export type BraceHandle = "start" | "end" | "move" | "draw";

const EDGE_PX = 6;

/** Which part of the brace is under `px` (pixels in the same space as startPx/endPx). */
export function braceHandleAt(
  px: number,
  startPx: number,
  endPx: number,
): BraceHandle {
  if (Math.abs(px - startPx) <= EDGE_PX) return "start";
  if (Math.abs(px - endPx) <= EDGE_PX) return "end";
  if (px > startPx && px < endPx) return "move";
  return "draw";
}

export function dragBrace(
  handle: BraceHandle,
  orig: LoopRange,
  /** Tick where the drag started and where the pointer is now. */
  from: Tick,
  to: Tick,
  grid: Tick,
  free: boolean,
): LoopRange {
  const snap = (t: Tick) =>
    Math.max(0, free ? Math.round(t) : Math.round(t / grid) * grid);
  const min = free ? 1 : grid;
  const end = orig.start + orig.length;
  switch (handle) {
    case "move":
      return { start: snap(orig.start + to - from), length: orig.length };
    case "start": {
      const start = Math.min(end - min, snap(orig.start + to - from));
      return { start, length: end - start };
    }
    case "end":
      return {
        start: orig.start,
        length: Math.max(min, snap(end + to - from) - orig.start),
      };
    case "draw": {
      const a = snap(from);
      const b = snap(to);
      return { start: Math.min(a, b), length: Math.max(min, Math.abs(b - a)) };
    }
  }
}

export const braceCursor = (handle: BraceHandle) =>
  handle === "move" ? "grab" : handle === "draw" ? "crosshair" : "ew-resize";
