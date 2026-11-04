import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  addStep,
  cellOf,
  clipViewEnd,
  cropToRange,
  loopStartOf,
  setLoop,
  DEFAULT_VELOCITY,
  drumKitOf,
  eraseStep,
  setStepVelocity,
  stepVelocity,
  updatePad,
} from "../model/ops";
import { ticksPerBar, ticksPerBeat, type Tick } from "../model/time";
import type { Id, Note, Pad } from "../model/types";
import { useDaw, useDoc, useSessionState } from "./context";
import { onFrame } from "./frame";
import { useTwoFingerGestures } from "./touchGestures";
import { createScrubber, useScrubKey } from "./scrub";
import { PAD_KEYS } from "./keyboard";
import {
  braceCursor,
  braceHandleAt,
  dragBrace,
  type BraceHandle,
} from "./loopBrace";
import { insertMarker, useInsertMarker } from "./insertMarker";

/**
 * Step editor: one view over a clip's note events (the piano roll will be
 * another). Click to toggle, drag along a row to paint or erase, drag
 * vertically on a step to set its velocity.
 */

const ROW_H = 30;
const LANE_H = 72;
const MIN_CELL_W = 16;

type Cells = (Note | undefined)[];

type StepGridProps = {
  trackId: Id;
  clipId: Id;
  grid: Tick;
  selectedPadId: Id | null;
  onSelectPad: (id: Id) => void;
};

type Gesture = {
  pitch: number;
  startStep: number;
  lastStep: number;
  x: number;
  y: number;
  existed: boolean;
  startVelocity: number;
  mode: "pending" | "paint" | "erase" | "velocity";
};

