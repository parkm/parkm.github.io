import { useRef, useState, type PointerEvent } from "react";
import { DEFAULT_VELOCITY, drumKitOf } from "../model/ops";
import type { Tick } from "../model/time";
import type { Track } from "../model/types";
import { useDaw } from "./context";
import { noteName } from "./PianoRoll";

/**
 * On-screen instrument for touch screens: drum pads, or a two-octave piano.
 * It's real input, like the computer keyboard, so it records and feeds
 * Capture. Multi-touch: every finger is its own note, and sliding a finger
 * across the keys plays each key it reaches.
 */

type PlaySheetProps = {
  track: Track;
  grid: Tick;
  octave: number;
  setOctave: (octave: number) => void;
};

export function PlaySheet(props: PlaySheetProps) {
  const kit = drumKitOf(props.track);
  return (
    <section
      aria-label="Play"
      className="shrink-0 border-t border-zinc-950 bg-zinc-900 p-2"
    >
      {kit ? <Pads {...props} /> : <Piano {...props} />}
    </section>
  );
}

/**
 * Turns pointers into notes: down starts a note on the key under the finger,
 * moving onto another key moves the note there, up releases it. Keys are
 * found by `data-pitch` under the pointer, so it works with any layout.
 */
function useTouchNotes(track: Track, grid: Tick, sustain: boolean) {
  const { session } = useDaw();
  const fingers = useRef(new Map<number, number>());
  // Pitches held by any finger, to light their keys.
  const [down, setDown] = useState<ReadonlySet<number>>(new Set());
  const sync = () => setDown(new Set(fingers.current.values()));

  const pitchAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const pitch = el?.closest<HTMLElement>("[data-pitch]")?.dataset.pitch;
    return pitch === undefined ? null : Number(pitch);
  };
  const press = (id: number, pitch: number, time: number) => {
    fingers.current.set(id, pitch);
    session.hit(track.id, pitch, DEFAULT_VELOCITY, grid, { time });
    sync();
  };
  const lift = (id: number, time: number) => {
    const pitch = fingers.current.get(id);
    fingers.current.delete(id);
    if (pitch !== undefined && sustain) session.release(track.id, pitch, time);
    sync();
  };

  const handlers = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      const pitch = pitchAt(e);
      if (pitch === null) return;
      e.preventDefault();
      // Keep receiving this finger's moves even off the element.
      e.currentTarget.setPointerCapture(e.pointerId);
      press(e.pointerId, pitch, e.timeStamp / 1000);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (!fingers.current.has(e.pointerId)) return;
      const pitch = pitchAt(e);
      if (pitch === null || pitch === fingers.current.get(e.pointerId)) return;
      lift(e.pointerId, e.timeStamp / 1000);
      press(e.pointerId, pitch, e.timeStamp / 1000);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) =>
      lift(e.pointerId, e.timeStamp / 1000),
    onPointerCancel: (e: PointerEvent<HTMLElement>) =>
      lift(e.pointerId, e.timeStamp / 1000),
  };
  return { handlers, down };
}

function Pads({ track, grid }: PlaySheetProps) {
  const pads = drumKitOf(track)?.pads ?? [];
  const { handlers, down } = useTouchNotes(track, grid, false);
  return (
    <div
      className="grid touch-none grid-cols-3 gap-1.5 select-none"
      {...handlers}
    >
      {pads.map((pad) => (
        <div
          key={pad.id}
          data-pitch={pad.pitch}
          className={`flex h-14 items-end rounded-md p-2 text-xs ${
            down.has(pad.pitch)
              ? "bg-amber-400 text-zinc-900"
              : "bg-zinc-700 text-zinc-200"
          } ${pad.mute ? "opacity-50" : ""}`}
        >
          {pad.name}
        </div>
      ))}
    </div>
  );
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK = [1, 3, 6, 8, 10];
/** Where each black key sits, in white-key widths from the octave's start. */
const BLACK_AT: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
const OCTAVES = 2;

function Piano({ track, grid, octave, setOctave }: PlaySheetProps) {
  const { handlers, down } = useTouchNotes(track, grid, true);
  const base = (octave + 1) * 12;
  const whites = OCTAVES * 7;
  const keys = Array.from({ length: OCTAVES }, (_, o) => base + o * 12);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <button
          type="button"
          aria-label="Octave down"
          className="h-8 w-10 rounded bg-zinc-700 text-zinc-200 disabled:opacity-40"
          disabled={octave <= 0}
          onClick={() => setOctave(octave - 1)}
        >
          −
        </button>
        <span className="tabular-nums">{noteName(base)}</span>
        <button
          type="button"
          aria-label="Octave up"
          className="h-8 w-10 rounded bg-zinc-700 text-zinc-200 disabled:opacity-40"
          disabled={octave >= 7}
          onClick={() => setOctave(octave + 1)}
        >
          +
        </button>
      </div>
      <div className="relative h-36 touch-none select-none" {...handlers}>
        {keys.flatMap((start, o) =>
          WHITE.map((step, i) => (
            <div
              key={start + step}
              data-pitch={start + step}
              className={`absolute inset-y-0 rounded-b-md border border-zinc-400 ${
                down.has(start + step) ? "bg-amber-300" : "bg-zinc-100"
              }`}
              style={{
                left: `${((o * 7 + i) / whites) * 100}%`,
                width: `${100 / whites}%`,
              }}
            />
          )),
        )}
        {keys.flatMap((start, o) =>
          BLACK.map((step) => (
            <div
              key={start + step}
              data-pitch={start + step}
              className={`absolute top-0 h-[60%] rounded-b-md ${
                down.has(start + step) ? "bg-amber-500" : "bg-zinc-900"
              }`}
              style={{
                left: `${((o * 7 + BLACK_AT[step]) / whites) * 100 - 30 / whites}%`,
                width: `${60 / whites}%`,
              }}
            />
          )),
        )}
      </div>
    </div>
  );
}
