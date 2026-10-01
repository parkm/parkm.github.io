import { useEffect, useRef } from "react";
import { VIEW_SPAN, type Vec2 } from "./view";

const DEFAULT_CONFIG = {
  accel: 0.002,
  damping: 0.88,
  maxSpeed: 0.002,
  initialSpeed: 0.006,
  boostMultiplier: 5.5,
  zoomSpeed: 0.0005,
} as const;

type UseArrowKeyPanOptions = {
  // Pans by a screen offset in view heights.
  panBy: (delta: Vec2) => void;
  zoomBy: (factor: number) => void;
  config?: Partial<Record<keyof typeof DEFAULT_CONFIG, number>>;
};

export function useArrowKeyPan({
  panBy,
  zoomBy,
  config = {},
}: UseArrowKeyPanOptions) {
  const { accel, damping, maxSpeed, initialSpeed, boostMultiplier, zoomSpeed } =
    {
      ...DEFAULT_CONFIG,
      ...config,
    };

  // In plane units at zoom 1, so panning feels the same at any depth.
  const velocity = useRef<Vec2>({ x: 0, y: 0 });
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const PAN_EPSILON = 1e-7;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!keys.current[e.key]) {
        if (!e.altKey) {
          if (e.key === "ArrowUp") velocity.current.y += initialSpeed;
          if (e.key === "ArrowDown") velocity.current.y -= initialSpeed;
          if (e.key === "ArrowLeft") velocity.current.x -= initialSpeed;
          if (e.key === "ArrowRight") velocity.current.x += initialSpeed;
        }
      }
      keys.current[e.key] = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let rafId: number;

    const loop = () => {
      const v = velocity.current;
      const boost = keys.current["Shift"] ? boostMultiplier : 1;

      const a = accel * boost;
      const max = maxSpeed * boost;

      if (keys.current["Alt"]) {
        const boostedZoomSpeed = zoomSpeed * boost;
        if (keys.current["ArrowUp"]) zoomBy(1 + boostedZoomSpeed);
        if (keys.current["ArrowDown"]) zoomBy(1 - boostedZoomSpeed);
      } else {
        if (keys.current["ArrowUp"]) v.y += a;
        if (keys.current["ArrowDown"]) v.y -= a;
        if (keys.current["ArrowLeft"]) v.x -= a;
        if (keys.current["ArrowRight"]) v.x += a;
      }

      const speed = Math.hypot(v.x, v.y);
      if (speed > max) {
        const s = max / speed;
        v.x *= s;
        v.y *= s;
      }

      v.x *= damping;
      v.y *= damping;

      if (Math.abs(v.x) > PAN_EPSILON || Math.abs(v.y) > PAN_EPSILON) {
        panBy({ x: v.x / VIEW_SPAN, y: v.y / VIEW_SPAN });
      }

      rafId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    panBy,
    zoomBy,
    accel,
    damping,
    maxSpeed,
    initialSpeed,
    boostMultiplier,
    zoomSpeed,
  ]);
}
