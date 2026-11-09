import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { prettyNote } from "../notes";
import { playNote, stopNote } from "./synth";

interface KeyProps {
  note: string;
  octave: number;
  type: "white" | "black";
  width: number;
  height: number;
  left: number;
  isMarked: boolean;
  /** The marked notes are being played (chord preview / progression). */
  isSounding: boolean;
  onToggle: () => void;
}

export function Key({
  note,
  octave,
  type,
  width,
  height,
  left,
  isMarked,
  isSounding,
  onToggle,
}: KeyProps) {
  const [pressed, setPressed] = useState(false);
  // Set when a mouse press already toggled the key, so the click that follows
  // doesn't toggle it back.
  const handledByPointer = useRef(false);
  const noteId = `${note}${octave}`;
  const isWhite = type === "white";
  const isDown = pressed || (isMarked && isSounding);

  const release = () => {
    if (!pressed) return;
    setPressed(false);
    stopNote(noteId);
  };

  let label: string | null = null;
  if (isWhite) {
    if (isMarked) label = width >= 22 ? `${note}${octave}` : note;
    else if (note === "C" && width >= 14) label = `C${octave}`;
  } else if (isMarked && width >= 13) {
    label = prettyNote(note);
  }

  return (
    <button
      type="button"
      aria-label={`${prettyNote(note)}${octave}`}
      aria-pressed={isMarked}
      className={cn(
        "absolute top-0 flex select-none items-end justify-center outline-none [-webkit-touch-callout:none] [touch-action:manipulation] focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring",
        isWhite
          ? "z-0 rounded-b-[3px] border-r border-b border-zinc-300 pb-1"
          : "z-10 rounded-b-[3px] pb-0.5 shadow-[0_1px_2px_rgb(0_0_0/0.5)]",
        isWhite
          ? isMarked
            ? isDown
              ? "bg-blue-400"
              : "bg-blue-300 hover:bg-blue-400/80"
            : isDown
              ? "bg-zinc-200"
              : "bg-white hover:bg-zinc-100"
          : isMarked
            ? isDown
              ? "bg-blue-700"
              : "bg-blue-500 hover:bg-blue-600"
            : isDown
              ? "bg-zinc-600"
              : "bg-zinc-900 hover:bg-zinc-700",
      )}
      style={{ left, width, height }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        handledByPointer.current = true;
        setPressed(true);
        playNote(note, octave);
        onToggle();
      }}
      onPointerUp={release}
      onPointerLeave={() => {
        // No click will follow once the pointer leaves.
        handledByPointer.current = false;
        release();
      }}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (handledByPointer.current) {
          handledByPointer.current = false;
          return;
        }
        // Touch taps and keyboard (Enter/Space) land here.
        playNote(note, octave);
        setTimeout(() => stopNote(noteId), 350);
        onToggle();
      }}
    >
      {label && (
        <span
          className={cn(
            "pointer-events-none whitespace-nowrap font-medium leading-none",
            width >= 26 ? "text-[11px]" : "text-[9px]",
            isWhite
              ? isMarked
                ? "text-blue-950"
                : "text-zinc-400"
              : "text-white",
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
}
