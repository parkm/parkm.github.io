import { memo, useMemo, useRef, useState, type Dispatch } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eraser,
  GripVertical,
  ListMusic,
  Play,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PianoKeyboard } from "./piano/Keyboard";
import { ChordPicker } from "./ChordPicker";
import { playNote, stopAllNotes } from "./piano/synth";
import { detectChord, invert, parseKey, prettyKey } from "./notes";
import type { Action, Section } from "./state";

export function playKeys(keys: string[]) {
  keys.forEach((key) => {
    const parsed = parseKey(key);
    if (parsed) playNote(parsed.note, parsed.octave);
  });
}

function previewChord(keys: string[]) {
  stopAllNotes();
  playKeys(keys);
  setTimeout(stopAllNotes, 400);
}

function ToolButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export const ChordCard = memo(function ChordCard({
  section,
  index,
  octaves,
  startOctave,
  canRemove,
  isActive,
  dispatch,
  onPlayStart,
}: {
  section: Section;
  index: number;
  octaves: number;
  startOctave: number;
  canRemove: boolean;
  /** Highlighted because the progression is currently playing this chord. */
  isActive: boolean;
  dispatch: Dispatch<Action>;
  onPlayStart: () => void;
}) {
  const { id, label, keys } = section;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const [isHeld, setIsHeld] = useState(false);
  const lastPointerType = useRef("");

  const chord = useMemo(() => detectChord(keys), [keys]);
  const invertedUp = useMemo(
    () => invert(keys, "up", { startOctave, octaves }),
    [keys, startOctave, octaves],
  );
  const invertedDown = useMemo(
    () => invert(keys, "down", { startOctave, octaves }),
    [keys, startOctave, octaves],
  );
  const hiddenNotes = keys.filter((k) => {
    const octave = parseKey(k)!.octave;
    return octave < startOctave || octave >= startOctave + octaves;
  });

  const startHold = () => {
    if (isHeld || !keys.length) return;
    onPlayStart();
    setIsHeld(true);
    stopAllNotes();
    playKeys(keys);
  };
  const endHold = () => {
    if (!isHeld) return;
    setIsHeld(false);
    stopAllNotes();
  };

  const applyInversion = (next: string[] | null) => {
    if (!next) return;
    dispatch({ type: "setKeys", id, keys: next });
    previewChord(next);
  };

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        // `relative` anchors the Play button's card-sized hit area (see below).
        "relative flex select-none flex-col gap-2 rounded-xl border bg-card p-2.5 text-card-foreground shadow-xs transition-[box-shadow,background-color]",
        "has-[[data-card-play]:hover]:bg-accent/40",
        isHeld && "bg-accent/70 has-[[data-card-play]:hover]:bg-accent/70",
        isActive && "ring-2 ring-primary",
        isDragging && "z-10 shadow-xl ring-2 ring-primary/50",
      )}
      aria-label={label || chord || `Keyboard ${index + 1}`}
    >
      {/* Name row */}
      <div className="flex h-8 items-center gap-1">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          className="relative z-10 flex h-7 shrink-0 cursor-grab touch-none items-center rounded-md pr-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing"
          aria-label={`Keyboard ${index + 1}, drag to reorder`}
          title="Drag to reorder"
        >
          <GripVertical className="size-4" />
          <span className="min-w-3 text-xs font-medium tabular-nums">
            {index + 1}
          </span>
        </button>
        <input
          type="text"
          value={label}
          onChange={(e) =>
            dispatch({ type: "setLabel", id, label: e.target.value })
          }
          placeholder={chord ?? "Name"}
          aria-label="Name"
          spellCheck={false}
          className={cn(
            "relative z-10 h-8 min-w-12 max-w-full select-text rounded-md [field-sizing:content] border border-transparent bg-transparent px-1.5 text-base font-semibold outline-none hover:border-input focus:border-input focus-visible:ring-2 focus-visible:ring-ring/40",
            chord
              ? "placeholder:text-foreground"
              : "placeholder:font-normal placeholder:text-muted-foreground/60",
          )}
        />
        {label && chord && label !== chord && (
          <span
            className="ml-auto max-w-[40%] shrink-0 truncate pl-2 text-xs text-muted-foreground"
            title={`Detected chord: ${chord}`}
          >
            {chord}
          </span>
        )}
      </div>

      <PianoKeyboard
        octaves={octaves}
        startOctave={startOctave}
        markedKeys={keys}
        isSounding={isHeld || isActive}
        onKeyToggle={(key) => dispatch({ type: "toggleKey", id, key })}
      />

      {/* Notes line, then tools. Fixed heights: nothing here changes size. */}
      <div className="-mt-0.5 flex h-4 items-center">
        <div
          className="min-w-0 flex-1 truncate px-0.5 font-mono text-xs"
          title={keys.map(prettyKey).join(" ")}
        >
          {keys.length ? (
            keys.map((k, i) => (
              <span
                key={k}
                className={
                  hiddenNotes.includes(k)
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
                }
                title={
                  hiddenNotes.includes(k)
                    ? `${prettyKey(k)} is outside the visible range`
                    : undefined
                }
              >
                {i > 0 && " "}
                {prettyKey(k)}
              </span>
            ))
          ) : (
            <span className="font-sans text-muted-foreground/70">
              Click keys to add notes
            </span>
          )}
        </div>
      </div>

      <div className="-mx-1 -mb-1 flex h-7 items-center gap-0.5">
        {/*
          The whole card plays the chord: this button's ::after is stretched
          over the card (the "stretched link" / pseudo-content pattern), and
          every other control is raised above it with z-10. One real button,
          so keyboard, screen readers and disabled state all just work.
          It must stay z-auto: as a flex item, a z-index here would make
          the stretched area paint over the keys and other controls.
        */}
        <ToolButton
          data-card-play
          disabled={!keys.length}
          aria-label="Play chord (hold)"
          className={cn(
            "static z-auto cursor-pointer select-none [-webkit-touch-callout:none] [touch-action:manipulation]",
            "after:absolute after:inset-0 after:rounded-xl after:content-['']",
            isHeld &&
              "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          )}
          onPointerDown={(e) => {
            lastPointerType.current = e.pointerType;
            // Touch plays on tap (click) instead, so a swipe that starts on a
            // card scrolls the page silently.
            if (e.pointerType === "touch" || e.button !== 0) return;
            e.preventDefault(); // no text selection while holding
            e.currentTarget.setPointerCapture(e.pointerId);
            startHold();
          }}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onLostPointerCapture={endHold}
          onClick={() => {
            if (lastPointerType.current !== "touch") return;
            onPlayStart();
            previewChord(keys);
          }}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            lastPointerType.current = "keyboard";
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault();
              startHold();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              endHold();
            }
          }}
          onBlur={endHold}
        >
          <Play />
        </ToolButton>
        <ChordPicker
          keys={keys}
          range={{ startOctave, octaves }}
          onApply={(next, undoGroup) => {
            dispatch({ type: "setKeys", id, keys: next, undoGroup });
            onPlayStart();
            previewChord(next);
          }}
        >
          <ToolButton title="Choose a chord" aria-label="Choose a chord">
            <ListMusic />
          </ToolButton>
        </ChordPicker>
        <div
          className="flex shrink-0 items-center"
          role="group"
          aria-label="Invert"
        >
          <ToolButton
            disabled={!invertedDown}
            onClick={() => applyInversion(invertedDown)}
            title="Invert down: move the top note below the bottom"
            aria-label="Invert down"
            className="w-6"
          >
            <ChevronDown />
          </ToolButton>
          <span
            className="select-none text-[11px] text-muted-foreground/80"
            aria-hidden
          >
            inv
          </span>
          <ToolButton
            disabled={!invertedUp}
            onClick={() => applyInversion(invertedUp)}
            title="Invert up: move the bottom note above the top"
            aria-label="Invert up"
            className="w-6"
          >
            <ChevronUp />
          </ToolButton>
        </div>
        <div className="flex-1" />
        <ToolButton
          disabled={!keys.length}
          onClick={() => dispatch({ type: "setKeys", id, keys: [] })}
          title="Clear notes"
          aria-label="Clear notes"
        >
          <Eraser />
        </ToolButton>
        <ToolButton
          onClick={() => dispatch({ type: "duplicate", id })}
          title="Duplicate (adds a copy after this one)"
          aria-label="Duplicate"
        >
          <Copy />
        </ToolButton>
        <ToolButton
          disabled={!canRemove}
          onClick={() => dispatch({ type: "remove", id })}
          title="Delete"
          aria-label="Delete"
          className="hover:text-destructive"
        >
          <Trash2 />
        </ToolButton>
      </div>
    </article>
  );
});
