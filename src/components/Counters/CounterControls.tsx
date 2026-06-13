/**
 * The interaction cluster for a single counter: large +/- step buttons, and a
 * row of three actions — Subtract, Set, Add — that reveal an inline amount
 * field. Designed for thumbs: generous tap targets that stay usable when narrow.
 */

import { useState } from "react";
import { Minus, Plus, Check, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatNumber } from "./helpers";

type Mode = "subtract" | "set" | "add";

const MODE_LABEL: Record<Mode, string> = {
  subtract: "Subtract",
  set: "Set to",
  add: "Add",
};

interface Props {
  step: number;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onAdjust: (amount: number) => void;
  onSetValue: (value: number) => void;
  /** Tighter layout for stacked views. */
  compact?: boolean;
}

export function CounterControls({
  step,
  value,
  onIncrement,
  onDecrement,
  onAdjust,
  onSetValue,
  compact = false,
}: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [draft, setDraft] = useState("");

  function openMode(next: Mode) {
    // "Set to" prefills the current value; add/subtract start empty.
    setDraft(next === "set" ? String(value) : "");
    setMode(next);
  }

  function commit() {
    if (!mode) return;
    const n = Number(draft);
    if (!Number.isNaN(n) && draft.trim() !== "") {
      if (mode === "set") onSetValue(n);
      else if (mode === "add") onAdjust(Math.abs(n));
      else onAdjust(-Math.abs(n));
    }
    setMode(null);
  }

  return (
    <div className={cn("flex w-full flex-col", compact ? "gap-2" : "gap-3")}>
      {/* Primary step buttons */}
      <div className="flex items-stretch gap-3">
        <Button
          variant="outline"
          onClick={onDecrement}
          aria-label={`Subtract ${step}`}
          className={cn(
            "flex-1 flex-col gap-0.5 active:scale-95",
            compact ? "h-12" : "h-16",
          )}
        >
          <Minus className={compact ? "size-5" : "size-6"} />
          <span className="text-muted-foreground text-[10px] tabular-nums">
            −{formatNumber(step)}
          </span>
        </Button>
        <Button
          onClick={onIncrement}
          aria-label={`Add ${step}`}
          className={cn(
            "flex-1 flex-col gap-0.5 active:scale-95",
            compact ? "h-12" : "h-16",
          )}
        >
          <Plus className={compact ? "size-5" : "size-6"} />
          <span className="text-[10px] tabular-nums opacity-80">
            +{formatNumber(step)}
          </span>
        </Button>
      </div>

      {/* Amount actions, or the inline amount field once one is chosen */}
      {mode ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16 shrink-0 text-sm font-medium">
            {MODE_LABEL[mode]}
          </span>
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setMode(null);
            }}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full min-w-0 rounded-md border bg-transparent px-3 text-base tabular-nums shadow-xs outline-none focus-visible:ring-[3px]"
          />
          <Button
            size="icon"
            className="size-10 shrink-0"
            onClick={commit}
            aria-label="Apply"
          >
            <Check className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            onClick={() => setMode(null)}
            aria-label="Cancel"
          >
            <X className="size-5" />
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={() => openMode("subtract")}>
            Subtract
          </Button>
          <Button variant="secondary" onClick={() => openMode("set")}>
            Set
          </Button>
          <Button variant="secondary" onClick={() => openMode("add")}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
