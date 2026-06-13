/**
 * useCountersStore — the single source of truth for the app.
 *
 * Responsibilities:
 *  - Load counters / stacks / history from IndexedDB on mount.
 *  - Funnel every value change through one method (`applyChange`) so that the
 *    counter, its `updatedAt`, and a history entry are always written together.
 *  - Apply due automatic resets on load and on a periodic interval.
 *  - Persist the "current view" so the app reopens where you left off.
 *
 * State lives in React state (for rendering) mirrored into refs (so async
 * actions always read the latest data without stale closures).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import * as db from "./db";
import {
  DEFAULT_GOAL,
  DEFAULT_RESET,
  dueReset,
  nowISO,
  previousResetBoundary,
  uuid,
} from "./helpers";
import { buildExport, parseImport, serialize } from "./serialize";
import type {
  ChangeSource,
  ChangeType,
  Counter,
  HistoryEntry,
  Stack,
  ViewRef,
} from "./types";

const CURRENT_VIEW_KEY = "currentView";
/** How often we re-check for due automatic resets while the app is open. */
const RESET_CHECK_MS = 20_000;
/**
 * Consecutive step-button presses closer together than this are merged into a
 * single history entry, so rapid tapping reads as one change instead of dozens.
 */
const COALESCE_MS = 5_000;

export interface NewCounterInput {
  name: string;
  step: number;
  value: number;
  reset: Counter["reset"];
  goal: Counter["goal"];
}

export interface CountersStore {
  ready: boolean;
  counters: Counter[];
  stacks: Stack[];
  history: HistoryEntry[];
  currentView: ViewRef | null;
  persisted: boolean | null;

  // Counter lifecycle
  createCounter: (input: NewCounterInput) => Promise<Counter>;
  /** Update non-value settings (name, step, reset, goal). Does not log history. */
  updateCounterSettings: (
    id: string,
    patch: Partial<Omit<Counter, "id" | "value" | "createdAt">>,
  ) => Promise<void>;
  deleteCounter: (id: string) => Promise<void>;

  // Value changes (all logged)
  increment: (id: string) => Promise<void>;
  decrement: (id: string) => Promise<void>;
  adjust: (id: string, amount: number) => Promise<void>;
  setValue: (id: string, value: number) => Promise<void>;
  resetCounter: (id: string, source?: ChangeSource) => Promise<void>;

  /** Remove a single history entry. Does not change the counter's value. */
  deleteHistoryEntry: (id: string) => Promise<void>;
  /** Add or update the note on a history entry. Pass empty string to clear. */
  updateHistoryNote: (id: string, note: string) => Promise<void>;

  // Stacks
  createStack: (name: string, counterIds: string[]) => Promise<Stack>;
  updateStack: (
    id: string,
    patch: Partial<Pick<Stack, "name" | "counterIds">>,
  ) => Promise<void>;
  deleteStack: (id: string) => Promise<void>;

  // View
  setCurrentView: (view: ViewRef) => void;

  // Data
  exportText: () => string;
  importText: (text: string, mode: "merge" | "replace") => Promise<void>;
  enablePersistence: () => Promise<boolean | null>;
}

