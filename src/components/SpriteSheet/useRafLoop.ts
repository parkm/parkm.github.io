import { useEffect, useRef } from "react";

export function useRafLoop(
  callback: (ts: number) => void,
  enabled: boolean,
): void {
  const rafRef = useRef<number | null>(null);
  const callbackRef = useRef<(ts: number) => void>(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;

    let active = true;
    const loop = (ts: number) => {
      if (!active) return;
      callbackRef.current(ts);
      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);

    return () => {
      active = false;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled]);
}
