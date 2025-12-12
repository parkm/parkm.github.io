import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { PianoKey } from "./PianoKey";
import { type Note, midiToNote, guitarRange, isWhiteKey } from "./notes";

type PianoProps = {
  marked: Set<Note>;
  onPress: (note: Note) => void;
};

const WHITE_KEY_WIDTH = 28;
const WHITE_KEY_HEIGHT = 120;
const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.6;
const BLACK_KEY_HEIGHT = WHITE_KEY_HEIGHT * 0.62;

export const Piano = ({ marked, onPress }: PianoProps) => {
  const { keys, totalWhiteKeys, range } = useMemo(() => {
    const { min, max } = guitarRange();
    const keys = [];
    let whiteKeyIndex = 0;

    for (let midi = min; midi <= max; midi++) {
      const note = midiToNote(midi);
      const noteName = note.slice(0, -1);
      const white = isWhiteKey(note);

      if (white) {
        keys.push({
          note,
          white,
          left: whiteKeyIndex * WHITE_KEY_WIDTH,
          showLabel: noteName === "C",
        });
        whiteKeyIndex++;
      } else {
        keys.push({
          note,
          white,
          left: (whiteKeyIndex - 1) * WHITE_KEY_WIDTH + WHITE_KEY_WIDTH * 0.7,
          showLabel: false,
        });
      }
    }

    return {
      keys,
      totalWhiteKeys: whiteKeyIndex,
      range: `${midiToNote(min).slice(-1)} - ${midiToNote(max).slice(-1)}`,
    };
  }, []);

  return (
    <div
      className={cn(
        "w-full overflow-x-auto",
        "[&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/15",
      )}
    >
      <div
        style={{ minWidth: `${totalWhiteKeys * WHITE_KEY_WIDTH + 40}px` }}
        className="px-5 py-2"
      >
        <div className="relative rounded-lg border border-foreground/20 bg-card shadow-lg overflow-hidden">
          <div
            className="relative"
            style={{
              width: totalWhiteKeys * WHITE_KEY_WIDTH,
              height: WHITE_KEY_HEIGHT,
            }}
          >
            {keys.map((k) => (
              <PianoKey
                key={k.note}
                note={k.note}
                white={k.white}
                marked={marked.has(k.note)}
                showLabel={k.showLabel}
                left={k.left}
                width={k.white ? WHITE_KEY_WIDTH : BLACK_KEY_WIDTH}
                height={k.white ? WHITE_KEY_HEIGHT : BLACK_KEY_HEIGHT}
                onPress={onPress}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/5" />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-foreground/40 font-medium px-1">
          <span>Octaves: {range}</span>
          <span>24 frets</span>
        </div>
      </div>
    </div>
  );
};
