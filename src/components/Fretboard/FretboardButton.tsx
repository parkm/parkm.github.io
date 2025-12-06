import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { StringFret } from "./Fretboard";

type FretboardButtonProps = {
  stringNumber: number;
  fret: number;
  noteName: string;
  marked: boolean;
  showNoteNames: boolean;
  position: {
    top: string;
    left: string;
  };
  onNut?: boolean;
  onPress?: (pos: {
    string: number;
    fret: number;
    stringFret: StringFret;
    noteName?: string;
  }) => void;
};

const baseBtnSize = "size-[clamp(22px,2.4vw,34px)]";

const markedClasses = cn(
  "opacity-100 bg-red-600 text-white shadow-sm",
  "hover:bg-red-600/90 active:bg-red-700",
  "grid place-items-center",
  "text-[10px] sm:text-[11px] font-semibold leading-none",
);

const nutShowNotesClasses = cn(
  "opacity-100 bg-background/80 text-foreground shadow-sm",
  "hover:bg-background/90 active:bg-background",
  "grid place-items-center",
  "text-[10px] sm:text-[11px] font-semibold leading-none",
);

const fretShowNotesClasses = cn(
  "opacity-100 bg-foreground/[0.12] text-foreground shadow-sm backdrop-blur-[2px]",
  "hover:bg-foreground/[0.18] active:bg-foreground/[0.22]",
  "grid place-items-center",
  "text-[10px] sm:text-[11px] font-semibold leading-none",
);

const nutHiddenClasses = cn(
  "bg-background/0 opacity-0 text-transparent",
  "hover:opacity-100 hover:bg-background/25 hover:text-foreground",
  "active:opacity-100 active:bg-background/35 active:text-foreground",
  "focus-visible:opacity-100 focus-visible:bg-background/25 focus-visible:text-foreground",
  "grid place-items-center",
  "text-[10px] sm:text-[11px] font-semibold leading-none",
);

const fretHiddenClasses = cn(
  "bg-foreground/[0.02] opacity-[0.10] text-transparent",
  "hover:opacity-100 hover:bg-foreground/[0.10] hover:text-foreground",
  "active:opacity-100 active:bg-foreground/[0.14] active:text-foreground",
  "focus-visible:opacity-100 focus-visible:bg-foreground/[0.10] focus-visible:text-foreground",
  "grid place-items-center",
  "text-[10px] sm:text-[11px] font-semibold leading-none",
);

export const FretboardButton = ({
  stringNumber,
  fret,
  noteName,
  marked,
  showNoteNames,
  position,
  onNut = false,
  onPress,
}: FretboardButtonProps) => {
  const stringFret = `${stringNumber}:${fret}` as StringFret;
  const buttonClasses = useMemo(() => {
    if (marked) return markedClasses;
    if (showNoteNames) {
      return onNut ? nutShowNotesClasses : fretShowNotesClasses;
    }
    return onNut ? nutHiddenClasses : fretHiddenClasses;
  }, [marked, showNoteNames, onNut]);

  return (
    <button
      type="button"
      aria-label={`String ${stringNumber}, ${fret === 0 ? "open" : `fret ${fret}`} (${noteName})`}
      onClick={() =>
        onPress?.({
          string: stringNumber,
          fret,
          stringFret,
          noteName,
        })
      }
      className={cn(
        "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2",
        onNut ? "z-20" : "z-10",
        baseBtnSize,
        "rounded-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        buttonClasses,
      )}
      style={position}
    >
      {showNoteNames || marked ? noteName : noteName}
    </button>
  );
};
