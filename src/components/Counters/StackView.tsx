/**
 * A stack shows several counters together in one scrollable view, with a
 * combined total at the top and each counter as a compact, fully interactive
 * card. History is merged across all members and labelled per counter.
 */

import { useMemo, useState } from "react";
import { Pencil, History, Layers } from "lucide-react";
import { Button } from "@/components/ui";
import { Card } from "@/components/ui/Card";
import { formatNumber } from "./helpers";
import { CounterControls } from "./CounterControls";
import { GoalBar } from "./GoalBar";
import { ResetInfo } from "./ResetInfo";
import { HistoryList } from "./HistoryList";
import type { CountersStore } from "./store";
import type { Stack } from "./types";

const RECENT_COUNT = 8;

export function StackView({
  stack,
  store,
  onEdit,
}: {
  stack: Stack;
  store: CountersStore;
  onEdit: () => void;
}) {
  const [showAllHistory, setShowAllHistory] = useState(false);

  const members = useMemo(
    () =>
      stack.counterIds
        .map((id) => store.counters.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [stack.counterIds, store.counters],
  );

  const total = members.reduce((sum, c) => sum + c.value, 0);

  const idSet = useMemo(() => new Set(stack.counterIds), [stack.counterIds]);
  const history = useMemo(
    () => store.history.filter((h) => idSet.has(h.counterId)),
    [store.history, idSet],
  );
  const visible = showAllHistory ? history : history.slice(-RECENT_COUNT);
  const names = useMemo(
    () => new Map(members.map((c) => [c.id, c.name])),
    [members],
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <Layers className="size-3.5" />
            Stack · {members.length} counters
          </div>
          <h1 className="truncate text-xl font-semibold">{stack.name}</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label="Edit stack"
        >
          <Pencil className="size-4" />
        </Button>
      </div>

      {/* Combined total */}
      <div className="bg-muted/50 flex flex-col items-center rounded-xl border py-4">
        <span className="text-muted-foreground text-xs font-medium">
          Combined total
        </span>
        <span className="text-4xl font-bold tabular-nums tracking-tight">
          {formatNumber(total)}
        </span>
      </div>

      {/* Member cards */}
      <div className="flex flex-col gap-3">
        {members.map((counter) => (
          <Card key={counter.id} className="gap-3 py-4">
            <div className="flex items-start justify-between gap-2 px-4">
              <div className="min-w-0">
                <h3 className="truncate font-medium">{counter.name}</h3>
                <ResetInfo counter={counter} className="mt-0.5" />
              </div>
              <span className="text-2xl font-bold tabular-nums">
                {formatNumber(counter.value)}
              </span>
            </div>
            <div className="px-4">
              <GoalBar counter={counter} className="mb-3" />
              <CounterControls
                compact
                step={counter.step}
                value={counter.value}
                onIncrement={() => store.increment(counter.id)}
                onDecrement={() => store.decrement(counter.id)}
                onAdjust={(amt) => store.adjust(counter.id, amt)}
                onSetValue={(v) => store.setValue(counter.id, v)}
              />
            </div>
          </Card>
        ))}
        {members.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            This stack has no counters. Edit it to add some.
          </p>
        )}
      </div>

      {/* Merged history */}
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
          counterNames={names}
          emptyHint="Changes across these counters will appear here."
          onDelete={store.deleteHistoryEntry}
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
