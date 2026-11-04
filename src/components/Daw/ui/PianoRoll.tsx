import {
  Magnet,
  MousePointer2,
  Crop,
  Pencil,
  Repeat,
  Rows3,
  Scaling,
  StretchHorizontal,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type WheelEvent,
} from "react";
import {
  addNotes,
  clamp01,
  clipViewEnd,
  cropToRange,
  inLoop,
  loopEndOf,
  loopStartOf,
  setLoop,
  DEFAULT_VELOCITY,
  legatoNotes,
  newId,
  patchNotes,
  quantizeNotes,
  removeNotes,
  stretchNotes,
} from "../model/ops";
import { ticksPerBar, ticksPerBeat, type Tick } from "../model/time";
import type { Clip, Id, Note } from "../model/types";
import { useDaw, useDoc, useSessionState } from "./context";
import { insertMarker } from "./insertMarker";
import {
  editorSettings,
  quantizeOptions,
  useEditorSettings,
} from "./editorSettings";
import { onFrame } from "./frame";
import { useTwoFingerGestures } from "./touchGestures";
import { useCommand, useCommandButton, useCommands } from "./commands";
import type { NoteEditor } from "../commands/types";
import { createScrubber, useScrubKey } from "./scrub";
import {
  braceCursor,
  braceHandleAt,
  dragBrace,
  type BraceHandle,
  type LoopRange,
} from "./loopBrace";

/**
 * Piano roll: the second view over a clip's notes, drawn on canvas so clips
 * with hundreds of notes stay fast. React only holds selection and zoom.
 *
 * Two tools, like Ableton (B toggles):
 *   Select: drag empty space to box-select, double-click to add a note,
 *           click a note to select it, double-click a note to delete it.
 *   Draw:   click to add a note and drag to set its length, click a note to
 *           delete it.
 * Both: drag a note to move it, either edge to resize, ⌥-drag to copy, ⌘ to
 * drag off-grid. Selected notes get stretch handles in the ruler.
 */

