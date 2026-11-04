import { memo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  formatParam,
  fromNormal,
  toNormal,
  type ParamDef,
} from "../engine/params";

type KnobProps = {
  def: ParamDef;
  value: number;
  onChange: (value: number) => void;
  /** Called around a drag so the whole gesture is one undo step. */
  onBegin?: () => void;
  onEnd?: () => void;
  format?: (value: number) => string;
  /** Diameter in px. */
  size?: number;
};

const SIZE = 36;
const R = 14;
const SWEEP = 270;

function arc(from: number, to: number) {
  const point = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${SIZE / 2 + R * Math.cos(a)} ${SIZE / 2 + R * Math.sin(a)}`;
  };
  const large = to - from > 180 ? 1 : 0;
  return `M ${point(from)} A ${R} ${R} 0 ${large} 1 ${point(to)}`;
}

/** Drag vertically to turn (Shift for fine), double-click to reset, arrow keys when focused. */
export const Knob = memo(function Knob({
  def,
  value,
  onChange,
  onBegin,
  onEnd,
  format,
  size = SIZE,
}: KnobProps) {
  const drag = useRef<{ y: number; n: number } | null>(null);
  const n = toNormal(def, value);
  const start = -SWEEP / 2;
  const end = start + SWEEP * n;
  // Bipolar params (pan, tune) fill from the centre.
  const origin =
    def.min < 0 && def.max > 0 ? start + SWEEP * toNormal(def, 0) : start;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { y: e.clientY, n };
    onBegin?.();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.n = Math.min(
      1,
      Math.max(0, d.n + (d.y - e.clientY) / (e.shiftKey ? 1200 : 200)),
    );
    d.y = e.clientY;
    const next = fromNormal(def, d.n);
    if (next !== value) onChange(next);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    onEnd?.();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[
      e.key
    ];
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(fromNormal(def, n + dir * (e.shiftKey ? 0.002 : 0.02)));
  };

  const text = format ? format(value) : formatParam(def, value);

  return (
    <div
      className="flex flex-col items-center gap-0.5"
      style={{ width: size + 20 }}
      title={def.description}
    >
      <span className="w-full truncate text-center text-[11px] text-zinc-400">
        {def.label}
      </span>
      <div
        role="slider"
        tabIndex={0}
        aria-label={def.label}
        aria-valuemin={def.min}
        aria-valuemax={def.max}
        aria-valuenow={value}
        aria-valuetext={text}
        className="cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onChange(def.default)}
        onKeyDown={onKeyDown}
      >
        <svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <path
            d={arc(start, start + SWEEP)}
            className="stroke-zinc-700"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
          {Math.abs(end - origin) > 0.5 && (
            <path
              d={arc(Math.min(origin, end), Math.max(origin, end))}
              className="stroke-amber-400"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
            />
          )}
          <line
            x1={SIZE / 2}
            y1={SIZE / 2}
            x2={SIZE / 2 + (R - 4) * Math.cos(((end - 90) * Math.PI) / 180)}
            y2={SIZE / 2 + (R - 4) * Math.sin(((end - 90) * Math.PI) / 180)}
            className="stroke-zinc-200"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="text-[11px] tabular-nums text-zinc-300">{text}</span>
    </div>
  );
});