export function useCountersStore(): CountersStore {
  const [ready, setReady] = useState(false);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentView, setCurrentViewState] = useState<ViewRef | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  // Refs mirror state so async callbacks read fresh values.
  const countersRef = useRef(counters);
  const stacksRef = useRef(stacks);
  const historyRef = useRef(history);
  countersRef.current = counters;
  stacksRef.current = stacks;
  historyRef.current = history;

  // Tracks the in-progress run of coalesced step presses so we can keep folding
  // rapid taps into the same history entry. Reset by any non-step change.
  const lastStepRef = useRef<{
    counterId: string;
    entryId: string;
    firstFrom: number;
    at: number;
  } | null>(null);

  // Request persistent storage once, on the first user gesture (most browsers
  // only grant — or prompt — in response to interaction).
  const persistTriedRef = useRef(false);
  const tryPersist = useCallback(async () => {
    if (persistTriedRef.current) return;
    persistTriedRef.current = true;
    const result = await db.requestPersistentStorage();
    if (result !== null) setPersisted(result);
  }, []);

  // ---- Loading -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedCounters, loadedStacks, loadedHistory, savedView, persist] =
        await Promise.all([
          db.getAll<Counter>("counters"),
          db.getAll<Stack>("stacks"),
          db.getAll<HistoryEntry>("history"),
          db.getMeta<ViewRef>(CURRENT_VIEW_KEY),
          db.isStoragePersisted(),
        ]);
      if (cancelled) return;

      setCounters(loadedCounters);
      countersRef.current = loadedCounters;
      setStacks(loadedStacks);
      stacksRef.current = loadedStacks;
      setHistory(loadedHistory);
      setPersisted(persist);

      // Restore the saved view if its target still exists.
      const viewValid =
        savedView &&
        ((savedView.type === "counter" &&
          loadedCounters.some((c) => c.id === savedView.id)) ||
          (savedView.type === "stack" &&
            loadedStacks.some((s) => s.id === savedView.id)));
      if (viewValid) {
        setCurrentViewState(savedView!);
      } else if (loadedCounters.length > 0) {
        setCurrentViewState({ type: "counter", id: loadedCounters[0].id });
      }

      setReady(true);
      // Catch up any resets missed while the app was closed.
      void runDueResets();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Core mutation -----------------------------------------------------
  /**
   * The one place a counter's value changes. Writes the counter and a matching
   * history entry, then updates React state. No-op changes (other than create)
   * are skipped so the history stays meaningful.
   */
  const applyChange = useCallback(
    async (
      counter: Counter,
      opts: {
        to: number;
        type: ChangeType;
        source: ChangeSource;
        note?: string;
        /** Extra settings to persist alongside the value (e.g. lastResetAt). */
        patch?: Partial<Counter>;
      },
    ): Promise<void> => {
      // Any change that isn't a step press ends the current coalescing run.
      lastStepRef.current = null;

      const from = counter.value;
      const to = opts.to;
      if (to === from && opts.type !== "create" && !opts.patch) return;

      const at = nowISO();
      const updated: Counter = {
        ...counter,
        ...opts.patch,
        value: to,
        updatedAt: at,
      };
      const entry: HistoryEntry = {
        id: uuid(),
        counterId: counter.id,
        at,
        from,
        to,
        delta: to - from,
        type: opts.type,
        source: opts.source,
        note: opts.note,
      };

      await db.put("counters", updated);
      await db.put("history", entry);

      setCounters((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setHistory((prev) => [...prev, entry]);
    },
    [],
  );

  const getCounter = (id: string) =>
    countersRef.current.find((c) => c.id === id);

  /**
   * Step-button changes (only). Folds consecutive presses within COALESCE_MS
   * into a single, growing history entry; otherwise behaves like a normal
   * increment/decrement. Set/Add/Subtract/Reset go through `applyChange` and
   * are never coalesced.
   */
  const applyStep = useCallback(async (counter: Counter, to: number) => {
    const now = Date.now();
    const at = new Date(now).toISOString();
    const last = lastStepRef.current;
    const canMerge =
      last !== null &&
      last.counterId === counter.id &&
      now - last.at <= COALESCE_MS;

    const updatedCounter: Counter = { ...counter, value: to, updatedAt: at };
    await db.put("counters", updatedCounter);
    setCounters((prev) =>
      prev.map((c) => (c.id === counter.id ? updatedCounter : c)),
    );

    // `from` for a merged run is the value before the *first* press.
    const from = canMerge ? last!.firstFrom : counter.value;
    const delta = to - from;
    const entry: HistoryEntry = {
      id: canMerge ? last!.entryId : uuid(),
      counterId: counter.id,
      at,
      from,
      to,
      delta,
      type: delta >= 0 ? "increment" : "decrement",
      source: "user",
    };

    await db.put("history", entry);
    setHistory((prev) =>
      canMerge
        ? prev.map((h) => (h.id === entry.id ? entry : h))
        : [...prev, entry],
    );

    lastStepRef.current = {
      counterId: counter.id,
      entryId: entry.id,
      firstFrom: from,
      at: now,
    };
  }, []);

  // ---- Automatic resets --------------------------------------------------
  const runDueResets = useCallback(async () => {
    const now = DateTime.now();
    for (const counter of countersRef.current) {
      const boundary = dueReset(counter.reset, now);
      if (!boundary) continue;
      // Always record that we passed the boundary; only log a value change if
      // the value actually moves (avoids noisy "0 → 0" entries).
      const patch: Partial<Counter> = {
        reset: { ...counter.reset, lastResetAt: boundary.toISO()! },
      };
      await applyChange(counter, {
        to: counter.reset.resetTo,
        type: "reset",
        source: "auto",
        note: "Scheduled reset",
        patch,
      });
    }
  }, [applyChange]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => void runDueResets(), RESET_CHECK_MS);
    return () => window.clearInterval(id);
  }, [ready, runDueResets]);

  // ---- Counter lifecycle -------------------------------------------------
  const createCounter = useCallback(
    async (input: NewCounterInput): Promise<Counter> => {
      const at = nowISO();
      // Seed lastResetAt to the current boundary so the first auto-reset fires
      // at the *next* boundary, not immediately.
      const reset = input.reset.enabled
        ? {
            ...input.reset,
            lastResetAt: previousResetBoundary(input.reset).toISO()!,
          }
        : input.reset;

      const counter: Counter = {
        id: uuid(),
        name: input.name,
        value: input.value,
        step: input.step,
        createdAt: at,
        updatedAt: at,
        reset,
        goal: input.goal,
      };

      const createEntry: HistoryEntry = {
        id: uuid(),
        counterId: counter.id,
        at,
        from: 0,
        to: counter.value,
        delta: counter.value,
        type: "create",
        source: "user",
        note: "Counter created",
      };

      await db.put("counters", counter);
      await db.put("history", createEntry);
      void tryPersist();

      setCounters((prev) => [...prev, counter]);
      setHistory((prev) => [...prev, createEntry]);
      setCurrentViewState({ type: "counter", id: counter.id });
      return counter;
    },
    [tryPersist],
  );

  const updateCounterSettings = useCallback<
    CountersStore["updateCounterSettings"]
  >(async (id, patch) => {
    const counter = getCounter(id);
    if (!counter) return;
    const updated: Counter = { ...counter, ...patch, updatedAt: nowISO() };
    // If reset was just turned on without a recorded boundary, seed it to the
    // current one so the first auto-reset fires at the *next* boundary.
    if (updated.reset.enabled && !updated.reset.lastResetAt) {
      updated.reset = {
        ...updated.reset,
        lastResetAt: previousResetBoundary(updated.reset).toISO()!,
      };
    }
    await db.put("counters", updated);
    setCounters((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  const deleteCounter = useCallback(async (id: string) => {
    await db.del("counters", id);
    await db.deleteHistoryForCounter(id);
    if (lastStepRef.current?.counterId === id) lastStepRef.current = null;
    // Drop the counter from any stacks that referenced it.
    const affectedStacks = stacksRef.current.filter((s) =>
      s.counterIds.includes(id),
    );
    for (const stack of affectedStacks) {
      const updated = {
        ...stack,
        counterIds: stack.counterIds.filter((cid) => cid !== id),
        updatedAt: nowISO(),
      };
      await db.put("stacks", updated);
    }

    setCounters((prev) => prev.filter((c) => c.id !== id));
    setStacks((prev) =>
      prev.map((s) =>
        s.counterIds.includes(id)
          ? { ...s, counterIds: s.counterIds.filter((cid) => cid !== id) }
          : s,
      ),
    );
    setHistory((prev) => prev.filter((h) => h.counterId !== id));
    setCurrentViewState((view) =>
      view?.type === "counter" && view.id === id ? null : view,
    );
  }, []);

  // ---- Value changes -----------------------------------------------------
  const increment = useCallback(
    async (id: string) => {
      const c = getCounter(id);
      if (c) await applyStep(c, c.value + c.step);
    },
    [applyStep],
  );

  const decrement = useCallback(
    async (id: string) => {
      const c = getCounter(id);
      if (c) await applyStep(c, c.value - c.step);
    },
    [applyStep],
  );

  const adjust = useCallback(
    async (id: string, amount: number) => {
      const c = getCounter(id);
      if (!c) return;
      await applyChange(c, {
        to: c.value + amount,
        type: amount >= 0 ? "increment" : "decrement",
        source: "user",
        note: `Adjusted by ${amount >= 0 ? "+" : ""}${amount}`,
      });
    },
    [applyChange],
  );

  const setValue = useCallback(
    async (id: string, value: number) => {
      const c = getCounter(id);
      if (c) await applyChange(c, { to: value, type: "set", source: "user" });
    },
    [applyChange],
  );

  const resetCounter = useCallback(
    async (id: string, source: ChangeSource = "user") => {
      const c = getCounter(id);
      if (!c) return;
      await applyChange(c, {
        to: c.reset.resetTo,
        type: "reset",
        source,
        note: source === "user" ? "Manual reset" : "Scheduled reset",
        patch: {
          reset: { ...c.reset, lastResetAt: nowISO() },
        },
      });
    },
    [applyChange],
  );

  const deleteHistoryEntry = useCallback(async (id: string) => {
    await db.del("history", id);
    // If we deleted the entry an active step-run was folding into, end the run.
    if (lastStepRef.current?.entryId === id) lastStepRef.current = null;
    setHistory((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const updateHistoryNote = useCallback(async (id: string, note: string) => {
    const entry = historyRef.current.find((h) => h.id === id);
    if (!entry) return;
    const updated: HistoryEntry = {
      ...entry,
      note: note.trim() || undefined,
    };
    await db.put("history", updated);
    setHistory((prev) => prev.map((h) => (h.id === id ? updated : h)));
  }, []);

  // ---- Stacks ------------------------------------------------------------
  const createStack = useCallback(
    async (name: string, counterIds: string[]) => {
      const at = nowISO();
      const stack: Stack = {
        id: uuid(),
        name,
        counterIds,
        createdAt: at,
        updatedAt: at,
      };
      await db.put("stacks", stack);
      setStacks((prev) => [...prev, stack]);
      setCurrentViewState({ type: "stack", id: stack.id });
      return stack;
    },
    [],
  );

  const updateStack = useCallback<CountersStore["updateStack"]>(
    async (id, patch) => {
      const stack = stacksRef.current.find((s) => s.id === id);
      if (!stack) return;
      const updated = { ...stack, ...patch, updatedAt: nowISO() };
      await db.put("stacks", updated);
      setStacks((prev) => prev.map((s) => (s.id === id ? updated : s)));
    },
    [],
  );

  const deleteStack = useCallback(async (id: string) => {
    await db.del("stacks", id);
    setStacks((prev) => prev.filter((s) => s.id !== id));
    setCurrentViewState((view) =>
      view?.type === "stack" && view.id === id ? null : view,
    );
  }, []);

  // ---- View persistence --------------------------------------------------
  const setCurrentView = useCallback((view: ViewRef) => {
    setCurrentViewState(view);
    void db.setMeta(CURRENT_VIEW_KEY, view);
  }, []);

  useEffect(() => {
    if (ready && currentView) void db.setMeta(CURRENT_VIEW_KEY, currentView);
  }, [ready, currentView]);

  // ---- Data import / export ---------------------------------------------
  const exportText = useCallback(
    () =>
      serialize(buildExport(countersRef.current, stacksRef.current, history)),
    [history],
  );

  const importText = useCallback(
    async (text: string, mode: "merge" | "replace") => {
      const payload = parseImport(text);

      if (mode === "replace") {
        await db.clearStores(["counters", "stacks", "history"]);
        await db.bulkPut("counters", payload.counters);
        await db.bulkPut("stacks", payload.stacks);
        await db.bulkPut("history", payload.history);
        setCounters(payload.counters);
        setStacks(payload.stacks);
        setHistory(payload.history);
        setCurrentViewState(
          payload.counters[0]
            ? { type: "counter", id: payload.counters[0].id }
            : null,
        );
        return;
      }

      // merge: imported ids overwrite existing ones; everything else is kept.
      const mergeById = <T extends { id: string }>(
        existing: T[],
        incoming: T[],
      ) => {
        const map = new Map(existing.map((x) => [x.id, x]));
        for (const item of incoming) map.set(item.id, item);
        return [...map.values()];
      };
      const nextCounters = mergeById(countersRef.current, payload.counters);
      const nextStacks = mergeById(stacksRef.current, payload.stacks);
      const nextHistory = mergeById(history, payload.history);

      await db.bulkPut("counters", payload.counters);
      await db.bulkPut("stacks", payload.stacks);
      await db.bulkPut("history", payload.history);
      setCounters(nextCounters);
      setStacks(nextStacks);
      setHistory(nextHistory);
    },
    [history],
  );

  const enablePersistence = useCallback(async () => {
    const result = await db.requestPersistentStorage();
    if (result !== null) setPersisted(result);
    return result;
  }, []);

  return {
    ready,
    counters,
    stacks,
    history,
    currentView,
    persisted,
    createCounter,
    updateCounterSettings,
    deleteCounter,
    increment,
    decrement,
    adjust,
    setValue,
    resetCounter,
    deleteHistoryEntry,
    updateHistoryNote,
    createStack,
    updateStack,
    deleteStack,
    setCurrentView,
    exportText,
    importText,
    enablePersistence,
  };
}

export { DEFAULT_RESET, DEFAULT_GOAL };