const RULER_H = 20;
const LOOP_H = 14;
const LANE_H = 52;
const MAP_H = 26;
const MIN_STEP_PX = 12;
const EDGE_PX = 5;
const HANDLE_PX = 7;
const BLACK = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
export const noteName = (pitch: number) =>
  `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;

/** Copied notes, relative to the earliest one. Shared between clips. */
let noteClipboard: Note[] = [];

type PianoRollProps = {
  trackId: Id;
  clipId: Id;
  grid: Tick;
  /** Row labels by pitch (drum pad names). */
  labels?: Map<number, string>;
  /** Where the editor publishes itself for commands (selection, quantize, …). */
  editorRef: RefObject<NoteEditor | null>;
};

type NoteDrag = {
  kind: "move" | "resizeEnd" | "resizeStart";
  origin: Map<Id, Note>;
  tick: number;
  row: number;
  clicked: Id;
  moved: boolean;
  /** The clicked note was already in a multi-selection (a plain click narrows to it). */
  narrow: boolean;
  lastPitch: number;
  create: boolean;
};

type Gesture =
  | NoteDrag
  | {
      kind: "marquee";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      base: Set<Id>;
      additive: boolean;
    }
  | { kind: "stretch"; anchor: Tick; edge: Tick; origin: Map<Id, Note> }
  | { kind: "velocity" }
  | { kind: "scrub" }
  | { kind: "loop"; handle: BraceHandle; from: Tick; orig: LoopRange };

export function PianoRoll({
  trackId,
  clipId,
  grid,
  labels,
  editorRef,
}: PianoRollProps) {
  const { store, session } = useDaw();
  const clip = useDoc((d) => d.clips[clipId]);
  const timeSignature = useDoc((d) => d.timeSignature);
  const playing = useSessionState((s) => s.playing);
  const settings = useEditorSettings();
  const keysW = labels ? 96 : 44;

  const [selected, setSelected] = useState<Set<Id>>(() => new Set());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [rowH, setRowH] = useState(14);
  // While dragging, the visible span is held so the scale can't shift under
  // the pointer (moving the loop or notes past the end would otherwise grow
  // the view, shrink the scale, and run away). It updates on release.
  const [heldEnd, setHeldEnd] = useState<Tick | null>(null);
  const view = useRef({ x: 0, y: 0 });
  // The insert marker lives in a shared store so the clip bar's Set buttons see it.
  const insert = useMemo(
    () => ({
      get current() {
        return insertMarker.get(clipId);
      },
      set current(tick: Tick | null) {
        insertMarker.set(clipId, tick);
      },
    }),
    [clipId],
  );
  const hoverPitch = useRef<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastLength = useRef<Tick>(grid);
  // Scrubbing: hold Q over the roll, or drag in the ruler.
  const scrubTick = useRef<Tick | null>(null);
  const pointer = useRef<{ inside: boolean; clientX: number }>({
    inside: false,
    clientX: 0,
  });
  const scrubber = useMemo(
    () => createScrubber(session, trackId, grid),
    [session, trackId, grid],
  );
  useEffect(() => () => scrubber.stop(), [scrubber]);

  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const rulerRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<HTMLCanvasElement>(null);
  const rollRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<HTMLCanvasElement>(null);
  const laneRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  // Rows top to bottom. Folded: only pitches in use (and drum pads).
  const rows = useMemo(() => {
    if (!settings.fold) return Array.from({ length: 128 }, (_, i) => 127 - i);
    const used = new Set(clip.notes.map((n) => n.pitch));
    labels?.forEach((_, p) => used.add(p));
    const list = [...used].sort((a, b) => b - a);
    return list.length ? list : [60];
  }, [settings.fold, clip.notes, labels]);
  const rowOf = useMemo(() => new Map(rows.map((p, i) => [p, i])), [rows]);

  // The editor shows the whole clip; the loop brace marks the part that plays.
  const viewEnd = heldEnd ?? clipViewEnd(clip);
  const steps = Math.max(1, Math.round(viewEnd / grid));
  const baseW = Math.max(size.w, steps * MIN_STEP_PX);
  const contentW = baseW * zoom;
  const ppt = contentW / viewEnd;
  const rollH = Math.max(0, size.h - MAP_H - LOOP_H - RULER_H - LANE_H);
  const contentH = rows.length * rowH;

  const selection = useMemo(
    () => clip.notes.filter((n) => selected.has(n.id)),
    [clip.notes, selected],
  );
  const selSpan = useMemo(() => {
    if (selection.length === 0) return null;
    return {
      start: Math.min(...selection.map((n) => n.start)),
      end: Math.max(...selection.map((n) => n.start + n.duration)),
    };
  }, [selection]);

  // Latest values for canvas callbacks, without re-subscribing.
  const latest = useRef({
    clip,
    selected,
    ppt,
    rollH,
    grid,
    contentW,
    rows,
    rowOf,
    rowH,
    selSpan,
    zoom,
    baseW,
    viewEnd,
    width: size.w,
  });
  latest.current = {
    clip,
    selected,
    ppt,
    rollH,
    grid,
    contentW,
    rows,
    rowOf,
    rowH,
    selSpan,
    zoom,
    baseW,
    viewEnd,
    width: size.w,
  };

  const clampX = (x: number) =>
    Math.max(0, Math.min(Math.max(0, contentW - size.w), x));
  const clampY = (y: number) =>
    Math.max(0, Math.min(Math.max(0, contentH - rollH), y));

  useLayoutEffect(() => {
    const box = boxRef.current!;
    const ro = new ResizeObserver(() =>
      setSize({ w: box.clientWidth, h: box.clientHeight }),
    );
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // Start scrolled to the notes (or around middle C / the drum pads).
  const centered = useRef(false);
  useLayoutEffect(() => {
    if (centered.current || rollH === 0) return;
    centered.current = true;
    const pitches = clip.notes.map((n) => n.pitch);
    const mid = pitches.length
      ? (Math.min(...pitches) + Math.max(...pitches)) / 2
      : labels
        ? 42
        : 60;
    const row = rowOf.get(Math.round(mid)) ?? 0;
    view.current.y = Math.max(
      0,
      Math.min(contentH - rollH, row * rowH - rollH / 2),
    );
  }, [clip.notes, labels, rollH, rowOf, rowH, contentH]);

  // Keep the vertical scroll in range when rows change (fold, row height).
  useLayoutEffect(() => {
    view.current.y = Math.max(
      0,
      Math.min(Math.max(0, contentH - rollH), view.current.y),
    );
  }, [contentH, rollH]);

  // What's sounding: clip position while playing, plus live-played pitches.
  const sounding = useRef<{
    pos: number | null;
    live: ReadonlyMap<number, number>;
  }>({
    pos: null,
    live: new Map(),
  });

  const draw = useCallback(() => {
    const {
      clip,
      selected,
      ppt,
      rollH,
      grid,
      contentW,
      rows,
      rowOf,
      rowH,
      selSpan,
    } = latest.current;
    const roll = rollRef.current;
    if (!roll || rollH <= 0) return;
    const w = roll.clientWidth;
    const dpr = pixelRatio();
    const { x: sx, y: sy } = view.current;
    const beat = ticksPerBeat(timeSignature);
    const bar = ticksPerBar(timeSignature);
    const hue = clip.hue;
    const pos = sounding.current.pos;

    // Pitches sounding now light their whole row, and their key.
    const lit = new Set(sounding.current.live.keys());
    if (pos !== null) {
      for (const n of clip.notes) {
        if (inLoop(n, clip) && pos >= n.start && pos < n.start + n.duration)
          lit.add(n.pitch);
      }
    }
    const selectedPitches = new Set(
      clip.notes.filter((n) => selected.has(n.id)).map((n) => n.pitch),
    );

    const g = prepare(roll, w, rollH, dpr);
    const first = Math.max(0, Math.floor(sy / rowH));
    const last = Math.min(rows.length - 1, Math.ceil((sy + rollH) / rowH));
    for (let r = first; r <= last; r++) {
      const pitch = rows[r];
      const y = r * rowH - sy;
      g.fillStyle = BLACK.has(pitch % 12) ? "#1e1e21" : "#26262a";
      if (labels?.has(pitch)) g.fillStyle = "#2e2e33";
      g.fillRect(0, y, w, rowH);
      if (lit.has(pitch)) {
        g.fillStyle = `oklch(0.72 0.14 ${hue} / 0.28)`;
        g.fillRect(0, y, w, rowH);
      } else if (pitch === hoverPitch.current) {
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fillRect(0, y, w, rowH);
      } else if (selectedPitches.has(pitch)) {
        g.fillStyle = "rgba(255,255,255,0.03)";
        g.fillRect(0, y, w, rowH);
      }
      g.fillStyle = pitch % 12 === 0 ? "#3f3f46" : "#18181b";
      g.fillRect(0, y + rowH - 1, w, 1);
    }
    // Grid lines.
    const firstStep = Math.floor(sx / ppt / grid);
    const lastStep = Math.ceil((sx + w) / ppt / grid);
    for (let s = firstStep; s <= lastStep; s++) {
      const tick = s * grid;
      const x = Math.round(tick * ppt - sx);
      g.fillStyle =
        tick % bar === 0
          ? "#52525b"
          : tick % beat === 0
            ? "#3f3f46"
            : "#2a2a2f";
      g.fillRect(x, 0, 1, rollH);
    }
    // Selection span, faintly, so stretch handles in the ruler read clearly.
    if (selSpan) {
      g.fillStyle = "rgba(255,255,255,0.025)";
      g.fillRect(
        selSpan.start * ppt - sx,
        0,
        (selSpan.end - selSpan.start) * ppt,
        rollH,
      );
    }
    // Outside the loop: dimmed (still editable, but doesn't play).
    const loopX0 = loopStartOf(clip) * ppt - sx;
    const loopX1 = loopEndOf(clip) * ppt - sx;
    g.fillStyle = "rgba(0,0,0,0.4)";
    if (loopX0 > 0) g.fillRect(0, 0, Math.min(w, loopX0), rollH);
    if (loopX1 < w)
      g.fillRect(Math.max(0, loopX1), 0, w - Math.max(0, loopX1), rollH);
    // Notes.
    for (const n of clip.notes) {
      const row = rowOf.get(n.pitch);
      if (row === undefined) continue;
      const x = n.start * ppt - sx;
      const nw = Math.max(3, n.duration * ppt - 1);
      const y = row * rowH - sy;
      if (x > w || x + nw < 0 || y > rollH || y + rowH < 0) continue;
      const sel = selected.has(n.id);
      const dim = !inLoop(n, clip);
      const on =
        pos !== null && !dim && pos >= n.start && pos < n.start + n.duration;
      g.fillStyle = on
        ? `oklch(0.95 0.1 ${hue})`
        : `oklch(${sel ? 0.88 : 0.78} 0.15 ${hue} / ${dim ? 0.3 : 0.45 + 0.55 * n.velocity})`;
      g.fillRect(x + 0.5, y + 1, nw, rowH - 2);
      if (sel) {
        g.strokeStyle = "#fafafa";
        g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 1.5, nw, rowH - 3);
      }
    }
    if (scrubTick.current !== null) {
      g.fillStyle = "rgba(125,211,252,0.9)";
      g.fillRect(Math.round(scrubTick.current * ppt - sx), 0, 1, rollH);
    }
    // Insert marker (where paste and the Set buttons go).
    if (insert.current !== null) {
      g.fillStyle = "rgba(251,191,36,0.7)";
      g.fillRect(Math.round(insert.current * ppt - sx), 0, 1, rollH);
    }
    const gst = gesture.current;
    if (gst?.kind === "marquee") {
      const x = Math.min(gst.x0, gst.x1) - sx;
      const y = Math.min(gst.y0, gst.y1) - sy;
      const mw = Math.abs(gst.x1 - gst.x0);
      const mh = Math.abs(gst.y1 - gst.y0);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.fillRect(x, y, mw, mh);
      g.strokeRect(x + 0.5, y + 0.5, mw, mh);
    }

    drawKeys(keysRef.current, rows, sy, rowH, rollH, dpr, lit, hue, labels);
    drawRuler(
      rulerRef.current,
      sx,
      ppt,
      beat,
      bar,
      dpr,
      selSpan,
      hue,
      scrubTick.current,
    );
    drawLane(laneRef.current, clip, selected, sx, ppt, dpr);
    drawMap(
      mapRef.current,
      clip,
      latest.current.viewEnd,
      contentW,
      sx,
      w,
      pos,
      dpr,
    );
    drawLoop(loopRef.current, clip, ppt, sx, dpr);
  }, [labels, timeSignature, insert]);

  // Coalesce redraws to one per frame.
  const pending = useRef(0);
  const redraw = useCallback(() => {
    if (pending.current) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = 0;
      draw();
    });
  }, [draw]);
  useEffect(() => redraw(), [redraw, clip, selected, size, ppt, rows, rowH]);
  useEffect(() => () => cancelAnimationFrame(pending.current), []);

  // Redraw when what's sounding changes, so an idle roll costs nothing.
  useEffect(() => {
    let lastKey = "";
    return onFrame(() => {
      const { clip, grid } = latest.current;
      const rel = session.clipPosition(trackId, clip.id, clip.length);
      // Position in the clip's content (the loop can start anywhere).
      const pos = rel === null ? null : loopStartOf(clip) + rel;
      const live = session.livePitches(trackId) ?? new Map<number, number>();
      sounding.current = { pos, live };
      const key = `${pos === null ? "" : Math.floor(pos / (grid / 4))}|${[...live.keys()].join()}`;
      if (key !== lastKey) {
        lastKey = key;
        redraw();
      }
    });
  }, [session, trackId, redraw]);

  // Playhead line.
  useEffect(() => {
    const el = playheadRef.current;
    if (!el || !playing) return;
    const stop = onFrame(() => {
      const { clip, ppt } = latest.current;
      const pos = session.clipPosition(trackId, clip.id, clip.length);
      el.style.opacity = pos === null ? "0" : "1";
      if (pos !== null)
        el.style.transform = `translateX(${(loopStartOf(clip) + pos) * ppt - view.current.x}px)`;
    });
    return () => {
      stop();
      el.style.opacity = "0";
    };
  }, [playing, session, trackId]);

  // Coordinates -------------------------------------------------------------------

  const local = (e: { clientX: number; clientY: number }) => {
    const r = rollRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - r.left + view.current.x,
      y: e.clientY - r.top + view.current.y,
    };
  };
  const rowAt = (y: number) =>
    Math.max(0, Math.min(rows.length - 1, Math.floor(y / rowH)));
  const pitchAt = (y: number) => rows[rowAt(y)];
  const snap = (t: number, free: boolean) =>
    free ? Math.round(t) : Math.round(t / grid) * grid;
  const snapDown = (t: number, free: boolean) =>
    Math.max(0, free ? Math.round(t) : Math.floor(t / grid) * grid);

  const noteAt = (x: number, y: number) => {
    const pitch = pitchAt(y);
    for (let i = clip.notes.length - 1; i >= 0; i--) {
      const n = clip.notes[i];
      if (n.pitch !== pitch) continue;
      const nx = n.start * ppt;
      if (x >= nx && x <= nx + Math.max(4, n.duration * ppt)) return n;
    }
    return null;
  };
  const edgeOf = (n: Note, x: number) => {
    const x0 = n.start * ppt;
    const x1 = (n.start + n.duration) * ppt;
    if (x1 - x0 <= EDGE_PX * 2.5) return null;
    if (x >= x1 - EDGE_PX) return "resizeEnd" as const;
    if (x <= x0 + EDGE_PX) return "resizeStart" as const;
    return null;
  };

  const audition = (pitch: number, velocity = DEFAULT_VELOCITY) => {
    if (session.getState().preview)
      session.hit(trackId, pitch, velocity, grid, { duration: 0.2 });
  };

  const select = (ids: Set<Id>) => setSelected(ids);

  /** Scrub to the time under a screen x. */
  const scrubAt = (clientX: number) => {
    const roll = rollRef.current;
    if (!roll) return;
    const { clip, ppt } = latest.current;
    const x = clientX - roll.getBoundingClientRect().left + view.current.x;
    const tick = Math.max(0, Math.min(latest.current.viewEnd - 1, x / ppt));
    scrubTick.current = tick;
    scrubber.move(clip.notes, tick);
    redraw();
  };
  const stopScrub = () => {
    scrubber.stop();
    if (scrubTick.current === null) return;
    scrubTick.current = null;
    redraw();
  };
  const scrubHeld = useScrubKey((held) => {
    if (!held) stopScrub();
    else if (pointer.current.inside) scrubAt(pointer.current.clientX);
  });

  // Roll pointer handling -----------------------------------------------------------

  const startNoteDrag = (
    hit: Note,
    x: number,
    y: number,
    kind: NoteDrag["kind"],
    copy: boolean,
  ) => {
    let ids = selected.has(hit.id) ? selected : new Set([hit.id]);
    const narrow = selected.has(hit.id) && selected.size > 1;
    let clicked = hit.id;
    store.begin();
    if (copy) {
      // Copy the selection and drag the copies; originals stay put.
      const map = new Map<Id, Id>();
      const copies = clip.notes
        .filter((n) => ids.has(n.id))
        .map((n) => {
          const id = newId();
          map.set(n.id, id);
          return { ...n, id };
        });
      clicked = map.get(hit.id)!;
      store.update((d) => addNotes(d, clipId, copies));
      ids = new Set(copies.map((n) => n.id));
    }
    select(ids);
    const notes = store.get().clips[clipId].notes;
    gesture.current = {
      kind,
      origin: new Map(notes.filter((n) => ids.has(n.id)).map((n) => [n.id, n])),
      tick: x / ppt,
      row: rowAt(y),
      clicked,
      moved: copy,
      narrow,
      lastPitch: hit.pitch,
      create: false,
    };
    audition(hit.pitch, hit.velocity);
  };

  const createNote = (x: number, y: number, free: boolean, drag: boolean) => {
    const note: Note = {
      id: newId(),
      pitch: pitchAt(y),
      start: snapDown(x / ppt, free),
      duration: lastLength.current,
      velocity: DEFAULT_VELOCITY,
    };
    store.begin();
    store.update((d) => addNotes(d, clipId, [note]));
    select(new Set([note.id]));
    audition(note.pitch);
    if (!drag) {
      store.end();
      return;
    }
    gesture.current = {
      kind: "resizeEnd",
      origin: new Map([[note.id, note]]),
      tick: x / ppt,
      row: rowAt(y),
      clicked: note.id,
      moved: true,
      narrow: false,
      lastPitch: note.pitch,
      create: true,
    };
  };

  const deleteNote = (id: Id) => {
    store.update((d) => removeNotes(d, clipId, new Set([id])));
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  };

  const holdView = () => setHeldEnd(latest.current.viewEnd);
  const releaseView = () => setHeldEnd(null);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    startLongPress(e);
    holdView();
    e.currentTarget.setPointerCapture(e.pointerId);
    session.ensureAudio();
    const { x, y } = local(e);
    const hit = noteAt(x, y);
    const free = e.metaKey || e.ctrlKey;
    const draw = settings.tool === "draw";

    if (hit) {
      if (e.shiftKey) {
        const next = new Set(selected);
        if (next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
        select(next);
        return;
      }
      startNoteDrag(hit, x, y, edgeOf(hit, x) ?? "move", e.altKey);
      return;
    }

    insert.current = snapDown(x / ppt, free);
    if (draw) {
      createNote(x, y, free, true);
      return;
    }
    gesture.current = {
      kind: "marquee",
      x0: x,
      y0: y,
      x1: x,
      y1: y,
      base: e.shiftKey ? new Set(selected) : new Set(),
      additive: e.shiftKey,
    };
    redraw();
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    trackLongPress(e);
    const g = gesture.current;
    pointer.current = { inside: true, clientX: e.clientX };
    if (scrubHeld.current && !g) scrubAt(e.clientX);
    const { x, y } = local(e);
    if (!g) {
      const hit = noteAt(x, y);
      const edge = hit && edgeOf(hit, x);
      e.currentTarget.style.cursor = hit
        ? edge
          ? "ew-resize"
          : "grab"
        : settings.tool === "draw"
          ? "crosshair"
          : "default";
      const pitch = pitchAt(y);
      if (pitch !== hoverPitch.current) {
        hoverPitch.current = pitch;
        redraw();
      }
      return;
    }
    if (g.kind === "marquee") {
      g.x1 = x;
      g.y1 = y;
      const t0 = Math.min(g.x0, x) / ppt;
      const t1 = Math.max(g.x0, x) / ppt;
      const r0 = rowAt(Math.min(g.y0, y));
      const r1 = rowAt(Math.max(g.y0, y));
      const next = new Set(g.base);
      for (const n of clip.notes) {
        const row = rowOf.get(n.pitch);
        if (
          row !== undefined &&
          row >= r0 &&
          row <= r1 &&
          n.start < t1 &&
          n.start + n.duration > t0
        )
          next.add(n.id);
      }
      select(next);
      redraw();
      return;
    }
    if (g.kind !== "move" && g.kind !== "resizeEnd" && g.kind !== "resizeStart")
      return;

    const free = e.metaKey || e.ctrlKey;
    const raw = x / ppt - g.tick;
    const dRow = g.kind === "move" ? rowAt(y) - g.row : 0;
    if (!g.moved && Math.abs(raw * ppt) < 3 && dRow === 0) return;
    g.moved = true;

    const edits = new Map<Id, Note>();
    for (const o of g.origin.values()) {
      if (g.kind === "move") {
        const row = Math.max(
          0,
          Math.min(rows.length - 1, (rowOf.get(o.pitch) ?? 0) + dRow),
        );
        edits.set(o.id, {
          ...o,
          start: Math.max(0, o.start + snap(raw, free)),
          pitch: rows[row],
        });
      } else {
        const min = free ? 10 : Math.min(grid, o.duration);
        const end = o.start + o.duration;
        if (g.kind === "resizeEnd") {
          // Drawing a new note: its end follows the pointer (through the step
          // under it). Resizing: the end moves by the drag, snapped.
          const target = g.create
            ? free
              ? x / ppt
              : Math.ceil(x / ppt / grid) * grid
            : free
              ? end + raw
              : Math.round((end + raw) / grid) * grid;
          edits.set(o.id, {
            ...o,
            duration: Math.max(min, Math.round(target - o.start)),
          });
        } else {
          const target = free
            ? o.start + raw
            : Math.round((o.start + raw) / grid) * grid;
          const start = Math.max(0, Math.min(end - min, Math.round(target)));
          edits.set(o.id, { ...o, start, duration: end - start });
        }
      }
    }
    store.update((d) => patchNotes(d, clipId, edits));

    const clickedNote = edits.get(g.clicked);
    if (clickedNote && clickedNote.pitch !== g.lastPitch) {
      g.lastPitch = clickedNote.pitch;
      audition(clickedNote.pitch, clickedNote.velocity);
    }
    if (g.kind === "resizeEnd" && g.origin.size === 1 && clickedNote) {
      lastLength.current = clickedNote.duration;
    }
  };

  // Select tool: double-click adds a note on empty space, deletes one on a
  // note. (Pointer events don't carry a click count, so use dblclick.)
  const onDoubleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (settings.tool !== "select") return;
    const { x, y } = local(e);
    const hit = noteAt(x, y);
    if (hit) deleteNote(hit.id);
    else createNote(x, y, e.metaKey || e.ctrlKey, false);
  };

  const onPointerUp = () => {
    clearTimeout(longPress.current);
    releaseView();
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "marquee") {
      if (Math.hypot(g.x1 - g.x0, g.y1 - g.y0) < 3 && !g.additive)
        select(new Set());
      redraw();
      return;
    }
    if (g.kind === "move" && !g.moved) {
      // A click without a drag: Draw deletes the note; Select narrows to it.
      if (settings.tool === "draw") deleteNote(g.clicked);
      else if (g.narrow) select(new Set([g.clicked]));
    }
    if (g.kind === "move" || g.kind === "resizeEnd" || g.kind === "resizeStart")
      store.end();
    redraw();
  };

  // Ruler: stretch handles around the selection, or set the insert marker.

  const onRulerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    holdView();
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left + view.current.x;
    if (selSpan) {
      const sx = selSpan.start * ppt;
      const ex = selSpan.end * ppt;
      const side =
        Math.abs(x - ex) <= HANDLE_PX
          ? "end"
          : Math.abs(x - sx) <= HANDLE_PX
            ? "start"
            : null;
      if (side && selSpan.end > selSpan.start) {
        e.currentTarget.setPointerCapture(e.pointerId);
        store.begin();
        gesture.current = {
          kind: "stretch",
          anchor: side === "end" ? selSpan.start : selSpan.end,
          edge: side === "end" ? selSpan.end : selSpan.start,
          origin: new Map(selection.map((n) => [n.id, n])),
        };
        return;
      }
    }
    // Click sets the insert marker; dragging scrubs.
    insert.current = snapDown(x / ppt, e.metaKey || e.ctrlKey);
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind: "scrub" };
    scrubAt(e.clientX);
  };

  const onRulerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left + view.current.x;
    if (g?.kind === "scrub") {
      scrubAt(e.clientX);
      return;
    }
    if (g?.kind !== "stretch") {
      const near =
        selSpan &&
        (Math.abs(x - selSpan.start * ppt) <= HANDLE_PX ||
          Math.abs(x - selSpan.end * ppt) <= HANDLE_PX);
      e.currentTarget.style.cursor = near ? "ew-resize" : "pointer";
      return;
    }
    const target = snap(x / ppt, e.metaKey || e.ctrlKey);
    const factor = Math.max(0.05, (target - g.anchor) / (g.edge - g.anchor));
    const edits = new Map<Id, Note>();
    for (const o of g.origin.values()) {
      const a = g.anchor + (o.start - g.anchor) * factor;
      const b = g.anchor + (o.start + o.duration - g.anchor) * factor;
      const start = Math.max(0, Math.round(Math.min(a, b)));
      edits.set(o.id, {
        ...o,
        start,
        duration: Math.max(1, Math.round(Math.abs(b - a))),
      });
    }
    store.update((d) => patchNotes(d, clipId, edits));
  };

  const onRulerUp = () => {
    releaseView();
    if (gesture.current?.kind === "scrub") {
      gesture.current = null;
      stopScrub();
      return;
    }
    if (gesture.current?.kind !== "stretch") return;
    gesture.current = null;
    store.end();
  };

  // Velocity lane -----------------------------------------------------------------

  const setVelocityAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left + view.current.x;
    const v = Math.max(
      1 / 127,
      clamp01(1 - (e.clientY - r.top - 4) / (LANE_H - 8)),
    );
    const reach = Math.max(4, (grid * ppt) / 2);
    const near = clip.notes.filter((n) => Math.abs(n.start * ppt - x) <= reach);
    const targets = near.some((n) => selected.has(n.id))
      ? near.filter((n) => selected.has(n.id))
      : near;
    const edits = new Map(
      targets
        .filter((n) => n.velocity !== v)
        .map((n) => [n.id, { ...n, velocity: v }]),
    );
    store.update((d) => patchNotes(d, clipId, edits));
  };

  // Scrolling and zoom ------------------------------------------------------------

  /** Horizontal zoom keeping the tick under `px` (view pixels) in place. */
  // Uses the latest layout, so repeated calls within one drag stay consistent.
  const zoomTo = (next: number, px: number) => {
    const { ppt, baseW, viewEnd, width } = latest.current;
    const z = Math.min(32, Math.max(1, next));
    const tick = (px + view.current.x) / ppt;
    const nextPpt = (baseW * z) / viewEnd;
    view.current.x = Math.max(
      0,
      Math.min(baseW * z - width, tick * nextPpt - px),
    );
    latest.current = {
      ...latest.current,
      zoom: z,
      ppt: nextPpt,
      contentW: baseW * z,
    };
    setZoom(z);
    redraw();
  };

  const onWheel = (e: WheelEvent) => {
    const v = view.current;
    const r = rollRef.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      // Pinch on a trackpad arrives as ctrl+wheel.
      zoomTo(zoom * Math.exp(-e.deltaY * 0.01), e.clientX - r.left);
      return;
    }
    if (e.altKey) {
      const next = Math.min(
        28,
        Math.max(7, rowH * Math.exp(-e.deltaY * 0.005)),
      );
      const py = e.clientY - r.top;
      const row = (py + v.y) / rowH;
      v.y = Math.max(0, row * next - py);
      setRowH(next);
      return;
    }
    v.x = clampX(v.x + (e.shiftKey ? e.deltaY : e.deltaX));
    v.y = clampY(v.y + (e.shiftKey ? 0 : e.deltaY));
    redraw();
  };

  /**
   * Minimap: the box follows the pointer one-to-one. Each drag commits to an
   * axis after a few pixels: sideways scrolls, up/down zooms (down = in),
   * so a slightly diagonal drag doesn't do both. Click outside the box to
   * jump there; double-click to fit.
   */
  const onMapDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const w = el.clientWidth;
    const scrollTo = (x: number) => {
      const { contentW, width } = latest.current;
      view.current.x = Math.max(0, Math.min(Math.max(0, contentW - width), x));
      redraw();
    };
    const x = e.clientX - el.getBoundingClientRect().left;
    {
      const { contentW, width } = latest.current;
      const scale = w / contentW;
      const viewLeft = view.current.x * scale;
      if (x < viewLeft || x > viewLeft + width * scale)
        scrollTo(x / scale - width / 2);
    }
    const startX = e.clientX;
    const startY = e.clientY;
    let lastX = startX;
    let lastY = startY;
    let axis: "x" | "y" | null = null;
    const move = (ev: globalThis.PointerEvent) => {
      if (!axis) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) < 4) return;
        axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }
      if (axis === "x") {
        // Box moves with the pointer: map pointer pixels to content pixels.
        const { contentW } = latest.current;
        scrollTo(view.current.x + ((ev.clientX - lastX) * contentW) / w);
      } else {
        const { zoom, width } = latest.current;
        zoomTo(zoom * Math.exp((ev.clientY - lastY) * 0.008), width / 2);
      }
      lastX = ev.clientX;
      lastY = ev.clientY;
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  // Loop brace strip --------------------------------------------------------------

  const onLoopDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    holdView();
    e.currentTarget.setPointerCapture(e.pointerId);
    const px =
      e.clientX - e.currentTarget.getBoundingClientRect().left + view.current.x;
    gesture.current = {
      kind: "loop",
      handle: braceHandleAt(px, loopStartOf(clip) * ppt, loopEndOf(clip) * ppt),
      from: px / ppt,
      orig: { start: loopStartOf(clip), length: clip.length },
    };
    store.begin();
  };
  const onLoopMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const px =
      e.clientX - e.currentTarget.getBoundingClientRect().left + view.current.x;
    const g = gesture.current;
    if (g?.kind !== "loop") {
      e.currentTarget.style.cursor = braceCursor(
        braceHandleAt(px, loopStartOf(clip) * ppt, loopEndOf(clip) * ppt),
      );
      return;
    }
    const next = dragBrace(
      g.handle,
      g.orig,
      g.from,
      px / ppt,
      grid,
      e.metaKey || e.ctrlKey,
    );
    store.update((d) => setLoop(d, clipId, next.start, next.length));
  };
  const onLoopUp = () => {
    releaseView();
    if (gesture.current?.kind !== "loop") return;
    gesture.current = null;
    store.end();
  };

  /** Set the loop to the selected notes, rounded out to the grid. */
  /** The selected notes' span, rounded out to the grid. */
  const selectionRange = () => {
    if (!selSpan) return null;
    const start = Math.floor(selSpan.start / grid) * grid;
    const end = Math.max(start + grid, Math.ceil(selSpan.end / grid) * grid);
    return { start, end };
  };
  const loopSelection = () => {
    const r = selectionRange();
    if (r) store.update((d) => setLoop(d, clipId, r.start, r.end - r.start));
  };
  /** Loop the selection and crop to it (one undo step). */
  const cropSelection = () => {
    const r = selectionRange();
    if (!r) return;
    store.update((d) => cropToRange(d, clipId, r.start, r.end));
    insert.current = null;
  };
  const duplicateSelection = () => {
    const sel = clip.notes.filter((n) => selected.has(n.id));
    if (!sel.length) return;
    // Duplicate right after itself.
    const start = Math.min(...sel.map((n) => n.start));
    const end = Math.max(...sel.map((n) => n.start + n.duration));
    const span = Math.ceil((end - start) / grid) * grid;
    const copies = sel.map((n) => ({
      ...n,
      id: newId(),
      start: n.start + span,
    }));
    store.update((d) => addNotes(d, clipId, copies));
    select(new Set(copies.map((n) => n.id)));
  };
  const deleteSelection = () => {
    store.update((d) => removeNotes(d, clipId, selected));
    select(new Set());
  };

  // Right-click menu ------------------------------------------------------------

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  /** Open the menu at a screen point; a note there gets selected first, like Live. */
  const openMenu = (clientX: number, clientY: number) => {
    const { x, y } = local({ clientX, clientY });
    const hit = noteAt(x, y);
    if (hit && !latest.current.selected.has(hit.id)) select(new Set([hit.id]));
    const box = boxRef.current!.getBoundingClientRect();
    setMenu({ x: clientX - box.left, y: clientY - box.top });
  };
  const onContextMenu = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  };

  // Touch -----------------------------------------------------------------------

  /** Drop the gesture in progress, undoing anything it changed. */
  const cancelGesture = () => {
    clearTimeout(longPress.current);
    if (gesture.current?.kind === "scrub") stopScrub();
    gesture.current = null;
    store.cancel();
    releaseView();
    redraw();
  };

  // Two fingers pan (content follows the fingers) and pinch-zoom time.
  useTwoFingerGestures(boxRef, {
    onStart: cancelGesture,
    onPan: (dx, dy) => {
      const { contentW, width, rows, rowH, rollH } = latest.current;
      const v = view.current;
      v.x = Math.max(0, Math.min(Math.max(0, contentW - width), v.x - dx));
      v.y = Math.max(
        0,
        Math.min(Math.max(0, rows.length * rowH - rollH), v.y - dy),
      );
      redraw();
    },
    onPinch: (scale, centerX) => {
      const left = rollRef.current!.getBoundingClientRect().left;
      zoomTo(latest.current.zoom * scale, centerX - left);
    },
  });

  // Long-press opens the menu on touch screens (iOS has no contextmenu event).
  const longPress = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pressStart = useRef({ x: 0, y: 0 });
  const startLongPress = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch") return;
    const { clientX, clientY } = e;
    pressStart.current = { x: clientX, y: clientY };
    longPress.current = setTimeout(() => {
      cancelGesture();
      openMenu(clientX, clientY);
    }, 500);
  };
  const trackLongPress = (e: PointerEvent<HTMLCanvasElement>) => {
    const moved = Math.hypot(
      e.clientX - pressStart.current.x,
      e.clientY - pressStart.current.y,
    );
    if (moved > 8) clearTimeout(longPress.current);
  };
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.("[data-roll-menu]"))
        setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const fit = () => {
    view.current.x = 0;
    setZoom(1);
    redraw();
  };

  // Commands ------------------------------------------------------------------------

  const targetIds = () => (selected.size ? selected : undefined);
  const quantize = () =>
    store.update((d) =>
      quantizeNotes(d, clipId, grid, targetIds(), quantizeOptions()),
    );
  const legato = () => store.update((d) => legatoNotes(d, clipId, targetIds()));
  const scaleSelection = (factor: number) =>
    selSpan &&
    store.update((d) =>
      stretchNotes(d, clipId, selected, selSpan.start, factor),
    );

  const copy = () => {
    const sel = clip.notes.filter((n) => selected.has(n.id));
    if (!sel.length) return false;
    const start = Math.min(...sel.map((n) => n.start));
    noteClipboard = sel.map((n) => ({ ...n, start: n.start - start }));
    return true;
  };
  const paste = () => {
    if (!noteClipboard.length) return;
    const at = insert.current ?? selSpan?.end ?? 0;
    const notes = noteClipboard.map((n) => ({
      ...n,
      id: newId(),
      start: n.start + at,
    }));
    store.update((d) => addNotes(d, clipId, notes));
    select(new Set(notes.map((n) => n.id)));
    const span = Math.max(...noteClipboard.map((n) => n.start + n.duration));
    insert.current = at + Math.ceil(span / grid) * grid;
  };

  const moveSelection = (ticks: Tick, semitones: number) => {
    const sel = clip.notes.filter((n) => selected.has(n.id));
    if (!sel.length) return;
    const edits = new Map(
      sel.map((n) => [
        n.id,
        {
          ...n,
          start: Math.max(0, n.start + ticks),
          pitch: Math.max(0, Math.min(127, n.pitch + semitones)),
        },
      ]),
    );
    store.update((d) => patchNotes(d, clipId, edits));
    if (semitones && sel.length === 1) audition(sel[0].pitch + semitones);
  };

  // Commands reach the editor through this; it never handles keys itself.
  const editor: NoteEditor = {
    hasSelection: () => latest.current.selected.size > 0,
    selectAll: () => select(new Set(clip.notes.map((n) => n.id))),
    clearSelection: () => {
      select(new Set());
      insert.current = null;
      redraw();
    },
    copy: () => void copy(),
    cut: () => {
      if (copy()) deleteSelection();
    },
    paste,
    deleteSelection,
    duplicateSelection,
    quantize,
    legato,
    loopSelection,
    cropSelection,
    stretchSelection: (factor) => void scaleSelection(factor),
    moveSelection,
    toggleTool: () =>
      editorSettings.set({
        tool: editorSettings.get().tool === "draw" ? "select" : "draw",
      }),
    setTool: (tool) => editorSettings.set({ tool }),
    toggleFold: () => editorSettings.set({ fold: !editorSettings.get().fold }),
    fit,
  };
  useLayoutEffect(() => {
    editorRef.current = editor;
  });
  useLayoutEffect(
    () => () => {
      editorRef.current = null;
    },
    [editorRef],
  );
  // Command buttons outside the editor depend on its selection and settings.
  const commands = useCommands();
  useEffect(() => commands.notify(), [commands, selected, settings]);

  const hasSelection = selected.size > 0;

  return (
    <div className="flex h-full min-h-0 flex-col select-none">
      <div className="flex h-8 shrink-0 items-center gap-2 overflow-x-auto border-b border-zinc-900 px-2 text-xs *:shrink-0">
        <div
          className="flex rounded bg-zinc-950/60 p-0.5"
          role="group"
          aria-label="Tool"
        >
          {(
            [
              [
                "select",
                "Select (B): drag to box-select, double-click to add",
                MousePointer2,
              ],
              ["draw", "Draw (B): click to add, drag to set length", Pencil],
            ] as const
          ).map(([tool, label, Icon]) => (
            <button
              key={tool}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={settings.tool === tool}
              className={`flex h-5 w-7 items-center justify-center rounded-sm ${
                settings.tool === tool
                  ? "bg-zinc-600 text-zinc-50"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              onClick={() => editorSettings.set({ tool })}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
        <Divider />
        {/* Note actions: on the selection, or every note when nothing is selected. */}
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label="Notes"
        >
          <CommandToolButton id="clip.quantize">
            <Magnet size={13} /> Quantize
          </CommandToolButton>
          <select
            aria-label="Quantize strength"
            title="Quantize strength: how far notes move toward the grid"
            className="h-6 rounded bg-zinc-950/60 px-1 text-[11px] text-zinc-200"
            value={settings.quantizeAmount}
            onChange={(e) =>
              editorSettings.set({
                quantizeAmount: Number(e.currentTarget.value),
              })
            }
          >
            {[1, 0.75, 0.5, 0.25].map((a) => (
              <option key={a} value={a}>
                {a * 100}%
              </option>
            ))}
          </select>
          <label
            className="flex items-center gap-1 text-[11px] text-zinc-400"
            title="Quantize note ends too, so lengths land on the grid"
          >
            <input
              type="checkbox"
              className="accent-amber-400"
              checked={settings.quantizeEnds}
              onChange={(e) =>
                editorSettings.set({ quantizeEnds: e.currentTarget.checked })
              }
            />
            Ends
          </label>
          <CommandToolButton id="notes.legato">
            <StretchHorizontal size={13} /> Legato
          </CommandToolButton>
        </div>
        <Divider />
        {/* Selection actions: need selected notes. */}
        <div
          className={`flex items-center gap-1 ${hasSelection ? "" : "opacity-60"}`}
          role="group"
          aria-label="Selection"
        >
          <span
            className="mr-0.5 text-[11px] text-zinc-500 tabular-nums"
            title="Drag the handles in the ruler to stretch the selection"
          >
            {hasSelection ? `${selected.size} selected` : "Selection"}
          </span>
          <CommandToolButton id="notes.stretchHalf">÷2</CommandToolButton>
          <CommandToolButton id="notes.stretchDouble">×2</CommandToolButton>
          <CommandToolButton id="notes.loopSelection">
            <Repeat size={13} /> Loop
          </CommandToolButton>
          <CommandToolButton id="notes.cropSelection">
            <Crop size={13} /> Crop
          </CommandToolButton>
        </div>
        {/* View: changes what you see, not the notes. */}
        <div
          className="ml-auto flex items-center gap-1"
          role="group"
          aria-label="View"
        >
          <CommandToolButton id="notes.fold" active={settings.fold}>
            <Rows3 size={13} /> Fold
          </CommandToolButton>
          <CommandToolButton id="notes.fit">
            <Scaling size={13} /> Fit
          </CommandToolButton>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex shrink-0 flex-col" style={{ width: keysW }}>
          <div
            className="flex items-center px-1.5 text-[10px] text-zinc-600"
            style={{ height: MAP_H + LOOP_H + RULER_H }}
          />
          <canvas
            ref={keysRef}
            className="cursor-pointer"
            style={{ width: keysW, height: rollH }}
            onWheel={onWheel}
            onPointerDown={(e) => {
              // Click a key: play it and select its notes (⇧ adds).
              const r = e.currentTarget.getBoundingClientRect();
              const pitch = pitchAt(e.clientY - r.top + view.current.y);
              audition(pitch);
              const ids = clip.notes
                .filter((n) => n.pitch === pitch)
                .map((n) => n.id);
              select(new Set([...(e.shiftKey ? selected : []), ...ids]));
            }}
          />
          <div
            className="flex items-end px-2 pb-1 text-[11px] text-zinc-500"
            style={{ height: LANE_H }}
          >
            Velocity
          </div>
        </div>
        <div ref={boxRef} className="relative min-w-0 flex-1 overflow-hidden">
          <canvas
            ref={mapRef}
            aria-label="Clip overview"
            title="Drag to scroll, drag up/down to zoom, double-click to fit"
            className="block cursor-grab touch-none active:cursor-grabbing"
            style={{ width: size.w, height: MAP_H }}
            onPointerDown={onMapDown}
            onDoubleClick={fit}
            onWheel={(e) => {
              view.current.x = clampX(view.current.x + (e.deltaX || e.deltaY));
              redraw();
            }}
          />
          <canvas
            ref={loopRef}
            aria-label="Loop brace"
            title="Loop: drag the ends to resize, the middle to move, or drag elsewhere to draw a new loop (⌘ for off-grid)"
            className="block touch-none"
            style={{ width: size.w, height: LOOP_H }}
            onPointerDown={onLoopDown}
            onPointerMove={onLoopMove}
            onPointerUp={onLoopUp}
            onPointerCancel={onLoopUp}
            onWheel={onWheel}
          />
          <canvas
            ref={rulerRef}
            className="block touch-none"
            style={{ width: size.w, height: RULER_H }}
            onWheel={onWheel}
            onPointerDown={onRulerDown}
            onPointerMove={onRulerMove}
            onPointerUp={onRulerUp}
            onPointerCancel={onRulerUp}
          />
          <canvas
            ref={rollRef}
            aria-label="Piano roll"
            className="block touch-none"
            style={{ width: size.w, height: rollH }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onPointerEnter={(e) => {
              pointer.current = { inside: true, clientX: e.clientX };
            }}
            onPointerLeave={() => {
              pointer.current.inside = false;
              if (scrubHeld.current) stopScrub();
              if (hoverPitch.current === null) return;
              hoverPitch.current = null;
              redraw();
            }}
            onWheel={onWheel}
          />
          <canvas
            ref={laneRef}
            className="block cursor-ns-resize touch-none"
            style={{ width: size.w, height: LANE_H }}
            onWheel={onWheel}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              gesture.current = { kind: "velocity" };
              store.begin();
              setVelocityAt(e);
            }}
            onPointerMove={(e) =>
              gesture.current?.kind === "velocity" && setVelocityAt(e)
            }
            onPointerUp={() => {
              if (gesture.current?.kind !== "velocity") return;
              gesture.current = null;
              store.end();
            }}
          />
          {menu && (
            <div
              data-roll-menu
              role="menu"
              className="absolute z-30 w-52 rounded border border-zinc-700 bg-zinc-800 p-1 shadow-xl"
              style={{
                left: Math.min(menu.x, size.w - 210),
                top: Math.min(menu.y, size.h - 230),
              }}
            >
              {MENU.map((id, i) =>
                id ? (
                  <MenuItem key={id} id={id} onDone={() => setMenu(null)} />
                ) : (
                  <div key={i} className="my-1 h-px bg-zinc-700" />
                ),
              )}
            </div>
          )}
          <div
            ref={playheadRef}
            className="pointer-events-none absolute left-0 w-px bg-zinc-100/80 opacity-0"
            style={{ top: MAP_H + LOOP_H, height: RULER_H + rollH }}
          />
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px bg-zinc-700" />;
}

