import { useEffect, useRef, type RefObject } from "react";

/**
 * Two-finger pan and pinch for an editor, on top of its one-finger editing.
 * When a second finger lands, `onStart` lets the editor abandon whatever the
 * first finger began; from then until every finger lifts, touch events are
 * kept from the editor and reported as pan (pixels) and pinch (scale factor
 * around a point).
 */
export type TwoFingerHandlers = {
  onStart: () => void;
  onPan: (dx: number, dy: number) => void;
  /** Incremental scale since the last call, around `centerX` (client pixels). */
  onPinch?: (scale: number, centerX: number) => void;
};

export function useTwoFingerGestures(
  ref: RefObject<HTMLElement | null>,
  handlers: TwoFingerHandlers,
) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const touches = new Map<number, { x: number; y: number }>();
    let active = false;
    let last: { x: number; y: number; distance: number } | null = null;

    const measure = () => {
      const [a, b] = [...touches.values()];
      return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
      };
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && !active) {
        active = true;
        latest.current.onStart();
        last = measure();
      }
      if (active) e.stopPropagation();
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!active) return;
      e.stopPropagation();
      if (touches.size < 2 || !last) return;
      const now = measure();
      latest.current.onPan(now.x - last.x, now.y - last.y);
      if (last.distance > 0)
        latest.current.onPinch?.(now.distance / last.distance, now.x);
      last = now;
    };
    const up = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return;
      if (active) e.stopPropagation();
      if (touches.size < 2) last = null;
      if (touches.size === 0) active = false;
    };

    // Capture phase, so the editor never sees fingers that belong to a pan.
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, true);
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up, true);
    };
  }, [ref]);
}
