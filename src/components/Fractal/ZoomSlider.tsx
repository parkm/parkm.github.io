import React, { useCallback, useEffect, useRef, useState } from "react";

const ZOOM_SLIDER_HIDE_DELAY_MS = 750;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function tToZoom(t: number, minZoom: number, maxZoom: number): number {
  const tt = clamp(t, 0, 1);
  return minZoom * Math.pow(maxZoom / minZoom, tt);
}

function zoomToT(z: number, minZoom: number, maxZoom: number): number {
  const zz = clamp(z, minZoom, maxZoom);
  return Math.log(zz / minZoom) / Math.log(maxZoom / minZoom);
}

type ZoomSliderProps = {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (zoom: number) => void;
};

export function ZoomSlider({
  zoom,
  minZoom,
  maxZoom,
  onZoomChange,
}: ZoomSliderProps) {
  const [visible, setVisible] = useState(true);
  const [rendered, setRendered] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const show = useCallback(() => {
    setRendered(true);
    setVisible(true);

    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
    }

    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false);
    }, ZOOM_SLIDER_HIDE_DELAY_MS);
  }, []);

  const onOpacityTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "opacity") return;
      if (!visible) {
        setRendered(false);
      }
    },
    [visible],
  );

  useEffect(() => {
    show();
  }, [zoom, show]);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const sliderT = zoomToT(zoom, minZoom, maxZoom);

  const setFromClientY = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const y = clamp(clientY - rect.top, 0, rect.height);
      const t = 1 - y / rect.height;

      onZoomChange(tToZoom(t, minZoom, maxZoom));
    },
    [minZoom, maxZoom, onZoomChange],
  );

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [stopDragging]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      show();
      draggingRef.current = true;

      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setFromClientY(e.clientY);
    },
    [setFromClientY, show],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      setFromClientY(e.clientY);
    },
    [setFromClientY],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      show();

      let delta = 0;
      switch (e.key) {
        case "ArrowUp":
          delta = 0.01;
          break;
        case "ArrowDown":
          delta = -0.01;
          break;
        case "PageUp":
          delta = 0.05;
          break;
        case "PageDown":
          delta = -0.05;
          break;
        case "Home":
          onZoomChange(minZoom);
          e.preventDefault();
          return;
        case "End":
          onZoomChange(maxZoom);
          e.preventDefault();
          return;
        default:
          return;
      }

      e.preventDefault();
      onZoomChange(tToZoom(clamp(sliderT + delta, 0, 1), minZoom, maxZoom));
    },
    [sliderT, minZoom, maxZoom, onZoomChange, show],
  );

  if (!rendered) return null;

  return (
    <div
      onTransitionEnd={onOpacityTransitionEnd}
      onPointerDown={show}
      className={`
        fixed right-2 top-1/2 -translate-y-1/2 z-20
        transition-opacity duration-500
        ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}
      `}
    >
      <div className="w-[56px] rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md">
        <div className="px-1.5 pt-3 pb-2 flex flex-col items-center gap-2">
          <div className="text-[8px] tracking-widest uppercase text-white/40 select-none">
            zoom
          </div>

          {/* HIT AREA */}
          <div
            ref={trackRef}
            role="slider"
            aria-label="Zoom"
            aria-orientation="vertical"
            aria-valuemin={minZoom}
            aria-valuemax={maxZoom}
            aria-valuenow={zoom}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            className="relative flex justify-center"
            style={{
              width: 36,
              height: "60vh",
              minHeight: 260,
              maxHeight: 560,
              touchAction: "none",
              userSelect: "none",
            }}
          >
            {/* RAIL */}
            <div className="absolute inset-y-0 w-[8px] rounded-full bg-white/10 border border-white/10" />

            {/* THUMB */}
            <div
              className="absolute left-1/2 rounded-full bg-white/20 border border-white/20 shadow-[0_6px_18px_rgba(0,0,0,0.4)] backdrop-blur-md"
              style={{
                width: 22,
                height: 22,
                bottom: `${sliderT * 100}%`,
                transform: "translate(-50%, 50%)",
                pointerEvents: "none",
              }}
            />
          </div>

          <div className="text-[9px] font-mono text-white/45 pb-2 select-none">
            {zoom.toFixed(1)}×
          </div>
        </div>
      </div>
    </div>
  );
}
