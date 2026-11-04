import { useRef, useState, type PointerEvent } from "react";

type DragNumberProps = {
  value: number;
  min: number;
  max: number;
  /** Value change per pixel dragged. */
  step?: number;
  format?: (value: number) => string;
  /** Typed text to value. */
  parse?: (text: string) => number;
  onChange: (value: number) => void;
  onBegin?: () => void;
  onEnd?: () => void;
  label: string;
  /** Extra tooltip text, before the drag/type hint. */
  hint?: string;
  className?: string;
};

/** Ableton-style number box: drag up/down to change, click to type. */
export function DragNumber({
  value,
  min,
  max,
  step = 1,
  format = String,
  parse = Number,
  onChange,
  onBegin,
  onEnd,
  label,
  hint,
  className = "",
}: DragNumberProps) {
  const [editing, setEditing] = useState(false);
  const drag = useRef<{ y: number; v: number; moved: boolean } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value, moved: false };
    onBegin?.();
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (!d.moved && Math.abs(dy) < 3) return;
    d.moved = true;
    const fine = e.shiftKey ? 0.1 : 1;
    d.v = clamp(d.v + dy * step * fine);
    d.y = e.clientY;
    const next = Number(
      (Math.round(d.v / (step * fine)) * step * fine).toFixed(4),
    );
    if (next !== value) onChange(clamp(next));
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    onEnd?.();
    if (!d.moved) setEditing(true);
  };

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        defaultValue={format(value)}
        className={`w-16 rounded bg-zinc-950 px-1.5 py-0.5 text-center tabular-nums text-zinc-100 outline-none ring-1 ring-amber-400/60 ${className}`}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const v = parse(e.currentTarget.value);
          if (Number.isFinite(v)) onChange(clamp(v));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={`${hint ? `${hint}\n` : ""}${label}: drag or click to type`}
      className={`w-16 cursor-ns-resize touch-none rounded bg-zinc-950/60 px-1.5 py-0.5 text-center tabular-nums text-zinc-100 hover:bg-zinc-950 ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {format(value)}
    </button>
  );
}
