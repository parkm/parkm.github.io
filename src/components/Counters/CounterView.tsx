/**
 * Full-screen view of a single counter: the headline value, goal progress,
 * reset countdown, the control cluster, and a collapsible history log.
 */

import { useMemo, useState } from "react";
import { Pencil, RotateCcw, History } from "lucide-react";
import { Button } from "@/components/ui";
import { formatNumber } from "./helpers";
import { CounterControls } from "./CounterControls";
import { GoalBar } from "./GoalBar";
import { ResetInfo } from "./ResetInfo";
import { HistoryList } from "./HistoryList";
import type { CountersStore } from "./store";
import type { Counter } from "./types";

const RECENT_COUNT = 6;

export function CounterView({
  counter,
  store,
  onEdit,
}: {
  counter: Counter;
  store: CountersStore;
  onEdit: () => void;
}) {
  const [showAllHistory, setShowAllHistory] = useState(false);

  const history = useMemo(
    () => store.history.filter((h) => h.counterId === counter.id),
    [store.history, counter.id],
  );
  const sorted = useMemo(
    () => [...history].sort((a, b) => a.at.localeCompare(b.at)),
    [history],
  );
  const visible = showAllHistory ? history : sorted.slice(-RECENT_COUNT);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{counter.name}</h1>
          <ResetInfo counter={counter} className="mt-0.5" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label="Edit counter"
        >
          <Pencil className="size-4" />
        </Button>
      </div>

      {/* Headline value */}
      <div className="flex flex-col items-center py-2">
        <span className="text-6xl font-bold tabular-nums tracking-tight sm:text-7xl">
          {formatNumber(counter.value)}
        </span>
      </div>

      {/* Goal */}
      <GoalBar counter={counter} />

      {/* Controls */}
      <CounterControls
        step={counter.step}
        value={counter.value}
        onIncrement={() => store.increment(counter.id)}
        onDecrement={() => store.decrement(counter.id)}
        onAdjust={(amt) => store.adjust(counter.id, amt)}
        onSetValue={(v) => store.setValue(counter.id, v)}
      />

      {/* Manual reset */}
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            if (counter.value !== counter.reset.resetTo) {
              store.resetCounter(counter.id, "user");
            }
          }}
        >
          <RotateCcw className="size-4" />
          Reset to {formatNumber(counter.reset.resetTo)}
        </Button>
      </div>

      {/* History */}
      <section className="border-t pt-4">
        <div className="mb-1 flex items-center gap-2">
          <History className="text-muted-foreground size-4" />
          <h2 className="text-sm font-medium">History</h2>
          <span className="text-muted-foreground text-xs">
            ({history.length})
          </span>
        </div>
        <HistoryList
          entries={visible}
          emptyHint="Changes will appear here."
          onDelete={store.deleteHistoryEntry}
          onUpdateNote={store.updateHistoryNote}
        />
        {history.length > RECENT_COUNT && (
          <Button
            variant="link"
            size="sm"
            className="mt-1 px-0"
            onClick={() => setShowAllHistory((v) => !v)}
          >
            {showAllHistory
              ? "Show less"
              : `Show all ${history.length} changes`}
          </Button>
        )}
      </section>
    </div>
  );
}
