import React, { useLayoutEffect, useRef, useState } from "react";
import { clamp } from "@/lib/utils";
import { Key } from "./Key";

const WHITES = ["C", "D", "E", "F", "G", "A", "B"];
const BLACKS = [
  { note: "C#", left: 1 },
  { note: "D#", left: 2 },
  { note: "F#", left: 4 },
  { note: "G#", left: 5 },
  { note: "A#", left: 6 },
];

/** Below this a white key is too small to hit, so scroll instead. */
const MIN_WHITE_KEY_WIDTH = 10;
const MAX_WHITE_KEY_WIDTH = 40;

/** A piano keyboard that stretches to fill the width of its container. */
export function PianoKeyboard({
  octaves,
  startOctave,
  markedKeys,
  isSounding,
  onKeyToggle,
}: {
  octaves: number;
  startOctave: number;
  markedKeys: string[];
  isSounding: boolean;
  onKeyToggle: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAvailableWidth(el.clientWidth - 2);
    const observer = new ResizeObserver(([entry]) =>
      setAvailableWidth(entry.contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const whiteCount = octaves * 7;
  const whiteWidth = clamp(
    availableWidth / whiteCount,
    MIN_WHITE_KEY_WIDTH,
    MAX_WHITE_KEY_WIDTH,
  );
  const whiteHeight = Math.round(clamp(whiteWidth * 5, 72, 170));
  const blackWidth = whiteWidth * 0.62;
  const blackHeight = Math.round(whiteHeight * 0.62);
  const totalWidth = whiteCount * whiteWidth;

  const marked = new Set(markedKeys);
  const keys: React.ReactNode[] = [];
  for (let o = 0; o < octaves; o++) {
    const octave = startOctave + o;
    const offset = o * 7 * whiteWidth;
    WHITES.forEach((note, i) => {
      const id = `${note}${octave}`;
      keys.push(
        <Key
          key={id}
          note={note}
          octave={octave}
          type="white"
          width={whiteWidth}
          height={whiteHeight}
          left={offset + i * whiteWidth}
          isMarked={marked.has(id)}
          isSounding={isSounding}
          onToggle={() => onKeyToggle(id)}
        />,
      );
    });
    BLACKS.forEach(({ note, left }) => {
      const id = `${note}${octave}`;
      keys.push(
        <Key
          key={id}
          note={note}
          octave={octave}
          type="black"
          width={blackWidth}
          height={blackHeight}
          left={offset + left * whiteWidth - blackWidth / 2}
          isMarked={marked.has(id)}
          isSounding={isSounding}
          onToggle={() => onKeyToggle(id)}
        />,
      );
    });
  }

  return (
    <div ref={ref} className="w-full overflow-x-auto p-px">
      <div
        className="relative z-10 mx-auto overflow-hidden rounded-[4px] bg-white ring-1 ring-zinc-400 dark:ring-zinc-600"
        style={{ width: totalWidth, height: whiteHeight }}
      >
        {availableWidth > 0 && keys}
      </div>
    </div>
  );
}
