import { useEffect, useRef } from "react";
import { findCommand } from "../commands/registry";
import type { Session } from "../engine/session";
import { DEFAULT_VELOCITY, drumKitOf } from "../model/ops";
import type { Tick } from "../model/time";
import type { Id, Track } from "../model/types";
import type { Commands } from "./commands";

/**
 * The window's keyboard. Each key press goes to the first command whose
 * shortcut matches and applies here; anything left over plays notes (pads on
 * drum tracks, a piano on synth tracks). Text fields keep their keys.
 */

/** Keys that play drum pads, top row of pads first. */
export const PAD_KEYS = [
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyJ",
  "KeyK",
  "KeyL",
];

/** Computer keyboard as a piano (synth tracks): A = C, W = C#, … ; = E above. */
export const PIANO_KEYS = [
  "KeyA",
  "KeyW",
  "KeyS",
  "KeyE",
  "KeyD",
  "KeyF",
  "KeyT",
  "KeyG",
  "KeyY",
  "KeyH",
  "KeyU",
  "KeyJ",
  "KeyK",
  "KeyO",
  "KeyL",
  "KeyP",
  "Semicolon",
];
const OCTAVE_DOWN = "KeyZ";
const OCTAVE_UP = "KeyX";

export type NoteInput = {
  track: Track | null;
  grid: Tick;
  octave: number;
  setOctave: (octave: number) => void;
};

const isTyping = (target: EventTarget | null) =>
  (target as HTMLElement | null)?.closest?.(
    "input, textarea, [contenteditable]",
  );

export function useKeyboard(
  commands: Commands,
  session: Session,
  noteInput: () => NoteInput,
) {
  // Latest note input without re-attaching listeners on every render.
  const input = useRef(noteInput);
  input.current = noteInput;

  useEffect(() => {
    // Notes held on the computer keyboard, by key code, so key-up ends the right one.
    const held = new Map<string, { trackId: Id; pitch: number }>();

    function playNote(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const { track, grid, octave, setOctave } = input.current();
      if (!track) return;
      const time = e.timeStamp / 1000;
      const pads = drumKitOf(track)?.pads;
      if (pads) {
        const pad = pads[PAD_KEYS.indexOf(e.code)];
        if (pad)
          session.hit(track.id, pad.pitch, DEFAULT_VELOCITY, grid, { time });
        return;
      }
      if (e.code === OCTAVE_DOWN || e.code === OCTAVE_UP) {
        setOctave(
          Math.min(8, Math.max(0, octave + (e.code === OCTAVE_UP ? 1 : -1))),
        );
        return;
      }
      const key = PIANO_KEYS.indexOf(e.code);
      if (key < 0 || held.has(e.code)) return;
      const pitch = (octave + 1) * 12 + key;
      held.set(e.code, { trackId: track.id, pitch });
      session.hit(track.id, pitch, DEFAULT_VELOCITY, grid, { time });
    }

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      // A focused dropdown must not swallow Space, or the music can't be stopped.
      if (target.closest?.("select")) {
        if (e.code !== "Space") return;
        target.blur();
      } else if (isTyping(target)) {
        return;
      }
      const cmd = findCommand(e, commands.context());
      if (cmd) {
        e.preventDefault();
        void commands.run(cmd.id);
        return;
      }
      playNote(e);
    }

    function onKeyUp(e: KeyboardEvent) {
      const note = held.get(e.code);
      if (!note) return;
      held.delete(e.code);
      session.release(note.trackId, note.pitch, e.timeStamp / 1000);
    }

    // Losing focus while a key is down would leave the note hanging; so can
    // focus moving into a control (an open dropdown can swallow the key-up).
    function releaseAll() {
      held.clear();
      session.releaseAll();
    }
    function onFocusIn(e: FocusEvent) {
      if ((e.target as HTMLElement).closest?.("input, textarea, select"))
        releaseAll();
    }
    // Hand focus back after picking from a dropdown so shortcuts keep working.
    function onChange(e: Event) {
      if (e.target instanceof HTMLSelectElement) e.target.blur();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("change", onChange);
    };
  }, [commands, session]);
}
