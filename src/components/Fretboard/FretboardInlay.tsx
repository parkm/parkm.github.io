import { cn } from "@/lib/utils";
export const FretboardInlay = ({
  frets,
  markerFrets,
  doubleMarkerFrets,
}: {
  frets: number;
  markerFrets: number[];
  doubleMarkerFrets: number[];
}) => {
  return (
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
        const isMarker = markerFrets.includes(fretNumber);
        if (!isMarker) return <div key={`inlay-col-${fretIdx}`} />;

        const isDouble = doubleMarkerFrets.includes(fretNumber);

        return (
          <div key={`inlay-col-${fretIdx}`} className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className={cn(
                  "relative flex items-center justify-center",
                  isDouble ? "h-full w-full" : "",
                )}
              >
                {isDouble ? (
                  <>
                    <span
                      className={cn(
                        "absolute left-1/2 top-[35%] -translate-x-1/2 -translate-y-1/2",
                        "h-3.5 w-3.5 rounded-full border border-foreground/20",
                        "bg-foreground/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
                        "sm:h-4 sm:w-4",
                      )}
                    />
                    <span
                      className={cn(
                        "absolute left-1/2 top-[65%] -translate-x-1/2 -translate-y-1/2",
                        "h-3.5 w-3.5 rounded-full border border-foreground/20",
                        "bg-foreground/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
                        "sm:h-4 sm:w-4",
                      )}
                    />
                  </>
                ) : (
                  <span
                    className={cn(
                      "h-3.5 w-3.5 rounded-full border border-foreground/20",
                      "bg-foreground/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
                      "sm:h-4 sm:w-4",
                    )}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