/** A toolbar button that runs a command (label, shortcut and state from its definition). */
function CommandToolButton({
  id,
  active,
  children,
}: {
  id: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex h-6 items-center gap-1 rounded px-1.5 text-[11px] disabled:opacity-35 ${
        active ? "bg-zinc-600 text-zinc-50" : "text-zinc-300 hover:bg-zinc-700"
      }`}
      {...useCommandButton(id)}
    >
      {children}
    </button>
  );
}

/** The right-click menu: commands, null for a separator. */
const MENU: (string | null)[] = [
  "notes.loopSelection",
  "notes.cropSelection",
  null,
  "clip.quantize",
  "notes.legato",
  "notes.duplicate",
  "notes.delete",
];

function MenuItem({ id, onDone }: { id: string; onDone: () => void }) {
  const cmd = useCommand(id);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={!cmd.enabled}
      className="flex w-full items-center rounded px-2 py-1 text-left text-xs text-zinc-200 hover:bg-zinc-700 disabled:text-zinc-600 disabled:hover:bg-transparent"
      onClick={() => {
        onDone();
        void cmd.run();
      }}
    >
      <span className="flex-1">{cmd.title}</span>
      {cmd.shortcut && <span className="text-zinc-500">{cmd.shortcut}</span>}
    </button>
  );
}

/** Canvas resolution: sharp on retina, capped at 2× so phones stay fast. */
const pixelRatio = () => Math.min(2, window.devicePixelRatio || 1);

/** Size a canvas for the device pixel ratio and return a context in CSS pixels. */
function prepare(canvas: HTMLCanvasElement, w: number, h: number, dpr: number) {
  const W = Math.round(w * dpr);
  const H = Math.round(h * dpr);
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

function drawKeys(
  canvas: HTMLCanvasElement | null,
  rows: number[],
  sy: number,
  rowH: number,
  h: number,
  dpr: number,
  lit: Set<number>,
  hue: number,
  labels?: Map<number, string>,
) {
  if (!canvas || h <= 0) return;
  const w = canvas.clientWidth;
  const g = prepare(canvas, w, h, dpr);
  g.font = `${Math.min(10, rowH - 3)}px system-ui, sans-serif`;
  g.textBaseline = "middle";
  const first = Math.max(0, Math.floor(sy / rowH));
  const last = Math.min(rows.length - 1, Math.ceil((sy + h) / rowH));
  for (let r = first; r <= last; r++) {
    const pitch = rows[r];
    const y = r * rowH - sy;
    const black = BLACK.has(pitch % 12);
    g.fillStyle = lit.has(pitch)
      ? `oklch(0.78 0.15 ${hue})`
      : black
        ? "#27272a"
        : "#d4d4d8";
    g.fillRect(0, y, w, rowH - 1);
    const label = labels
      ? labels.get(pitch)
      : pitch % 12 === 0 || rows.length < 128
        ? noteName(pitch)
        : undefined;
    if (label && rowH >= 9) {
      g.fillStyle = black && !lit.has(pitch) ? "#e4e4e7" : "#18181b";
      g.fillText(label, 4, y + rowH / 2);
    }
  }
}

function drawRuler(
  canvas: HTMLCanvasElement | null,
  sx: number,
  ppt: number,
  beat: Tick,
  bar: Tick,
  dpr: number,
  selSpan: { start: Tick; end: Tick } | null,
  hue: number,
  scrub: Tick | null,
) {
  if (!canvas) return;
  const w = canvas.clientWidth;
  const g = prepare(canvas, w, RULER_H, dpr);
  g.fillStyle = "#1c1c1f";
  g.fillRect(0, 0, w, RULER_H);
  if (scrub !== null) {
    const x = Math.round(scrub * ppt - sx);
    g.fillStyle = "rgba(125,211,252,0.9)";
    g.beginPath();
    g.moveTo(x - 5, 0);
    g.lineTo(x + 5, 0);
    g.lineTo(x, 7);
    g.fill();
    g.fillRect(x, 0, 1, RULER_H);
  }
  // Selection bracket with stretch handles.
  if (selSpan) {
    const x0 = selSpan.start * ppt - sx;
    const x1 = selSpan.end * ppt - sx;
    g.fillStyle = `oklch(0.72 0.14 ${hue} / 0.25)`;
    g.fillRect(x0, 2, x1 - x0, RULER_H - 4);
    g.fillStyle = `oklch(0.85 0.14 ${hue})`;
    g.fillRect(x0 - 1, 2, 3, RULER_H - 4);
    g.fillRect(x1 - 2, 2, 3, RULER_H - 4);
  }
  g.font = "10px system-ui, sans-serif";
  g.textBaseline = "middle";
  const first = Math.floor(sx / ppt / beat);
  const last = Math.ceil((sx + w) / ppt / beat);
  for (let b = first; b <= last; b++) {
    const tick = b * beat;
    const x = Math.round(tick * ppt - sx);
    const isBar = tick % bar === 0;
    g.fillStyle = isBar ? "#71717a" : "#3f3f46";
    g.fillRect(x, isBar ? 0 : RULER_H / 2, 1, isBar ? RULER_H : RULER_H / 2);
    if (isBar) {
      g.fillStyle = "#d4d4d8";
      g.fillText(String(tick / bar + 1), x + 4, RULER_H / 2);
    }
  }
}

function drawLane(
  canvas: HTMLCanvasElement | null,
  clip: Clip,
  selected: Set<Id>,
  sx: number,
  ppt: number,
  dpr: number,
) {
  if (!canvas) return;
  const w = canvas.clientWidth;
  const g = prepare(canvas, w, LANE_H, dpr);
  g.fillStyle = "#141416";
  g.fillRect(0, 0, w, LANE_H);
  for (const n of clip.notes) {
    const x = Math.round(n.start * ppt - sx);
    if (x < -4 || x > w + 4) continue;
    const h = (LANE_H - 8) * n.velocity;
    g.fillStyle = `oklch(${selected.has(n.id) ? 0.9 : 0.75} 0.15 ${clip.hue})`;
    g.fillRect(x, LANE_H - 4 - h, 2, h);
    g.fillRect(x - 2, LANE_H - 4 - h, 6, 2);
  }
}

/** The whole clip in miniature, with the visible part boxed. */
function drawMap(
  canvas: HTMLCanvasElement | null,
  clip: Clip,
  viewEnd: Tick,
  contentW: number,
  sx: number,
  viewW: number,
  pos: number | null,
  dpr: number,
) {
  if (!canvas) return;
  const w = canvas.clientWidth;
  const g = prepare(canvas, w, MAP_H, dpr);
  g.fillStyle = "#121214";
  g.fillRect(0, 0, w, MAP_H);
  const x = (t: Tick) => (t / viewEnd) * w;
  // The loop region, so you can see where it sits in the whole clip.
  g.fillStyle = `oklch(0.6 0.1 ${clip.hue} / 0.18)`;
  g.fillRect(x(loopStartOf(clip)), 0, x(clip.length), MAP_H);
  if (clip.notes.length) {
    const lo = Math.min(...clip.notes.map((n) => n.pitch));
    const hi = Math.max(...clip.notes.map((n) => n.pitch));
    const span = Math.max(1, hi - lo);
    for (const n of clip.notes) {
      g.fillStyle = `oklch(0.75 0.13 ${clip.hue} / ${inLoop(n, clip) ? 1 : 0.4})`;
      const y = 3 + (1 - (n.pitch - lo) / span) * (MAP_H - 8);
      g.fillRect(x(n.start), y, Math.max(1.5, x(n.duration)), 2);
    }
  }
  if (pos !== null) {
    g.fillStyle = "rgba(250,250,250,0.7)";
    g.fillRect(x(pos), 0, 1, MAP_H);
  }
  const scale = w / contentW;
  g.strokeStyle = "rgba(251,191,36,0.85)";
  g.fillStyle = "rgba(251,191,36,0.08)";
  g.fillRect(sx * scale, 1, viewW * scale, MAP_H - 2);
  g.strokeRect(
    sx * scale + 0.5,
    1.5,
    Math.max(3, viewW * scale - 1),
    MAP_H - 3,
  );
}

/** The loop brace strip: the loop as a bar with grab handles at both ends. */
function drawLoop(
  canvas: HTMLCanvasElement | null,
  clip: Clip,
  ppt: number,
  sx: number,
  dpr: number,
) {
  if (!canvas) return;
  const w = canvas.clientWidth;
  const g = prepare(canvas, w, LOOP_H, dpr);
  g.fillStyle = "#161618";
  g.fillRect(0, 0, w, LOOP_H);
  const x0 = loopStartOf(clip) * ppt - sx;
  const x1 = loopEndOf(clip) * ppt - sx;
  g.fillStyle = `oklch(0.7 0.13 ${clip.hue} / 0.55)`;
  g.fillRect(x0, 2, x1 - x0, LOOP_H - 4);
  g.fillStyle = `oklch(0.88 0.13 ${clip.hue})`;
  g.fillRect(x0, 2, 3, LOOP_H - 4);
  g.fillRect(x1 - 3, 2, 3, LOOP_H - 4);
}
