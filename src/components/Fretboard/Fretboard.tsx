import { useMemo, useCallback, Fragment } from "react";
import { cn } from "@/lib/utils";
import { FretboardInlay } from "./FretboardInlay";
import { FretboardButton } from "./FretboardButton";

// Standard guitar position markers (1-indexed)
const markerFrets = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const doubleMarkerFrets = [12, 24];
const frets = 24;
const nutWidthPx = 10;

const NOTE_ORDER: string[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

function normalizeNoteName(n: string) {
  const s = n.trim().toUpperCase().replace(/\s+/g, "");
  const flatMap: Record<string, string> = {
    DB: "C#",
    EB: "D#",
    GB: "F#",
    AB: "G#",
    BB: "A#",
  };
  return flatMap[s] ?? s;
}

function noteAt(openNote: string, semitoneOffset: number) {
  const n = normalizeNoteName(openNote);
  const startIdx = NOTE_ORDER.indexOf(n);
  if (startIdx === -1) return openNote;
  const idx = (startIdx + semitoneOffset) % 12;
  return NOTE_ORDER[(idx + 12) % 12];
}

export type StringFret = `${number}:${number}`;

export const Fretboard = ({
  onFretPress,
  tuning = ["E", "A", "D", "G", "B", "E"],
  showNoteNames = false,
  markedNotes = [],
}: {
  onFretPress?: (pos: {
    string: number;
    fret: number;
    stringFret: StringFret;
    noteName?: string;
  }) => void;
  tuning?: string[];
  showNoteNames?: boolean;
  markedNotes?: StringFret[];
}) => {
  const strings = tuning.length;

  const markedSet = useMemo(
    () => new Set<StringFret>(markedNotes),
    [markedNotes],
  );
  const isMarked = useCallback(
    (stringFret: StringFret) => markedSet.has(stringFret),
    [markedSet],
  );

  // Render top row as highest string (common visual); tuning is expected low->high by default.
  const getOpenForStringRow = (stringIdx: number) =>
    tuning[strings - 1 - stringIdx] ?? "E";

  return (
    <div
      className={cn(
        "w-full overflow-x-auto",
        "[&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/15",
      )}
      aria-label="Guitar fretboard"
    >
      <div className="min-w-[720px]">
        <div className="bg-card">
          <div
            className={cn(
              "relative overflow-hidden rounded-xl border",
              "bg-[radial-gradient(120%_160%_at_20%_0%,hsl(var(--accent))_0%,hsl(var(--card))_40%,hsl(var(--card))_100%)]",
            )}
          >
            <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(90deg,transparent,rgba(0,0,0,0.06),transparent),linear-gradient(0deg,transparent,rgba(0,0,0,0.04),transparent)] [background-size:28px_100%,100%_18px]" />

            <div className="relative flex h-[180px] sm:h-[220px] md:h-[260px]">
              <div
                className="relative shrink-0"
                style={{ width: nutWidthPx }}
                aria-hidden="false"
              >
                <div className="pointer-events-none absolute inset-0 bg-foreground/80" />
                <div className="absolute inset-0 pointer-events-none">
                  {Array.from({ length: strings }).map((_, stringIdx) => {
                    const stringNumber = stringIdx + 1;
                    const topPct = ((stringIdx + 0.5) / strings) * 100;

                    const openNote = getOpenForStringRow(stringIdx);
                    const noteName = noteAt(openNote, 0);

                    const stringFret = `${stringNumber}:0` as const;
                    const marked = isMarked(stringFret);

                    return (
                      <FretboardButton
                        key={stringFret}
                        stringNumber={stringNumber}
                        fret={0}
                        noteName={noteName}
                        marked={marked}
                        showNoteNames={showNoteNames}
                        position={{
                          top: `${topPct}%`,
                          left: `${nutWidthPx / 2}px`,
                        }}
                        onNut
                        onPress={onFretPress}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="relative min-w-0 flex-1">
                <div
                  className="grid h-full"
                  style={{
                    gridTemplateColumns: `repeat(${frets}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${strings}, minmax(0, 1fr))`,
                  }}
                  aria-hidden="true"
                >
                  {Array.from({ length: strings }).map((_, stringIdx) =>
                    Array.from({ length: frets }).map((__, fretIdx) => (
                      <div
                        key={`${stringIdx}:${fretIdx}`}
                        className={cn(
                          "relative",
                          "before:absolute before:left-0 before:top-1/2 before:w-full before:-translate-y-1/2",
                          "before:h-0.5 before:bg-foreground/32",
                        )}
                      />
                    )),
                  )}
                </div>
                <div className="absolute inset-0 pointer-events-none">
                  {Array.from({ length: strings }).map((_, stringIdx) => {
                    const stringNumber = stringIdx + 1;
                    const topPct = ((stringIdx + 0.5) / strings) * 100;
                    const openNote = getOpenForStringRow(stringIdx);

                    return (
                      <Fragment key={stringNumber}>
                        {Array.from({ length: frets }).map((__, fretIdx) => {
                          const fretNumber = fretIdx + 1;
                          const leftPct = ((fretNumber - 0.5) / frets) * 100;

                          const noteName = noteAt(openNote, fretNumber);

                          const stringFret =
                            `${stringNumber}:${fretNumber}` as const;
                          const marked = isMarked(stringFret);

                          return (
                            <FretboardButton
                              key={stringFret}
                              stringNumber={stringNumber}
                              fret={fretNumber}
                              noteName={noteName}
                              marked={marked}
                              showNoteNames={showNoteNames}
                              position={{
                                top: `${topPct}%`,
                                left: `${leftPct}%`,
                              }}
                              onPress={onFretPress}
                            />
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </div>
                <div
                  className="pointer-events-none absolute inset-0 grid h-full"
                  style={{
                    gridTemplateColumns: `repeat(${frets}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(1, minmax(0, 1fr))`,
                  }}
                  aria-hidden="true"
                >
                  {Array.from({ length: frets }).map((_, fretIdx) => {
                    const fretNumber = fretIdx + 1;
                    return (
                      <div key={fretNumber} className="relative">
                        <div
                          className={cn(
                            "absolute right-0 top-0 h-full w-px bg-foreground/25",
                            fretNumber === frets && "w-[2px] bg-foreground/35",
                          )}
                        />
                      </div>
                    );
                  })}
                </div>
                <FretboardInlay
                  frets={frets}
                  markerFrets={markerFrets}
                  doubleMarkerFrets={doubleMarkerFrets}
                />
              </div>
            </div>

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10 dark:from-white/5 dark:to-black/20" />
          </div>
        </div>
      </div>
    </div>
  );
};
