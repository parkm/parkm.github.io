import { useCallback, useState } from "react";
import { MandelbrotVisualization } from "./MandelbrotVisualization";
import { ZoomSlider } from "./ZoomSlider";
import { useArrowKeyPan } from "./useArrowKeyPan";
import {
  logDepth,
  panBy,
  zoomBy,
  DEFAULT_VIEW,
  MIN_ZOOM,
  type Vec2,
  type View,
} from "./view";

const SCREEN_CENTER: Vec2 = { x: 0, y: 0 };
const SLIDER_MAX_ZOOM = 10_000_000;

export function Fractal() {
  const [view, setView] = useState<View>(DEFAULT_VIEW);

  const pan = useCallback((delta: Vec2) => setView((v) => panBy(v, delta)), []);
  const zoom = useCallback(
    (factor: number, focus: Vec2 = SCREEN_CENTER) =>
      setView((v) => zoomBy(v, Math.log(factor), focus)),
    [],
  );
  const zoomTo = useCallback(
    (target: number) =>
      setView((v) => zoomBy(v, Math.log(target) - logDepth(v), SCREEN_CENTER)),
    [],
  );
  const reset = useCallback(() => setView(DEFAULT_VIEW), []);

  useArrowKeyPan({ panBy: pan, zoomBy: zoom });

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <MandelbrotVisualization
        view={view}
        onPan={pan}
        onZoom={zoom}
        onReset={reset}
      />
      <ZoomSlider
        logZoom={logDepth(view)}
        minZoom={MIN_ZOOM}
        maxZoom={SLIDER_MAX_ZOOM}
        onZoomChange={zoomTo}
      />
    </div>
  );
}
