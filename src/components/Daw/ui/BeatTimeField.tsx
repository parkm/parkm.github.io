import { useRef, useState, type PointerEvent } from "react";
import {
  beatTimeSteps,
  formatBeatTime,
  parseBeatTime,
  type Tick,
  type TimeSignature,
} from "../model/time";

type BeatTimeFieldProps = {
  value: Tick;
  kind: "position" | "length";
  timeSignature: TimeSignature;
  min: Tick;
  max: Tick;
  onChange: (value: Tick) => void;
  onBegin?: () => void;
  onEnd?: () => void;
  label: string;
};

const PX_PER_STEP = 6;

/**
 * A bars.beats.sixteenths box like Live's: drag a part up or down to change
 * it by bars, beats or sixteenths; click to type ("3", "2.3", "1.1.3").
 */
export function BeatTimeField({
  value,
  kind,
  timeSignature,
  min,
  max,
  onChange,
  onBegin,
  onEnd,
  label,
}: BeatTimeFieldProps) {
  const [editing, setEditing] = useState(false);
  const drag = useRef<{
    y: number;
    start: Tick;
    step: Tick;
    moved: boolean;
  } | null>(null);
  const clamp = (v: Tick) => Math.min(max, Math.max(min, v));
  const text = formatBeatTime(value, timeSignature, kind);
  const steps = beatTimeSteps(timeSignature);

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        defaultValue={text}
        className="w-20 rounded bg-zinc-950 px-1.5 py-0.5 text-center tabular-nums text-zinc-100 outline-none ring-1 ring-amber-400/60"
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const v = parseBeatTime(e.currentTarget.value, timeSignature, kind);
          if (v !== null) onChange(clamp(v));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
          e.stopPropagation();
        }}
      />
    );
  }

  const onPointerDown = (e: PointerEvent<HTMLSpanElement>, step: Tick) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, start: value, step, moved: false };
    onBegin?.();
  };
  const onPointerMove = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (!d.moved && Math.abs(dy) < 3) return;
    d.moved = true;
    const next = clamp(d.start + Math.round(dy / PX_PER_STEP) * d.step);
    if (next !== value) onChange(next);
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    onEnd?.();
    if (!d.moved) setEditing(true);
  };

  const parts = text.split(".");
  return (
    <span
      role="group"
      aria-label={label}
      title={`${label}: drag a part (bars.beats.sixteenths) or click to type`}
      className="flex w-20 justify-center rounded bg-zinc-950/60 py-0.5 tabular-nums text-zinc-100 hover:bg-zinc-950"
    >
      {parts.map((p, i) => (
        <span key={i} className="flex">
          {i > 0 && <span className="text-zinc-500">.</span>}
          <span
            className="cursor-ns-resize touch-none px-px"
            onPointerDown={(e) => onPointerDown(e, steps[Math.min(i, 2)])}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {p}
          </span>
        </span>
      ))}
    </span>
  );
}
