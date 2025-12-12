import { useCallback, Fragment } from "react";
import { cn } from "@/lib/utils";
import { FretboardInlay } from "./FretboardInlay";
import { FretboardButton } from "./FretboardButton";
import { guitarNote, type Note } from "./notes";

const markerFrets = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const doubleMarkerFrets = [12, 24];
const frets = 24;
const nutWidthPx = 10;

type FretboardProps = {
  onPress: (note: Note) => void;
  tuning?: string[];
  octaves?: number[];
  showNoteNames?: boolean;
  marked?: Set<Note>;
};

export const Fretboard = ({
  onPress,
  tuning = ["E", "A", "D", "G", "B", "E"],
  octaves = [2, 2, 3, 3, 3, 4],
  showNoteNames = false,
  marked = new Set(),
}: FretboardProps) => {
  const totalStrings = tuning.length;

  const getNote = useCallback(
    (stringNumber: number, fret: number): Note => {
      const index = totalStrings - stringNumber;
      return guitarNote(index, fret, tuning, octaves);
    },
    [tuning, octaves, totalStrings],
  );

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
                  {Array.from({ length: totalStrings }).map((_, rowIndex) => {
                    const stringNumber = rowIndex + 1;
                    const topPct = ((rowIndex + 0.5) / totalStrings) * 100;

                    const note = getNote(stringNumber, 0);
                    const noteName = note.slice(0, -1);

                    return (
                      <FretboardButton
                        key={`${stringNumber}:0`}
                        stringNumber={stringNumber}
                        fret={0}
                        noteName={noteName}
                        marked={marked.has(note)}
                        showNoteNames={showNoteNames}
                        position={{
                          top: `${topPct}%`,
                          left: `${nutWidthPx / 2}px`,
                        }}
                        onNut
                        onPress={() => onPress(note)}
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
                    gridTemplateRows: `repeat(${totalStrings}, minmax(0, 1fr))`,
                  }}
                  aria-hidden="true"
                >
                  {Array.from({ length: totalStrings }).map((_, rowIndex) =>
                    Array.from({ length: frets }).map((__, fretIndex) => (
                      <div
                        key={`${rowIndex}:${fretIndex}`}
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
                  {Array.from({ length: totalStrings }).map((_, rowIndex) => {
                    const stringNumber = rowIndex + 1;
                    const topPct = ((rowIndex + 0.5) / totalStrings) * 100;

                    return (
                      <Fragment key={stringNumber}>
                        {Array.from({ length: frets }).map((__, fretIndex) => {
                          const fretNumber = fretIndex + 1;
                          const leftPct = ((fretNumber - 0.5) / frets) * 100;

                          const note = getNote(stringNumber, fretNumber);
                          const noteName = note.slice(0, -1);

                          return (
                            <FretboardButton
                              key={`${stringNumber}:${fretNumber}`}
                              stringNumber={stringNumber}
                              fret={fretNumber}
                              noteName={noteName}
                              marked={marked.has(note)}
                              showNoteNames={showNoteNames}
                              position={{
                                top: `${topPct}%`,
                                left: `${leftPct}%`,
                              }}
                              onPress={() => onPress(note)}
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
