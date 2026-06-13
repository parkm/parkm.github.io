/**
 * Domain types for the Counters app.
 *
 * The data model is intentionally explicit so it can be persisted to IndexedDB,
 * round-tripped through import/export, and extended later (new reset cadences,
 * new change types) without breaking existing records.
 */

/** What kind of change produced a history entry. */
export type ChangeType = "create" | "increment" | "decrement" | "set" | "reset";

/** Who/what caused a change — lets the history distinguish manual vs automatic. */
export type ChangeSource = "user" | "auto";

/** A single, immutable record of a value change. Never edited after creation. */
export interface HistoryEntry {
  id: string;
  counterId: string;
  /** Full ISO-8601 timestamp, e.g. 2026-06-13T14:32:10.123Z */
  at: string;
  from: number;
  to: number;
  /** to - from, stored for convenience. */
  delta: number;
  type: ChangeType;
  source: ChangeSource;
  /** Optional human note, e.g. the reason text for a manual reset. */
  note?: string;
}

/** How often a counter automatically resets. */
export type ResetCadence = "daily" | "weekly";

export interface ResetConfig {
  enabled: boolean;
  cadence: ResetCadence;
  /** Local wall-clock time the reset fires, "HH:mm". */
  timeOfDay: string;
  /** Luxon weekday 1 (Mon) – 7 (Sun); only used for weekly cadence. */
  weekday: number;
  /** Value the counter returns to when it resets. */
  resetTo: number;
  /** ISO timestamp of the most recent reset boundary we've already applied. */
  lastResetAt?: string;
}

export interface GoalConfig {
  enabled: boolean;
  /** Target value. When reset is enabled this is a per-period (e.g. daily) goal. */
  amount: number;
}

export interface Counter {
  id: string;
  name: string;
  value: number;
  /** Amount the +/- buttons change the value by. */
  step: number;
  createdAt: string;
  updatedAt: string;
  reset: ResetConfig;
  goal: GoalConfig;
}

/** A saved combination of counters shown together in one view. */
export interface Stack {
  id: string;
  name: string;
  counterIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Which thing the app is currently showing. Persisted so it restores on reopen. */
export type ViewRef =
  | { type: "counter"; id: string }
  | { type: "stack"; id: string };

/** Shape of an export/import payload. */
export interface ExportPayload {
  app: "counters";
  version: number;
  exportedAt: string;
  counters: Counter[];
  stacks: Stack[];
  history: HistoryEntry[];
}
