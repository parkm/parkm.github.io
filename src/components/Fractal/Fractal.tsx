import { useState } from "react";
import {
  MandelbrotVisualization,
  DEFAULT_CENTER,
  MIN_ZOOM,
  MAX_ZOOM,
  type Vec2,
} from "./MandelbrotVisualization";
import { ZoomSlider } from "./ZoomSlider";
import { useArrowKeyPan } from "./useArrowKeyPan";

export function Fractal() {
  const [zoom, setZoom] = useState<number>(1);
  const [center, setCenter] = useState<Vec2>(DEFAULT_CENTER);

  useArrowKeyPan({
    center,
    setCenter,
    zoom,
    setZoom,
    config: {
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    },
  });

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <MandelbrotVisualization
        zoom={zoom}
        center={center}
        onZoomChange={setZoom}
        onCenterChange={setCenter}
      />
      <ZoomSlider
        zoom={zoom}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onZoomChange={setZoom}
      />
    </div>
  );
}