export function StepGrid({
  trackId,
  clipId,
  grid,
  selectedPadId,
  onSelectPad,
}: StepGridProps) {
  const { store, session } = useDaw();
  const clip = useDoc((d) => d.clips[clipId]);
  const track = useDoc((d) => d.tracks.find((t) => t.id === trackId));
  const timeSignature = useDoc((d) => d.timeSignature);
  const pads = useMemo(() => drumKitOf(track)?.pads ?? [], [track]);
  // A time range selected in the ruler, to loop or crop to (in steps).
  const [range, setRange] = useState<StepRange | null>(null);
  const [rangeFor, setRangeFor] = useState({ clipId, grid });
  if (rangeFor.clipId !== clipId || rangeFor.grid !== grid) {
    setRangeFor({ clipId, grid });
    setRange(null);
  }
  useEffect(() => {
    if (!range) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setRange(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [range]);

  const marker = useInsertMarker(clipId);

  // The whole clip is shown; the loop brace marks the part that plays.
  const viewEnd = clipViewEnd(clip);
  const steps = Math.max(1, Math.floor(viewEnd / grid));
  const loopStart = loopStartOf(clip);
  const beatSteps = ticksPerBeat(timeSignature) / grid;
  const barSteps = ticksPerBar(timeSignature) / grid;

  const rows = useMemo(() => {
    const map = new Map<number, Cells>();
    for (const pad of pads)
      map.set(pad.pitch, new Array<Note | undefined>(steps).fill(undefined));
    for (const note of clip.notes) {
      if (note.start >= steps * grid) continue;
      const row = map.get(note.pitch);
      const i = cellOf(note.start, grid, steps);
      if (row && !row[i]) row[i] = note;
    }
    return map;
  }, [clip.notes, pads, steps, grid]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);

  // Two fingers scroll the steps; whatever the first finger started is undone.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useTwoFingerGestures(scrollerRef, {
    onStart: () => {
      gesture.current = null;
      store.cancel();
    },
    onPan: (dx) => {
      if (scrollerRef.current) scrollerRef.current.scrollLeft -= dx;
    },
  });

  // Scrubbing: hold Q and move across the steps to hear them.
  const pointer = useRef({ inside: false, clientX: 0 });
  const scrubber = useMemo(
    () => createScrubber(session, trackId, grid),
    [session, trackId, grid],
  );
  useEffect(() => () => scrubber.stop(), [scrubber]);
  const scrubAt = (clientX: number) => {
    const body = bodyRef.current;
    if (!body) return;
    const r = body.getBoundingClientRect();
    const loop = store.get().clips[clipId];
    const length = steps * grid; // the whole visible clip
    const tick = Math.max(
      0,
      Math.min(length - 1, ((clientX - r.left) / r.width) * length),
    );
    scrubber.move(
      loop.notes.filter((n) => n.start < length),
      tick,
    );
  };
  const scrubHeld = useScrubKey((held) => {
    if (!held) scrubber.stop();
    else if (pointer.current.inside) scrubAt(pointer.current.clientX);
  });

  const stepAt = (clientX: number) => {
    const r = bodyRef.current!.getBoundingClientRect();
    return Math.min(
      steps - 1,
      Math.max(0, Math.floor(((clientX - r.left) / r.width) * steps)),
    );
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const r = bodyRef.current!.getBoundingClientRect();
    const pad = pads[Math.floor((e.clientY - r.top) / ROW_H)];
    if (!pad) return;
    const step = stepAt(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
    session.ensureAudio();
    store.begin();
    const existing = stepVelocity(
      store.get().clips[clipId],
      pad.pitch,
      step,
      grid,
    );
    if (existing === undefined) {
      store.update((d) => addStep(d, clipId, pad.pitch, step, grid));
      if (!session.getState().playing)
        session.hit(trackId, pad.pitch, DEFAULT_VELOCITY, grid, {
          audition: true,
        });
    }
    onSelectPad(pad.id);
    gesture.current = {
      pitch: pad.pitch,
      startStep: step,
      lastStep: step,
      x: e.clientX,
      y: e.clientY,
      existed: existing !== undefined,
      startVelocity: existing ?? DEFAULT_VELOCITY,
      mode: "pending",
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    pointer.current = { inside: true, clientX: e.clientX };
    if (!g) {
      if (scrubHeld.current) scrubAt(e.clientX);
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const step = stepAt(e.clientX);

    if (g.mode === "pending") {
      if (
        step === g.startStep &&
        Math.abs(dy) > 4 &&
        Math.abs(dy) > Math.abs(dx)
      ) {
        g.mode = "velocity";
      } else if (step !== g.startStep) {
        g.mode = g.existed ? "erase" : "paint";
        if (g.existed)
          store.update((d) => eraseStep(d, clipId, g.pitch, g.startStep, grid));
      } else {
        return;
      }
    }

    if (g.mode === "velocity") {
      const v = g.startVelocity - dy / 150;
      store.update((d) =>
        setStepVelocity(d, clipId, g.pitch, g.startStep, grid, v),
      );
      return;
    }

    // Fill every step between the last and current pointer position so fast drags don't skip.
    const [a, b] = g.lastStep < step ? [g.lastStep, step] : [step, g.lastStep];
    const paint = g.mode === "paint";
    store.update((d) => {
      let next = d;
      for (let s = a; s <= b; s++) {
        next = paint
          ? addStep(next, clipId, g.pitch, s, grid)
          : eraseStep(next, clipId, g.pitch, s, grid);
      }
      return next;
    });
    g.lastStep = step;
  };

  const finish = (cancelled: boolean) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (!cancelled && g.mode === "pending" && g.existed) {
      store.update((d) => eraseStep(d, clipId, g.pitch, g.startStep, grid));
    }
    store.end();
  };

  const selectedPad = pads.find((p) => p.id === selectedPadId);
  const contentStyle = { minWidth: steps * MIN_CELL_W };

  return (
    <div className="flex min-h-0 select-none">
      <div className="w-40 shrink-0">
        <div className="h-4" />
        <div className="h-6" />
        {pads.map((pad, i) => (
          <PadHeader
            key={pad.id}
            pad={pad}
            keyLabel={PAD_KEY_LABELS[i]}
            selected={pad.id === selectedPadId}
            onSelect={() => {
              onSelectPad(pad.id);
              session.hit(trackId, pad.pitch, DEFAULT_VELOCITY, grid, {
                audition: true,
              });
            }}
            onToggleMute={() =>
              store.update((d) =>
                updatePad(d, trackId, pad.id, (p) => ({ ...p, mute: !p.mute })),
              )
            }
          />
        ))}
        <div
          className="flex items-end px-3 pb-1 text-[11px] text-zinc-500"
          style={{ height: LANE_H + 8 }}
        >
          Velocity · {selectedPad?.name ?? "—"}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden pr-3"
      >
        <div style={contentStyle}>
          <LoopStrip clipId={clipId} viewEnd={steps * grid} grid={grid} />
          <Ruler
            steps={steps}
            beatSteps={beatSteps}
            barSteps={barSteps}
            range={range}
            onRange={setRange}
            marker={marker === null ? null : marker / grid}
            onMarker={(step) => insertMarker.set(clipId, step * grid)}
            onLoop={() => {
              if (!range) return;
              store.update((d) =>
                setLoop(
                  d,
                  clipId,
                  range.from * grid,
                  (range.to - range.from) * grid,
                ),
              );
              setRange(null);
            }}
            onCrop={() => {
              if (!range) return;
              store.update((d) =>
                cropToRange(d, clipId, range.from * grid, range.to * grid),
              );
              setRange(null);
            }}
          />
          <div
            ref={bodyRef}
            className="relative cursor-crosshair touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => finish(false)}
            onPointerCancel={() => finish(true)}
            onPointerEnter={(e) => {
              pointer.current = { inside: true, clientX: e.clientX };
            }}
            onPointerLeave={() => {
              pointer.current.inside = false;
              scrubber.stop();
            }}
          >
            {pads.map((pad) => (
              <StepRow
                key={pad.id}
                cells={rows.get(pad.pitch)!}
                beatSteps={beatSteps}
                barSteps={barSteps}
                hue={clip.hue}
                muted={pad.mute}
                selected={pad.id === selectedPadId}
              />
            ))}
            {range && (
              <div
                className="pointer-events-none absolute inset-y-0 bg-sky-400/10 ring-1 ring-sky-300/40 ring-inset"
                style={{
                  left: `${(range.from / steps) * 100}%`,
                  width: `${((range.to - range.from) / steps) * 100}%`,
                }}
              />
            )}
            {/* Outside the loop: dimmed, still editable. */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-black/45"
              style={{ width: `${(loopStart / (steps * grid)) * 100}%` }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 bg-black/45"
              style={{
                width: `${Math.max(0, 1 - (loopStart + clip.length) / (steps * grid)) * 100}%`,
              }}
            />
            <Playhead
              trackId={trackId}
              clipId={clipId}
              steps={steps}
              grid={grid}
              length={clip.length}
              loopStart={loopStart}
            />
          </div>
          {selectedPad && (
            <VelocityLane
              clipId={clipId}
              pitch={selectedPad.pitch}
              cells={rows.get(selectedPad.pitch)!}
              grid={grid}
              hue={clip.hue}
              beatSteps={beatSteps}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const PAD_KEY_LABELS = PAD_KEYS.map((k) => k.slice(3));

const PadHeader = memo(function PadHeader({
  pad,
  keyLabel,
  selected,
  onSelect,
  onToggleMute,
}: {
  pad: Pad;
  keyLabel?: string;
  selected: boolean;
  onSelect: () => void;
  onToggleMute: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 border-b border-zinc-900/80 pr-2 pl-3 ${
        selected
          ? "bg-zinc-700/60 text-zinc-50"
          : "text-zinc-300 hover:bg-zinc-800"
      }`}
      style={{ height: ROW_H }}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onPointerDown={(e) => {
          if (e.button === 0) onSelect();
        }}
      >
        <kbd className="w-4 shrink-0 text-center font-mono text-[10px] text-zinc-500">
          {keyLabel}
        </kbd>
        <span
          className={`truncate ${pad.mute ? "text-zinc-500 line-through" : ""}`}
        >
          {pad.name}
        </span>
      </button>
      <button
        type="button"
        title={pad.mute ? "Unmute pad" : "Mute pad"}
        aria-label={pad.mute ? `Unmute ${pad.name}` : `Mute ${pad.name}`}
        aria-pressed={pad.mute}
        className={`h-4 w-4 shrink-0 rounded-sm ${pad.mute ? "bg-zinc-600" : "bg-amber-400/90"}`}
        onClick={onToggleMute}
      />
    </div>
  );
});

type StepRange = { from: number; to: number };

/**
 * Bar/beat labels. Drag across it to select a time range, then Loop or
 * Crop to it; a click (or Esc) clears the range.
 */
function Ruler({
  steps,
  beatSteps,
  barSteps,
  range,
  onRange,
  marker,
  onMarker,
  onLoop,
  onCrop,
}: {
  steps: number;
  beatSteps: number;
  barSteps: number;
  range: StepRange | null;
  onRange: (range: StepRange | null) => void;
  /** Insert marker, in steps (may fall between steps). */
  marker: number | null;
  onMarker: (step: number) => void;
  onLoop: () => void;
  onCrop: () => void;
}) {
  const drag = useRef<{ anchor: number; moved: boolean } | null>(null);
  const stepAt = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(steps - 1, Math.floor(((e.clientX - r.left) / r.width) * steps)),
    );
  };
  const labels = [];
  for (let s = 0; s < steps; s += beatSteps) {
    const bar = Math.floor(s / barSteps) + 1;
    const beat = Math.floor((s % barSteps) / beatSteps) + 1;
    labels.push(
      <span
        key={s}
        className={`pointer-events-none absolute top-0 bottom-0 border-l pl-1 text-[10px] leading-6 ${
          beat === 1
            ? "border-zinc-500 text-zinc-300"
            : "border-zinc-700 text-zinc-500"
        }`}
        style={{ left: `${(s / steps) * 100}%` }}
      >
        {beat === 1 ? bar : `${bar}.${beat}`}
      </span>,
    );
  }
  return (
    <div
      title="Click to place the insert marker (for Set); drag to select a range to loop or crop"
      className="relative h-6 cursor-text touch-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { anchor: stepAt(e), moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const s = stepAt(e);
        if (s === d.anchor && !d.moved) return;
        d.moved = true;
        onRange({ from: Math.min(d.anchor, s), to: Math.max(d.anchor, s) + 1 });
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) {
          onRange(null);
          onMarker(d.anchor);
        }
      }}
    >
      <div className="absolute inset-0 overflow-hidden">{labels}</div>
      {marker !== null && marker < steps && (
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-amber-400/80"
          style={{ left: `${(marker / steps) * 100}%` }}
        />
      )}
      {range && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0.5 rounded-sm bg-sky-400/25 ring-1 ring-sky-300/70 ring-inset"
            style={{
              left: `${(range.from / steps) * 100}%`,
              width: `${((range.to - range.from) / steps) * 100}%`,
            }}
          />
          <div
            className="absolute top-0.5 z-10 flex gap-0.5"
            style={{ left: `calc(${(range.to / steps) * 100}% + 4px)` }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              title="Loop this range"
              className="rounded-sm bg-sky-500 px-1.5 text-[10px] leading-5 font-medium text-zinc-950 hover:bg-sky-400"
              onClick={onLoop}
            >
              Loop
            </button>
            <button
              type="button"
              title="Crop to this range: loop it and remove everything else"
              className="rounded-sm bg-sky-500 px-1.5 text-[10px] leading-5 font-medium text-zinc-950 hover:bg-sky-400"
              onClick={onCrop}
            >
              Crop
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const cellStyle = (note: Note | undefined, hue: number, muted: boolean) =>
  note
    ? {
        background: `oklch(${muted ? "0.55 0.02" : "0.8 0.15"} ${hue} / ${0.35 + 0.65 * note.velocity})`,
      }
    : undefined;

type StepRowProps = {
  cells: Cells;
  beatSteps: number;
  barSteps: number;
  hue: number;
  muted: boolean;
  selected: boolean;
};

const StepRow = memo(
  function StepRow({
    cells,
    beatSteps,
    barSteps,
    hue,
    muted,
    selected,
  }: StepRowProps) {
    return (
      <div
        className={`grid border-b border-zinc-900/80 ${selected ? "bg-white/[0.04]" : ""}`}
        style={{
          height: ROW_H,
          gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((note, i) => (
          <div
            key={i}
            className={`p-[2px] ${i % barSteps === 0 ? "border-l border-zinc-500/70" : ""} ${
              Math.floor(i / beatSteps) % 2
                ? "bg-zinc-800/70"
                : "bg-zinc-700/40"
            }`}
          >
            <div
              className={`h-full rounded-[3px] ${note ? "" : "bg-zinc-900/40"}`}
              style={cellStyle(note, hue, muted)}
            />
          </div>
        ))}
      </div>
    );
  },
  (a, b) =>
    a.hue === b.hue &&
    a.muted === b.muted &&
    a.selected === b.selected &&
    a.beatSteps === b.beatSteps &&
    a.barSteps === b.barSteps &&
    a.cells.length === b.cells.length &&
    a.cells.every((c, i) => c === b.cells[i]),
);

/** Highlights the playing step when this clip is the one playing. Updated per frame, not by React. */
function Playhead({
  trackId,
  clipId,
  steps,
  grid,
  length,
  loopStart,
}: {
  trackId: Id;
  clipId: Id;
  steps: number;
  grid: Tick;
  length: Tick;
  loopStart: Tick;
}) {
  const { session } = useDaw();
  const playing = useSessionState((s) => s.playing);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !playing) return;
    let last = -2;
    const stopFrames = onFrame(() => {
      const pos = session.clipPosition(trackId, clipId, length);
      const step =
        pos === null
          ? -1
          : Math.min(steps - 1, Math.floor((loopStart + pos) / grid));
      if (step === last) return;
      last = step;
      el.style.opacity = step < 0 ? "0" : "1";
      if (step >= 0) el.style.transform = `translateX(${step * 100}%)`;
    });
    return () => {
      stopFrames();
      el.style.opacity = "0";
    };
  }, [playing, session, trackId, clipId, steps, grid, length, loopStart]);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-y-0 left-0 bg-white/12 opacity-0 mix-blend-screen"
      style={{ width: `${100 / steps}%` }}
    />
  );
}

type VelocityLaneProps = {
  clipId: Id;
  pitch: number;
  cells: Cells;
  grid: Tick;
  hue: number;
  beatSteps: number;
};

/** Draw velocities for the selected pad's row by dragging across it. */
function VelocityLane({
  clipId,
  pitch,
  cells,
  grid,
  hue,
  beatSteps,
}: VelocityLaneProps) {
  const { store } = useDaw();
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);

  const apply = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const step = Math.min(
      cells.length - 1,
      Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * cells.length)),
    );
    const v = 1 - (e.clientY - r.top) / r.height;
    store.update((d) => setStepVelocity(d, clipId, pitch, step, grid, v));
  };

  return (
    <div
      ref={ref}
      className="relative mt-2 grid cursor-ns-resize touch-none bg-zinc-950/40"
      style={{
        height: LANE_H,
        gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = true;
        store.begin();
        apply(e);
      }}
      onPointerMove={(e) => active.current && apply(e)}
      onPointerUp={() => {
        if (!active.current) return;
        active.current = false;
        store.end();
      }}
      onPointerCancel={() => {
        active.current = false;
        store.end();
      }}
    >
      {cells.map((note, i) => (
        <div
          key={i}
          className={`flex items-end px-[3px] ${Math.floor(i / beatSteps) % 2 ? "bg-white/[0.02]" : ""}`}
        >
          {note && (
            <div
              className="w-full rounded-t-[2px]"
              style={{
                height: `${note.velocity * 100}%`,
                background: `oklch(0.8 0.15 ${hue})`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** The loop brace above the steps: drag its ends or middle, or draw a new loop. */
function LoopStrip({
  clipId,
  viewEnd,
  grid,
}: {
  clipId: Id;
  viewEnd: Tick;
  grid: Tick;
}) {
  const { store } = useDaw();
  const clip = useDoc((d) => d.clips[clipId]);
  const ref = useRef<HTMLDivElement>(null);
  // The strip's scale is fixed for the whole drag: the grid widens as the
  // loop extends past the end, and a moving scale would run the loop away.
  const drag = useRef<{
    handle: BraceHandle;
    from: Tick;
    orig: { start: Tick; length: Tick };
    left: number;
    ticksPerPx: number;
  } | null>(null);
  const start = loopStartOf(clip);

  const geometry = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const px = clientX - r.left;
    return {
      px,
      tick: (px / r.width) * viewEnd,
      startPx: (start / viewEnd) * r.width,
      endPx: ((start + clip.length) / viewEnd) * r.width,
    };
  };

  return (
    <div
      ref={ref}
      title="Loop: drag the ends to resize, the middle to move, or drag elsewhere to draw a new loop (⌘ for off-grid)"
      className="relative h-4 touch-none bg-zinc-950/50"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const g = geometry(e.clientX);
        const r = ref.current!.getBoundingClientRect();
        drag.current = {
          handle: braceHandleAt(g.px, g.startPx, g.endPx),
          from: g.tick,
          orig: { start, length: clip.length },
          left: r.left,
          ticksPerPx: viewEnd / r.width,
        };
        store.begin();
      }}
      onPointerMove={(e) => {
        const g = geometry(e.clientX);
        const d = drag.current;
        if (!d) {
          e.currentTarget.style.cursor = braceCursor(
            braceHandleAt(g.px, g.startPx, g.endPx),
          );
          return;
        }
        const next = dragBrace(
          d.handle,
          d.orig,
          d.from,
          (e.clientX - d.left) * d.ticksPerPx,
          grid,
          e.metaKey || e.ctrlKey,
        );
        store.update((doc) => setLoop(doc, clipId, next.start, next.length));
      }}
      onPointerUp={() => {
        if (!drag.current) return;
        drag.current = null;
        store.end();
      }}
      onPointerCancel={() => {
        drag.current = null;
        store.end();
      }}
    >
      <div
        className="pointer-events-none absolute inset-y-0.5 rounded-sm"
        style={{
          left: `${(start / viewEnd) * 100}%`,
          width: `${(clip.length / viewEnd) * 100}%`,
          background: `oklch(0.7 0.13 ${clip.hue} / 0.55)`,
          boxShadow: `inset 3px 0 0 oklch(0.88 0.13 ${clip.hue}), inset -3px 0 0 oklch(0.88 0.13 ${clip.hue})`,
        }}
      />
    </div>
  );
}
