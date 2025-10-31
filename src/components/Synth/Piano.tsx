import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";

type KeyProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  isHighlighted?: boolean;
  isDown?: boolean;
};

function KeyBase({ className = "", style, ...rest }: KeyProps) {
  return (
    <button
      type="button"
      style={style}
      {...rest}
      className={`cursor-pointer transition-colors duration-50 outline-none ${className}`}
    />
  );
}

function WhiteKey({
  isHighlighted,
  isDown,
  noteLabel,
  ...rest
}: KeyProps & { noteLabel?: string }) {
  return (
    <KeyBase
      {...rest}
      className={`
        relative flex-1 h-full border border-gray-400 rounded-b-lg
        ${isDown ? "bg-gray-300" : isHighlighted ? "bg-gray-100" : "bg-white"}
      `}
    >
      {noteLabel && (
        <span className="absolute bottom-1 left-1 text-xs text-gray-600 select-none">
          {noteLabel}
        </span>
      )}
    </KeyBase>
  );
}

function BlackKey({ isHighlighted, isDown, ...rest }: KeyProps) {
  return (
    <KeyBase
      {...rest}
      className={`
        absolute top-0 rounded-b-lg border border-gray-900 z-20 pointer-events-auto shadow-md
        ${isDown ? "bg-gray-500" : isHighlighted ? "bg-gray-800" : "bg-black"}
      `}
    />
  );
}

type PianoProps = {
  octaves?: number;
  visibleOctaves?: number;
  startingOctave?: number;
  activeNotes?: string[];
  onKeyPress?: (note: string) => void;
  onKeyRelease?: (note: string) => void;
  focusOctave?: number;
};

const enharmonicMap: Record<string, string> = {
  Bb: "A#",
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
};

export function Piano({
  octaves = 1,
  visibleOctaves = 1,
  startingOctave = 3,
  activeNotes = [],
  onKeyPress,
  onKeyRelease,
  focusOctave,
}: PianoProps) {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const octaveRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const draggingRef = useRef(false);
  const currentNoteRef = useRef<string | null>(null);

  const normalizedActive = useMemo(
    () =>
      new Set(
        activeNotes.map((n) => {
          const m = n.match(/^([A-Ga-g])([#b]?)(\d)$/);
          if (!m) return n;
          const [, base, acc, oct] = m;
          const sharp = enharmonicMap[`${base.toUpperCase()}${acc}`];
          return sharp ? `${sharp}${oct}` : `${base.toUpperCase()}${acc}${oct}`;
        }),
      ),
    [activeNotes],
  );

  const pressKey = useCallback(
    (key: string, exclusive = false) => {
      setActiveKeys((prev: Set<string>) => {
        const next = exclusive ? new Set<string>() : new Set(prev);
        next.add(key);
        return next;
      });
      onKeyPress?.(key);
    },
    [onKeyPress],
  );

  const releaseKey = useCallback(
    (key: string) => {
      setActiveKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      onKeyRelease?.(key);
    },
    [onKeyRelease],
  );

  const isKeyDown = (id: string) =>
    activeKeys.has(id) || normalizedActive.has(id);

  useLayoutEffect(() => {
    if (focusOctave == null) return;
    const container = containerRef.current;
    const firstOctaveEl = octaveRefs.current[startingOctave];
    if (!container || !firstOctaveEl) return;

    const octaveWidth = firstOctaveEl.offsetWidth;
    const index = focusOctave - startingOctave;
    const left = Math.max(
      0,
      Math.min(
        index * octaveWidth,
        container.scrollWidth - container.clientWidth,
      ),
    );
    container.scrollLeft = left;
  }, [focusOctave, startingOctave]);

  const whiteNotes = ["C", "D", "E", "F", "G", "A", "B"];
  const blackNotes = ["C#", "D#", "F#", "G#", "A#"];
  const blackKeyOffsets = [1, 2, 4, 5, 6].map(
    (v) => (v / whiteNotes.length) * 100,
  );
  const blackWidthPct = 100 / whiteNotes.length / 2;
  const blackHeightPct = 60;

  const noteFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const keyEl = el.closest<HTMLElement>("[data-note]");
    return keyEl?.dataset.note ?? null;
  };

  const startDragAtPoint = (x: number, y: number, pointerId: number) => {
    draggingRef.current = true;
    const note = noteFromPoint(x, y);
    const container = containerRef.current;
    if (container) container.setPointerCapture(pointerId);
    if (note) {
      pressKey(note, true);
      currentNoteRef.current = note;
    }
  };

  const moveDragToPoint = (x: number, y: number) => {
    if (!draggingRef.current) return;
    const note = noteFromPoint(x, y);
    if (note !== currentNoteRef.current) {
      if (currentNoteRef.current) releaseKey(currentNoteRef.current);
      if (note) pressKey(note, true);
      currentNoteRef.current = note ?? null;
    }
  };

  const endDrag = (pointerId: number) => {
    if (currentNoteRef.current) {
      releaseKey(currentNoteRef.current);
      currentNoteRef.current = null;
    }
    draggingRef.current = false;
    const container = containerRef.current;
    if (container) container.releasePointerCapture(pointerId);
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-x-auto select-none scrollbar-hide touch-none"
      onPointerDown={(e) => {
        e.preventDefault();
        startDragAtPoint(e.clientX, e.clientY, e.pointerId);
      }}
      onPointerMove={(e) => moveDragToPoint(e.clientX, e.clientY)}
      onPointerUp={(e) => endDrag(e.pointerId)}
      onPointerCancel={(e) => endDrag(e.pointerId)}
      onPointerLeave={(e) => {
        if (draggingRef.current) endDrag(e.pointerId);
      }}
    >
      <div
        className="flex h-full"
        style={{ width: `${(octaves / visibleOctaves) * 100}%` }}
      >
        {Array.from({ length: octaves }).map((_, i) => {
          const octave = startingOctave + i;
          return (
            <div
              key={i}
              ref={(el) => {
                octaveRefs.current[octave] = el;
              }}
              className="relative flex flex-1 h-full"
            >
              {whiteNotes.map((n) => {
                const id = `${n}${octave}`;
                const label = n === "C" ? id : undefined;
                return (
                  <WhiteKey
                    key={id}
                    isDown={isKeyDown(id)}
                    noteLabel={label}
                    data-note={id}
                  />
                );
              })}
              <div className="pointer-events-none absolute inset-0 z-20">
                {blackNotes.map((n, j) => {
                  const id = `${n}${octave}`;
                  return (
                    <BlackKey
                      key={id}
                      isDown={isKeyDown(id)}
                      data-note={id}
                      style={{
                        left: `${blackKeyOffsets[j]}%`,
                        width: `${blackWidthPct}%`,
                        height: `${blackHeightPct}%`,
                        transform: "translateX(-50%)",
                        pointerEvents: "auto",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
