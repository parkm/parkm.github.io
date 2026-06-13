/**
 * App shell. Wires the store to the UI: a sticky top bar (title + stats menu),
 * the view switcher, the active counter/stack view, and the create/edit dialogs.
 *
 * Everything below this component is presentational; all state and persistence
 * lives in `useCountersStore`.
 */

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { useCountersStore } from "./store";
import { ViewSwitcher } from "./ViewSwitcher";
import { CounterView } from "./CounterView";
import { StackView } from "./StackView";
import { StatsMenu } from "./StatsMenu";
import { Modal } from "./Modal";
import { CounterForm } from "./CounterForm";
import { StackForm } from "./StackForm";
import type { Counter, Stack, ViewRef } from "./types";

type Dialog =
  | { type: "new-counter" }
  | { type: "edit-counter"; counter: Counter }
  | { type: "new-stack" }
  | { type: "edit-stack"; stack: Stack }
  | null;

export function Counters() {
  const store = useCountersStore();
  const [dialog, setDialog] = useState<Dialog>(null);

  // Resolve the view to render, falling back to the first counter when the
  // saved view is missing (e.g. right after a deletion).
  const resolvedView: ViewRef | null = useMemo(() => {
    const v = store.currentView;
    if (v?.type === "counter" && store.counters.some((c) => c.id === v.id))
      return v;
    if (v?.type === "stack" && store.stacks.some((s) => s.id === v.id))
      return v;
    if (store.counters[0]) return { type: "counter", id: store.counters[0].id };
    return null;
  }, [store.currentView, store.counters, store.stacks]);

  const activeCounter =
    resolvedView?.type === "counter"
      ? store.counters.find((c) => c.id === resolvedView.id)
      : undefined;
  const activeStack =
    resolvedView?.type === "stack"
      ? store.stacks.find((s) => s.id === resolvedView.id)
      : undefined;

  if (!store.ready) {
    return (
      <div className="text-muted-foreground flex min-h-dvh items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  const isEmpty = store.counters.length === 0;

  return (
    <div className="bg-background text-foreground min-h-dvh">
      {/* Sticky top bar */}
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-base font-semibold">Counters</h1>
          <StatsMenu store={store} />
        </div>
        {!isEmpty && (
          <div className="mx-auto max-w-2xl px-4 pb-3">
            <ViewSwitcher
              store={store}
              onNewCounter={() => setDialog({ type: "new-counter" })}
              onNewStack={() => setDialog({ type: "new-stack" })}
            />
          </div>
        )}
      </header>

      {/* Body */}
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24">
        {isEmpty ? (
          <EmptyState onCreate={() => setDialog({ type: "new-counter" })} />
        ) : activeCounter ? (
          <CounterView
            counter={activeCounter}
            store={store}
            onEdit={() =>
              setDialog({ type: "edit-counter", counter: activeCounter })
            }
          />
        ) : activeStack ? (
          <StackView
            stack={activeStack}
            store={store}
            onEdit={() => setDialog({ type: "edit-stack", stack: activeStack })}
          />
        ) : null}
      </main>

      {/* New counter */}
      <Modal
        open={dialog?.type === "new-counter"}
        onClose={() => setDialog(null)}
        title="New counter"
        description="Give it a name and choose how it behaves."
      >
        <CounterForm
          onCancel={() => setDialog(null)}
          onSubmit={(input) => {
            store.createCounter(input);
            setDialog(null);
          }}
        />
      </Modal>

      {/* Edit counter */}
      <Modal
        open={dialog?.type === "edit-counter"}
        onClose={() => setDialog(null)}
        title="Edit counter"
      >
        {dialog?.type === "edit-counter" && (
          <CounterForm
            initial={dialog.counter}
            onCancel={() => setDialog(null)}
            onDelete={() => {
              store.deleteCounter(dialog.counter.id);
              setDialog(null);
            }}
            onSubmit={(input) => {
              const { counter } = dialog;
              if (input.value !== counter.value) {
                store.setValue(counter.id, input.value);
              }
              store.updateCounterSettings(counter.id, {
                name: input.name,
                step: input.step,
                reset: input.reset,
                goal: input.goal,
              });
              setDialog(null);
            }}
          />
        )}
      </Modal>

      {/* New stack */}
      <Modal
        open={dialog?.type === "new-stack"}
        onClose={() => setDialog(null)}
        title="New stack"
        description="Show several counters together in one view."
      >
        <StackForm
          counters={store.counters}
          onCancel={() => setDialog(null)}
          onSubmit={(name, ids) => {
            store.createStack(name, ids);
            setDialog(null);
          }}
        />
      </Modal>

      {/* Edit stack */}
      <Modal
        open={dialog?.type === "edit-stack"}
        onClose={() => setDialog(null)}
        title="Edit stack"
      >
        {dialog?.type === "edit-stack" && (
          <StackForm
            counters={store.counters}
            initial={dialog.stack}
            onCancel={() => setDialog(null)}
            onDelete={() => {
              store.deleteStack(dialog.stack.id);
              setDialog(null);
            }}
            onSubmit={(name, ids) => {
              store.updateStack(dialog.stack.id, { name, counterIds: ids });
              setDialog(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <div className="bg-muted grid size-16 place-content-center rounded-2xl text-3xl">
        🔢
      </div>
      <div>
        <h2 className="text-lg font-semibold">No counters yet</h2>
        <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-sm">
          Track anything — water, reps, habits. Every change is timestamped and
          saved on your device.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="size-4" />
        Create your first counter
      </Button>
    </div>
  );
}
