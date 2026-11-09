import { useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  buildChord,
  CHORD_GROUPS,
  detectChord,
  parseChordName,
  prettyKey,
  prettyNote,
  ROOTS,
  voiceChord,
  type ParsedChord,
} from "./notes";

type Range = { startOctave: number; octaves: number };

/**
 * Popover for picking a chord by name: type it, or pick a root and a quality.
 * Picks apply to the card immediately (and play) so you can audition chords;
 * all picks from one opening undo as a single step.
 */
export function ChordPicker({
  keys,
  range,
  onApply,
  children,
}: {
  keys: string[];
  range: Range;
  /** `undoGroup` is stable for one opening of the picker. */
  onApply: (keys: string[], undoGroup: string) => void;
  /** The trigger button. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState(0);
  const [quality, setQuality] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const session = useRef(0);

  const onOpenChange = (next: boolean) => {
    if (next) {
      session.current++;
      setQuery("");
      // Start from the card's current chord, if it is one we offer.
      const current = parseChordName(detectChord(keys) ?? "");
      setRoot(current?.rootChroma ?? 0);
      setQuality(
        current
          ? (CHORD_GROUPS.flatMap((g) => g.qualities).find(
              (q) =>
                buildChord(current.rootChroma, q.symbol).name === current.name,
            )?.symbol ?? null)
          : null,
      );
    }
    setOpen(next);
  };

  const apply = (chord: ParsedChord) => {
    const voiced = voiceChord(chord, range);
    if (voiced.length) onApply(voiced, String(session.current));
  };

  const pickRoot = (chroma: number) => {
    setRoot(chroma);
    if (quality !== null) apply(buildChord(chroma, quality));
  };
  const pickQuality = (symbol: string) => {
    setQuality(symbol);
    apply(buildChord(root, symbol));
  };

  const typed = query.trim() ? parseChordName(query) : null;
  const typedNotes = typed ? voiceChord(typed, range) : [];
  const selected = quality !== null ? buildChord(root, quality) : null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(23rem,calc(100vw-16px))] p-0"
        onOpenAutoFocus={(e) => {
          // Focus the search box on desktop; on touch, popping the on-screen
          // keyboard over the picker would hide it.
          if (window.matchMedia("(pointer: coarse)").matches)
            e.preventDefault();
        }}
      >
        {/* Search */}
        <div className="border-b p-2">
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring/40 dark:bg-input/30">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && typed) {
                  e.preventDefault();
                  apply(typed);
                  setOpen(false);
                }
              }}
              placeholder="Type a chord: Dm7, F♯maj9, B♭/D…"
              aria-label="Chord name"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          {/* Always rendered so typing doesn't resize the popover. */}
          <button
            type="button"
            disabled={!typed}
            onClick={() => {
              if (!typed) return;
              apply(typed);
              setOpen(false);
            }}
            className="mt-1.5 flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-accent disabled:pointer-events-none"
          >
            {!query.trim() ? (
              <span className="text-muted-foreground">
                …or pick a root and type below
              </span>
            ) : typed ? (
              <>
                <span className="font-semibold">{typed.name}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                  {typedNotes.map(prettyKey).join(" ")}
                </span>
                <kbd className="hidden rounded border px-1 text-[10px] text-muted-foreground sm:inline">
                  Enter
                </kbd>
              </>
            ) : (
              <span className="text-muted-foreground">
                No chord called “{query.trim()}”
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-col gap-3 p-3">
          {/* Root */}
          <section>
            <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
              Root
            </h3>
            <div
              className="grid grid-cols-12 gap-0.5"
              role="radiogroup"
              aria-label="Root"
            >
              {ROOTS.map((note, chroma) => (
                <button
                  key={note}
                  type="button"
                  role="radio"
                  aria-checked={root === chroma}
                  onClick={() => pickRoot(chroma)}
                  className={cn(
                    "h-8 rounded-md text-xs font-medium transition-colors",
                    root === chroma
                      ? "bg-primary text-primary-foreground"
                      : note.includes("#")
                        ? "bg-muted/60 text-foreground hover:bg-accent"
                        : "hover:bg-accent",
                  )}
                >
                  {prettyNote(note)}
                </button>
              ))}
            </div>
          </section>

          {/* Qualities */}
          {CHORD_GROUPS.map((group) => (
            <section key={group.name}>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
                {group.name}
              </h3>
              <div
                className="grid grid-cols-5 gap-0.5"
                role="radiogroup"
                aria-label={group.name}
              >
                {group.qualities.map((q) => (
                  <button
                    key={q.symbol}
                    type="button"
                    role="radio"
                    aria-checked={quality === q.symbol}
                    title={`${prettyNote(ROOTS[root])} ${q.name}`}
                    onClick={() => pickQuality(q.symbol)}
                    className={cn(
                      "h-8 truncate rounded-md px-1 text-xs transition-colors",
                      quality === q.symbol
                        ? "bg-primary font-medium text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Current pick: fixed height so the popover doesn't jump. */}
        <div className="flex h-10 items-center gap-2 border-t px-3 text-sm">
          {selected ? (
            <>
              <span className="font-semibold">{selected.name}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                {voiceChord(selected, range).map(prettyKey).join(" ")}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              Pick a root and a chord type
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
