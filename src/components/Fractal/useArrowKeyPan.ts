import { useEffect, useRef } from "react";
import { clamp } from "@/lib/utils";
import type { Vec2 } from "./MandelbrotVisualization";

const DEFAULT_CONFIG = {
  accel: 0.002,
  damping: 0.88,
  maxSpeed: 0.002,
  initialSpeed: 0.006,
  boostMultiplier: 5.5,
  zoomSpeed: 0.0005,
  minZoom: 0.1,
  maxZoom: 10_000_000,
} as const;

type UseArrowKeyPanOptions = {
  center: Vec2;
  setCenter: (v: Vec2) => void;
  zoom: number;
  setZoom: (z: number) => void;
  config?: Partial<typeof DEFAULT_CONFIG>;
};

export function useArrowKeyPan({
  center,
  setCenter,
  zoom,
  setZoom,
  config = {},
}: UseArrowKeyPanOptions) {
  const {
    accel,
    damping,
    maxSpeed,
    initialSpeed,
    boostMultiplier,
    zoomSpeed,
    minZoom,
    maxZoom,
  } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const velocity = useRef<Vec2>({ x: 0, y: 0 });
  const keys = useRef<Record<string, boolean>>({});
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const PAN_EPSILON = 1e-12;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!keys.current[e.key]) {
        if (!e.altKey) {
          const currentPanScale = Math.max(1 / zoomRef.current, PAN_EPSILON);
          if (e.key === "ArrowUp")
            velocity.current.y += initialSpeed * currentPanScale;
          if (e.key === "ArrowDown")
            velocity.current.y -= initialSpeed * currentPanScale;
          if (e.key === "ArrowLeft")
            velocity.current.x -= initialSpeed * currentPanScale;
          if (e.key === "ArrowRight")
            velocity.current.x += initialSpeed * currentPanScale;
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

      const currentPanScale = Math.max(1 / zoomRef.current, PAN_EPSILON);
      const a = accel * boost * currentPanScale;
      const max = maxSpeed * boost * currentPanScale;

      if (keys.current["Alt"]) {
        const boostedZoomSpeed = zoomSpeed * boost;
        if (keys.current["ArrowUp"]) {
          setZoom(
            clamp(zoomRef.current * (1 + boostedZoomSpeed), minZoom, maxZoom),
          );
        }
        if (keys.current["ArrowDown"]) {
          setZoom(
            clamp(zoomRef.current * (1 - boostedZoomSpeed), minZoom, maxZoom),
          );
        }
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
        setCenter({
          x: centerRef.current.x + v.x,
          y: centerRef.current.y + v.y,
        });
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
    setCenter,
    setZoom,
    accel,
    damping,
    maxSpeed,
    initialSpeed,
    boostMultiplier,
    zoomSpeed,
    minZoom,
    maxZoom,
  ]);
}
