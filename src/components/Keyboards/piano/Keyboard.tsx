import React, { useState } from "react";
import { Key } from "./Key";

export function PianoKeyboard({
  octaves,
  startOctave,
}: {
  octaves: number;
  startOctave: number;
}) {
  const WHITE_KEY_WIDTH = 24;
  const WHITE_KEY_HEIGHT = WHITE_KEY_WIDTH * 6.5;
  const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.58;
  const BLACK_KEY_HEIGHT = WHITE_KEY_HEIGHT * 0.63;
  const totalWidth = octaves * 7 * WHITE_KEY_WIDTH + 16;

  const keyboardStyle = {
    height: `${WHITE_KEY_HEIGHT}px`,
    width: `${totalWidth}px`,
    position: "relative" as const,
    display: "flex" as const,
    border: "1px solid #777",
    borderRadius: "0 0 6px 6px",
    overflow: "visible" as const,
    backgroundColor: "#272727",
    padding: "4px 4px 8px 4px",
    boxShadow:
      "0 2px 8px rgba(0,0,0,0.3), inset 0 -1px 0 rgba(255,255,255,0.6)",
  };

  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());

  const onKeyDown = (note: string) =>
    setActiveKeys((prev) => new Set(prev).add(note));
  const onKeyUp = (note: string) =>
    setActiveKeys((prev) => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });

  const keys: React.ReactNode[] = [];

  for (let o = 0; o < octaves; o++) {
    const octave = startOctave + o;
    const offset = o * (WHITE_KEY_WIDTH * 7);

    const whites = ["C", "D", "E", "F", "G", "A", "B"];
    const blacks = [
      { note: "C#", left: 1 },
      { note: "D#", left: 2 },
      { note: "F#", left: 4 },
      { note: "G#", left: 5 },
      { note: "A#", left: 6 },
    ];

    whites.forEach((n, i) => {
      const id = `${n}${octave}`;
      keys.push(
        <Key
          key={id}
          note={n}
          octave={octave}
          type="white"
          width={WHITE_KEY_WIDTH}
          height={WHITE_KEY_HEIGHT}
          left={offset + i * WHITE_KEY_WIDTH}
          isActive={activeKeys.has(id)}
          onKeyDown={() => onKeyDown(id)}
          onKeyUp={() => onKeyUp(id)}
        />,
      );
    });

    blacks.forEach(({ note, left }) => {
      const id = `${note}${octave}`;
      keys.push(
        <Key
          key={id}
          note={note}
          octave={octave}
          type="black"
          width={BLACK_KEY_WIDTH}
          height={BLACK_KEY_HEIGHT}
          left={offset + left * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2}
          isActive={activeKeys.has(id)}
          onKeyDown={() => onKeyDown(id)}
          onKeyUp={() => onKeyUp(id)}
        />,
      );
    });
  }

  return (
    <div
      className="piano-container overflow-x-auto py-4"
      style={{ maxWidth: "100%" }}
    >
      <div style={keyboardStyle} className="piano-keyboard">
        {keys}
      </div>
    </div>
  );
}
