import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PianoCanvasProps = {
  activeKey: string | null;
  onKeyPress: (note: string, octave: number) => void;
  onKeyRelease: () => void;
};

const WHITE_KEY_WIDTH = 40;
const WHITE_KEY_HEIGHT = 160;
const BLACK_KEY_WIDTH = 26;
const BLACK_KEY_HEIGHT = 100;

// Full 88-key range: A0 → C8
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function PianoCanvas({
  activeKey,
  onKeyPress,
  onKeyRelease,
}: PianoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const activePointers = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const lastPanCenter = useRef<number | null>(null);
  const hasUserPanned = useRef(false);

  // --- Build full keyboard ---
  const keys = useMemo(() => {
    const result: { note: string; octave: number; isBlack: boolean }[] = [];
    let octave = 0;

    for (let midi = 21; midi <= 108; midi++) {
      const note = NOTES[midi % 12];
      if (note === "C") octave++;
      result.push({
        note,
        octave,
        isBlack: note.includes("#"),
      });
    }
    return result;
  }, []);

  const whiteKeys = useMemo(() => keys.filter((k) => !k.isBlack), [keys]);

  const blackKeys = useMemo(() => {
    const blacks: { note: string; octave: number; whiteIndex: number }[] = [];
    let whiteIndex = 0;

    keys.forEach((k) => {
      if (!k.isBlack) {
        whiteIndex++;
      } else {
        blacks.push({
          note: k.note,
          octave: k.octave,
          whiteIndex: whiteIndex - 1,
        });
      }
    });

    return blacks;
  }, [keys]);

  const totalWidth = whiteKeys.length * WHITE_KEY_WIDTH;
  const maxScroll = Math.max(0, totalWidth - viewportWidth);

  // --- Center camera on Middle C (C4) ---
  const centerOnMiddleC = useCallback(
    (width: number) => {
      const middleCIndex = whiteKeys.findIndex(
        (k) => k.note === "C" && k.octave === 4,
      );
      if (middleCIndex === -1) return;

      const middleCX = middleCIndex * WHITE_KEY_WIDTH + WHITE_KEY_WIDTH / 2;
      const targetScroll = middleCX - width / 2;

      setScrollX(Math.min(maxScroll, Math.max(0, targetScroll)));
    },
    [whiteKeys, maxScroll],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setViewportWidth(width);

      setScrollX((s) => Math.min(Math.max(0, s), totalWidth - width));

      if (!hasUserPanned.current) {
        centerOnMiddleC(width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [centerOnMiddleC, totalWidth]);

  const drawPiano = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewportWidth === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // White keys + labels
    whiteKeys.forEach((k, i) => {
      const x = i * WHITE_KEY_WIDTH - scrollX;
      if (x + WHITE_KEY_WIDTH < 0 || x > viewportWidth) return;

      const id = `${k.note}${k.octave}`;
      const active = activeKey === id;

      ctx.fillStyle = active ? "#e5e7eb" : "#ffffff";
      ctx.fillRect(x, 0, WHITE_KEY_WIDTH, WHITE_KEY_HEIGHT);
      ctx.strokeStyle = "#374151";
      ctx.strokeRect(x, 0, WHITE_KEY_WIDTH, WHITE_KEY_HEIGHT);

      ctx.fillStyle = "#6b7280";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(id, x + WHITE_KEY_WIDTH / 2, WHITE_KEY_HEIGHT - 8);
    });

    // Black keys
    blackKeys.forEach(({ note, octave, whiteIndex }) => {
      const x =
        whiteIndex * WHITE_KEY_WIDTH +
        WHITE_KEY_WIDTH -
        BLACK_KEY_WIDTH / 2 -
        scrollX;

      if (x + BLACK_KEY_WIDTH < 0 || x > viewportWidth) return;

      const id = `${note}${octave}`;
      const active = activeKey === id;

      ctx.fillStyle = active ? "#4b5563" : "#000";
      ctx.fillRect(x, 0, BLACK_KEY_WIDTH, BLACK_KEY_HEIGHT);
    });
  }, [activeKey, scrollX, viewportWidth, whiteKeys, blackKeys]);

  useEffect(() => {
    drawPiano();
  }, [drawPiano]);

  // --- Hit testing ---
  const getNoteFromPosition = useCallback(
    (x: number, y: number) => {
      const adjustedX = x + scrollX;

      if (y < BLACK_KEY_HEIGHT) {
        for (const { note, octave, whiteIndex } of blackKeys) {
          const keyX =
            whiteIndex * WHITE_KEY_WIDTH +
            WHITE_KEY_WIDTH -
            BLACK_KEY_WIDTH / 2;
          if (adjustedX >= keyX && adjustedX < keyX + BLACK_KEY_WIDTH) {
            return { note, octave };
          }
        }
      }

      const index = Math.floor(adjustedX / WHITE_KEY_WIDTH);
      const key = whiteKeys[index];
      return key ? { note: key.note, octave: key.octave } : null;
    },
    [scrollX, whiteKeys, blackKeys],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.current.size === 1) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const note = getNoteFromPosition(
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
        if (note) onKeyPress(note.note, note.octave);
      }

      if (activePointers.current.size === 2) {
        hasUserPanned.current = true;
        const pts = [...activePointers.current.values()];
        lastPanCenter.current = (pts[0].x + pts[1].x) / 2;
      }
    },
    [getNoteFromPosition, onKeyPress],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!activePointers.current.has(e.pointerId)) return;

      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.current.size >= 2 && lastPanCenter.current !== null) {
        const pts = [...activePointers.current.values()];
        const center = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const delta = center - lastPanCenter.current;
        lastPanCenter.current = center;

        setScrollX((s) => Math.min(maxScroll, Math.max(0, s - delta)));
      }
    },
    [maxScroll],
  );

  const handlePointerUp = useCallback(() => {
    activePointers.current.clear();
    lastPanCenter.current = null;
    onKeyRelease();
  }, [onKeyRelease]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;

      e.preventDefault();
      hasUserPanned.current = true;

      setScrollX((s) => Math.min(maxScroll, Math.max(0, s + delta)));
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [maxScroll]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden overscroll-x-contain overscroll-y-contain"
    >
      <canvas
        ref={canvasRef}
        width={viewportWidth}
        height={WHITE_KEY_HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full rounded-lg bg-neutral-200 touch-none"
      />
    </div>
  );
}
