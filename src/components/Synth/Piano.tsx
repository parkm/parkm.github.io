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
  const [scrollThumbLeft, setScrollThumbLeft] = useState(0);
  const [scrollThumbWidth, setScrollThumbWidth] = useState(100);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const octaveRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const activePointersRef = useRef<Map<number, string>>(new Map());
  const scrollbarDragRef = useRef<{
    startX: number;
    startScrollLeft: number;
  } | null>(null);

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
    (key: string) => {
      setActiveKeys((prev: Set<string>) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
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
    const checkTouch = () => {
      const hasTouch =
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
      setIsTouchDevice(hasTouch);
    };

    checkTouch();

    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const handleChange = () => checkTouch();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, []);

  const updateScrollbar = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const maxScroll = scrollWidth - clientWidth;

    if (maxScroll <= 0) {
      setScrollThumbWidth(100);
      setScrollThumbLeft(0);
      return;
    }

    const thumbWidth = (clientWidth / scrollWidth) * 100;
    const thumbLeft = (scrollLeft / maxScroll) * (100 - thumbWidth);

    setScrollThumbWidth(thumbWidth);
    setScrollThumbLeft(thumbLeft);
  }, []);

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

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateScrollbar();

    const handleScroll = () => updateScrollbar();
    const handleResize = () => updateScrollbar();

    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [updateScrollbar, octaves, visibleOctaves]);

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const note = noteFromPoint(e.clientX, e.clientY);

      if (note) {
        e.preventDefault();
        container.setPointerCapture(e.pointerId);
        activePointersRef.current.set(e.pointerId, note);
        pressKey(note);
      }
    },
    [pressKey],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const activeNote = activePointersRef.current.get(e.pointerId);

      if (activeNote !== undefined) {
        const note = noteFromPoint(e.clientX, e.clientY);
        if (note !== activeNote) {
          if (activeNote) releaseKey(activeNote);
          if (note) {
            pressKey(note);
            activePointersRef.current.set(e.pointerId, note);
          } else {
            activePointersRef.current.delete(e.pointerId);
          }
        }
      }
    },
    [pressKey, releaseKey],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const container = containerRef.current;
      const activeNote = activePointersRef.current.get(e.pointerId);

      if (activeNote) {
        releaseKey(activeNote);
        activePointersRef.current.delete(e.pointerId);
      }

      if (container) {
        try {
          container.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore if pointer capture was already released
        }
      }
    },
    [releaseKey],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      const activeNote = activePointersRef.current.get(e.pointerId);
      if (activeNote) {
        releaseKey(activeNote);
        activePointersRef.current.delete(e.pointerId);
      }
    },
    [releaseKey],
  );

  const handleScrollbarPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    const scrollbar = scrollbarRef.current;
    if (!container || !scrollbar) return;

    scrollbar.setPointerCapture(e.pointerId);
    scrollbarDragRef.current = {
      startX: e.clientX,
      startScrollLeft: container.scrollLeft,
    };
  }, []);

  const handleScrollbarPointerMove = useCallback((e: React.PointerEvent) => {
    if (!scrollbarDragRef.current) return;

    const container = containerRef.current;
    const scrollbar = scrollbarRef.current;
    if (!container || !scrollbar) return;

    const deltaX = e.clientX - scrollbarDragRef.current.startX;
    const scrollbarWidth = scrollbar.offsetWidth;
    const { scrollWidth, clientWidth } = container;
    const maxScroll = scrollWidth - clientWidth;

    const scrollDelta = (deltaX / scrollbarWidth) * scrollWidth;
    container.scrollLeft = Math.max(
      0,
      Math.min(
        maxScroll,
        scrollbarDragRef.current.startScrollLeft + scrollDelta,
      ),
    );
  }, []);

  const handleScrollbarPointerUp = useCallback((e: React.PointerEvent) => {
    const scrollbar = scrollbarRef.current;
    if (scrollbar) {
      try {
        scrollbar.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture was already released
      }
    }
    scrollbarDragRef.current = null;
  }, []);

  const handleScrollbarTrackClick = useCallback((e: React.MouseEvent) => {
    if (e.target !== scrollbarRef.current) return;

    const container = containerRef.current;
    const scrollbar = scrollbarRef.current;
    if (!container || !scrollbar) return;

    const rect = scrollbar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scrollbarWidth = scrollbar.offsetWidth;
    const { scrollWidth, clientWidth } = container;
    const maxScroll = scrollWidth - clientWidth;

    const targetScrollLeft =
      (clickX / scrollbarWidth) * scrollWidth - clientWidth / 2;
    container.scrollLeft = Math.max(0, Math.min(maxScroll, targetScrollLeft));
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto select-none scrollbar-hide"
        style={{ touchAction: "pan-x" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
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

      {isTouchDevice && scrollThumbWidth < 100 && (
        <div
          ref={scrollbarRef}
          className="relative h-8 bg-zinc-200 cursor-pointer touch-none"
          onClick={handleScrollbarTrackClick}
          onPointerDown={handleScrollbarPointerDown}
          onPointerMove={handleScrollbarPointerMove}
          onPointerUp={handleScrollbarPointerUp}
          onPointerCancel={handleScrollbarPointerUp}
        >
          <div
            className="absolute top-1 bottom-1 bg-zinc-500 rounded-full transition-colors hover:bg-zinc-600 active:bg-zinc-700 cursor-grab active:cursor-grabbing"
            style={{
              left: `${scrollThumbLeft}%`,
              width: `${scrollThumbWidth}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
