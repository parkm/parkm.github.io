import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Label, Separator, Slider } from "@/components/ui";
import { clamp, cn } from "@/lib/utils";
import type { Feedback } from "./GrandStaff";
import {
  cardFor,
  nameOf,
  sheetMusicDeck,
  ZONES,
  zoneRangeLabel,
  type Clef,
  type Flashcard,
  type SheetMusicSettings,
  type StaffNote,
} from "./sheetMusicDeck";

const deck = sheetMusicDeck;

interface Result {
  choice: string;
  correct: boolean;
}

// Full drawable span per clef: the staff plus four ledger lines either side.
const DEBUG_DV_RANGE: Record<Clef, [number, number]> = {
  treble: [22, 46],
  bass: [10, 34],
};

const ledgerInfo = (note: StaffNote) => {
  const [bottom, top] = note.clef === "treble" ? [30, 38] : [18, 26];
  if (note.dv > top + 1) {
    const n = Math.floor((note.dv - top) / 2);
    return `${n} ledger line${n > 1 ? "s" : ""} above`;
  }
  if (note.dv < bottom - 1) {
    const n = Math.floor((bottom - note.dv) / 2);
    return `${n} ledger line${n > 1 ? "s" : ""} below`;
  }
  return "in staff";
};

const DEBUG_PRESETS: { label: string; note: StaffNote }[] = [
  { label: "C4 · treble", note: { dv: 28, clef: "treble" } },
  { label: "C4 · bass", note: { dv: 28, clef: "bass" } },
  { label: "E4 · bass", note: { dv: 30, clef: "bass" } },
];

