import { cn } from "@/lib/utils";
import type { Note } from "./notes";

type PianoKeyProps = {
  note: Note;
  white: boolean;
  marked: boolean;
  showLabel: boolean;
  left: number;
  width: number;
  height: number;
  onPress: (note: Note) => void;
};

export const PianoKey = ({
  note,
  white,
  marked,
  showLabel,
  left,
  width,
  height,
  onPress,
}: PianoKeyProps) => (
  <button
    type="button"
    onClick={() => onPress(note)}
    className={cn(
      "absolute transition-all duration-75 flex items-end justify-center select-none",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      white ? "z-[1]" : "z-[2]",
      white
        ? [
            "border border-foreground/15 rounded-b-md",
            marked
              ? "bg-red-600 text-white shadow-md hover:bg-red-600/90"
              : "bg-background shadow-sm hover:bg-foreground/[0.03]",
          ]
        : [
            "border border-foreground/40 rounded-b-sm",
            marked
              ? "bg-red-700 text-white shadow-lg hover:bg-red-700/90"
              : "bg-foreground/95 shadow-md hover:bg-foreground/90",
          ],
    )}
    style={{ left, width, height, top: white ? undefined : 0 }}
  >
    {white && showLabel && (
      <span
        className={cn(
          "font-semibold mb-1.5 text-[9px] sm:text-[10px]",
          marked ? "text-white" : "text-foreground/60",
        )}
      >
        {note}
      </span>
    )}
    {!white && (
      <span
        className={cn(
          "font-medium mb-1 text-[7px] sm:text-[8px]",
          marked ? "text-white/90" : "text-background/60",
        )}
      >
        {note.slice(0, -1)}
      </span>
    )}
  </button>
);
