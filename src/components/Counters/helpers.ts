/**
 * Pure helpers: id generation, number/date formatting, and the reset-time math.
 *
 * The reset math is the trickiest part of the app, so it lives here in small,
 * individually testable functions rather than being tangled into the store.
 */

import { DateTime } from "luxon";
import { clamp } from "@/lib/utils";
import type { ResetConfig } from "./types";

export { clamp };

export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments.
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nowISO(): string {
  return new Date().toISOString();
}

const numberFormat = new Intl.NumberFormat();

export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/** Absolute, human timestamp e.g. "Jun 13, 2026, 2:32 PM". */
export function formatDateTime(iso: string): string {
  return DateTime.fromISO(iso).toLocaleString(DateTime.DATETIME_MED);
}

/** Compact relative time e.g. "3m ago", "in 5h". */
export function formatRelative(iso: string): string {
  return DateTime.fromISO(iso).toRelative({ style: "short" }) ?? "";
}

/** "2h 14m" style duration for reset countdowns. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  // Show minutes unless we're already showing days+hours (keeps it short).
  if (!days) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function parseTimeOfDay(timeOfDay: string): { hour: number; minute: number } {
  const [h, m] = timeOfDay.split(":").map((p) => parseInt(p, 10));
  return { hour: isNaN(h) ? 0 : h, minute: isNaN(m) ? 0 : m };
}

/**
 * The most recent reset boundary at or before `ref`. Used when seeding a new
 * counter's `lastResetAt` and when catching up missed resets on app open.
 */
export function previousResetBoundary(
  reset: ResetConfig,
  ref: DateTime = DateTime.now(),
): DateTime {
  const { hour, minute } = parseTimeOfDay(reset.timeOfDay);
  const atTime = ref.set({ hour, minute, second: 0, millisecond: 0 });

  if (reset.cadence === "weekly") {
    // Step back to the configured weekday at/just-before ref.
    const daysBack = (atTime.weekday - reset.weekday + 7) % 7;
    let cand = atTime.minus({ days: daysBack });
    if (cand > ref) cand = cand.minus({ weeks: 1 });
    return cand;
  }

  // daily
  let cand = atTime;
  if (cand > ref) cand = cand.minus({ days: 1 });
  return cand;
}

/** The next reset boundary strictly after `ref`. Drives the countdown. */
export function nextResetBoundary(
  reset: ResetConfig,
  ref: DateTime = DateTime.now(),
): DateTime {
  const period = reset.cadence === "weekly" ? { weeks: 1 } : { days: 1 };
  return previousResetBoundary(reset, ref).plus(period);
}

/**
 * Decide whether a counter is due for an automatic reset right now.
 * Returns the boundary that should be recorded as `lastResetAt`, or null if
 * nothing is due. A reset is due when a boundary has elapsed that is newer than
 * the last one we applied.
 */
export function dueReset(
  reset: ResetConfig,
  now: DateTime = DateTime.now(),
): DateTime | null {
  if (!reset.enabled) return null;
  const boundary = previousResetBoundary(reset, now);
  if (!reset.lastResetAt) return boundary;
  return DateTime.fromISO(reset.lastResetAt) < boundary ? boundary : null;
}

export const DEFAULT_RESET: ResetConfig = {
  enabled: false,
  cadence: "daily",
  timeOfDay: "00:00",
  weekday: 1,
  resetTo: 0,
};

export const DEFAULT_GOAL = { enabled: false, amount: 10 };

export const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** Goal progress as a 0–1 fraction, measured from the reset floor. */
export function goalProgress(
  value: number,
  goalAmount: number,
  resetTo: number,
): number {
  const span = goalAmount - resetTo;
  if (span === 0) return value >= goalAmount ? 1 : 0;
  return clamp((value - resetTo) / span, 0, 1);
}