export function Flashcards() {
  const [settings, setSettings] = useState<SheetMusicSettings>(
    deck.defaultSettings,
  );
  const [card, setCard] = useState<Flashcard | null>(() =>
    deck.draw(deck.defaultSettings, null),
  );
  const [result, setResult] = useState<Result | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0, streak: 0 });
  const [debug, setDebug] = useState<{ open: boolean; note: StaffNote }>({
    open: false,
    note: { dv: 28, clef: "treble" },
  });

  const forcedCard = useMemo(
    () => (debug.open ? cardFor(debug.note) : null),
    [debug],
  );
  const activeCard = forcedCard ?? card;

  const feedback: Feedback = result
    ? result.correct
      ? "correct"
      : "wrong"
    : "idle";

  const updateSettings = (patch: Partial<SheetMusicSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setResult(null);
    setCard(deck.draw(next, null));
  };

  const setDebugNote = (note: StaffNote) => {
    setResult(null);
    setDebug((d) => ({ ...d, note }));
  };

  const answer = (choice: string) => {
    if (!activeCard || result) return;
    const correct = choice === activeCard.answer;
    setResult({ choice, correct });
    if (!debug.open) {
      setStats((s) => ({
        correct: s.correct + (correct ? 1 : 0),
        total: s.total + 1,
        streak: correct ? s.streak + 1 : 0,
      }));
    }
  };

  useEffect(() => {
    if (!result || !activeCard) return;
    const timer = setTimeout(
      () => {
        setResult(null);
        if (!forcedCard) setCard(deck.draw(settings, activeCard.id));
      },
      result.correct ? 600 : 1500,
    );
    return () => clearTimeout(timer);
  }, [result, activeCard, forcedCard, settings]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setResult(null);
        setDebug((d) => ({ ...d, open: !d.open }));
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const letter = event.key.toUpperCase();
      if (activeCard?.choices.includes(letter)) answer(letter);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const choiceClass = (choice: string) => {
    if (!result || !activeCard) return "";
    if (choice === activeCard.answer)
      return "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 dark:border-emerald-500";
    if (choice === result.choice)
      return "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400 dark:border-red-500";
    return "opacity-40";
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm sm:flex-row",
          debug.open ? "max-w-4xl" : "max-w-2xl",
        )}
      >
        {debug.open && (
          <aside className="flex w-full flex-col gap-4 border-b bg-muted/40 p-5 sm:w-56 sm:border-b-0 sm:border-r">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Debug
              </h2>
              <span className="text-xs text-muted-foreground">⌃⇧D</span>
            </div>
            <div className="flex gap-1.5">
              {(["treble", "bass"] as const).map((clef) => (
                <Button
                  key={clef}
                  size="sm"
                  variant={debug.note.clef === clef ? "secondary" : "outline"}
                  className="flex-1"
                  onClick={() =>
                    setDebugNote({
                      clef,
                      dv: clamp(
                        debug.note.dv,
                        DEBUG_DV_RANGE[clef][0],
                        DEBUG_DV_RANGE[clef][1],
                      ),
                    })
                  }
                >
                  {clef}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="debug-note" className="font-normal">
                  Note
                </Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {nameOf(debug.note.dv)}
                </span>
              </div>
              <Slider
                id="debug-note"
                min={DEBUG_DV_RANGE[debug.note.clef][0]}
                max={DEBUG_DV_RANGE[debug.note.clef][1]}
                step={1}
                value={[debug.note.dv]}
                onValueChange={([value]) =>
                  setDebugNote({ ...debug.note, dv: value })
                }
              />
            </div>
            <p className="text-sm font-medium">
              {nameOf(debug.note.dv)}
              <span className="ml-2 font-normal text-muted-foreground">
                {ledgerInfo(debug.note)}
              </span>
            </p>
            <Separator className="my-1" />
            <div className="flex flex-col gap-1.5">
              {DEBUG_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant="outline"
                  onClick={() => setDebugNote(preset.note)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <p className="mt-auto pt-2 text-xs text-muted-foreground">
              Quiz is paused; stats don’t change.
            </p>
          </aside>
        )}
        <main className="flex flex-1 flex-col items-center gap-1 p-5 sm:p-6">
          <div className="flex w-full items-baseline justify-between gap-4">
            <h1 className="text-sm font-semibold">Note recognition</h1>
            <div className="flex items-baseline gap-3 text-xs text-muted-foreground tabular-nums">
              <span>
                {stats.correct}/{stats.total}
                {stats.total > 0 &&
                  ` · ${Math.round((stats.correct / stats.total) * 100)}%`}
              </span>
              <span>streak {stats.streak}</span>
              <button
                onClick={() => setStats({ correct: 0, total: 0, streak: 0 })}
                className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                reset
              </button>
            </div>
          </div>
          {activeCard ? (
            <>
              {activeCard.renderPrompt(feedback)}
              <p
                className={cn(
                  "h-6 text-sm font-medium tabular-nums",
                  feedback === "correct" &&
                    "text-emerald-600 dark:text-emerald-400",
                  feedback === "wrong" && "text-red-600 dark:text-red-400",
                )}
              >
                {result ? activeCard.detail : " "}
              </p>
              <div className="flex gap-1.5">
                {activeCard.choices.map((choice) => (
                  <Button
                    key={choice}
                    variant="outline"
                    size="icon"
                    onClick={() => answer(choice)}
                    className={cn("font-semibold", choiceClass(choice))}
                  >
                    {choice}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="flex flex-1 items-center p-8 text-sm text-muted-foreground">
              Enable at least one range to start.
            </p>
          )}
        </main>
        <aside className="flex w-full flex-col gap-3 border-t bg-muted/40 p-5 sm:w-64 sm:border-l sm:border-t-0">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Practice range
          </h2>
          {ZONES.map((zone) => (
            <div key={zone.key} className="flex items-center gap-2">
              <Checkbox
                id={zone.key}
                checked={settings[zone.key]}
                onCheckedChange={(checked) =>
                  updateSettings({ [zone.key]: checked === true })
                }
              />
              <Label htmlFor={zone.key} className="font-normal">
                {zone.title}
              </Label>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {zoneRangeLabel(zone, settings.ledgerLines)}
              </span>
            </div>
          ))}
          <Separator className="my-1" />
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="ledger-lines" className="font-normal">
                Ledger lines
              </Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {settings.ledgerLines}
              </span>
            </div>
            <Slider
              id="ledger-lines"
              min={1}
              max={4}
              step={1}
              value={[settings.ledgerLines]}
              onValueChange={([value]) =>
                updateSettings({ ledgerLines: value })
              }
            />
          </div>
          <p className="mt-auto pt-2 text-xs text-muted-foreground">
            Answer with the A–G keys
          </p>
        </aside>
      </div>
    </div>
  );
}
