import { useEffect, useRef } from "react";
import type { Session } from "../engine/session";
import type { Tick } from "../model/time";
import type { Id, Note } from "../model/types";

/**
 * Scrubbing: hear the notes under the pointer. Notes the scrub position is
 * inside are held (a chord you hover over keeps sounding); notes you enter
 * start; notes swept past between two pointer samples get a short blip so
 * fast moves don't skip anything. Everything plays as an audition, so it's
 * never recorded or captured.
 */

/** Hold this key and move the pointer over a clip editor. */
export const SCRUB_KEY = "KeyQ";
const BLIP = 0.12;

export type Scrubber = {
  move: (notes: readonly Note[], tick: Tick) => void;
  stop: () => void;
};

export function createScrubber(
  session: Session,
  trackId: Id,
  grid: Tick,
): Scrubber {
  const sounding = new Map<Id, number>();
  let last: Tick | null = null;
  const inside = (n: Note, t: Tick) => n.start <= t && t < n.start + n.duration;

  return {
    move(notes, tick) {
      const active = new Map<Id, Note>();
      for (const n of notes) if (inside(n, tick)) active.set(n.id, n);

      for (const [id, pitch] of sounding) {
        if (active.has(id)) continue;
        session.release(trackId, pitch);
        sounding.delete(id);
      }
      const pitches = new Set(sounding.values());
      for (const n of active.values()) {
        if (sounding.has(n.id) || pitches.has(n.pitch)) continue;
        session.hit(trackId, n.pitch, n.velocity, grid, { audition: true });
        sounding.set(n.id, n.pitch);
        pitches.add(n.pitch);
      }

      if (last !== null) {
        const lo = Math.min(last, tick);
        const hi = Math.max(last, tick);
        for (const n of notes) {
          if (active.has(n.id) || inside(n, last)) continue;
          if (n.start <= hi && n.start + n.duration > lo) {
            session.hit(trackId, n.pitch, n.velocity, grid, { duration: BLIP });
          }
        }
      }
      last = tick;
    },
    stop() {
      for (const pitch of sounding.values()) session.release(trackId, pitch);
      sounding.clear();
      last = null;
    },
  };
}

/**
 * Track whether the scrub key is held (ignoring typing in fields), calling
 * `onChange` on press and release. Returns a ref with the current state.
 */
export function useScrubKey(onChange: (held: boolean) => void) {
  const held = useRef(false);
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      (e.target as HTMLElement).closest?.(
        "input, textarea, select, [contenteditable]",
      );
    const set = (next: boolean) => {
      if (held.current === next) return;
      held.current = next;
      callback.current(next);
    };
    const down = (e: KeyboardEvent) => {
      if (
        e.code !== SCRUB_KEY ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        typing(e)
      )
        return;
      e.preventDefault();
      set(true);
    };
    const up = (e: KeyboardEvent) => e.code === SCRUB_KEY && set(false);
    const blur = () => set(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  return held;
}
