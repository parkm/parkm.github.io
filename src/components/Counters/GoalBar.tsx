/**
 * Goal progress display. Communicates the goal clearly in words *and* visually:
 * a labelled progress bar plus a "X to go" / "reached" status line. When the
 * counter resets, the goal is framed as a per-period target (e.g. "daily").
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, goalProgress } from "./helpers";
import type { Counter } from "./types";

function cadenceWord(counter: Counter): string | null {
  if (!counter.reset.enabled) return null;
  return counter.reset.cadence === "weekly" ? "weekly" : "daily";
}

export function GoalBar({
  counter,
  className,
}: {
  counter: Counter;
  className?: string;
}) {
  if (!counter.goal.enabled) return null;

  const { amount } = counter.goal;
  const floor = counter.reset.enabled ? counter.reset.resetTo : 0;
  const pct = goalProgress(counter.value, amount, floor);
  const reached = counter.value >= amount;
  const remaining = amount - counter.value;
  const period = cadenceWord(counter);

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground font-medium">
          {period
            ? `${period[0].toUpperCase()}${period.slice(1)} goal`
            : "Goal"}
        </span>
        <span className="tabular-nums">
          <span className={reached ? "text-emerald-500" : ""}>
            {formatNumber(counter.value)}
          </span>
          <span className="text-muted-foreground">
            {" "}
            / {formatNumber(amount)}
          </span>
        </span>
      </div>

      <div className="bg-muted relative h-2.5 w-full overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            reached ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${pct * 100}%` }}
        />
      </div>

      <p
        className={cn(
          "mt-1.5 flex items-center gap-1 text-xs",
          reached ? "text-emerald-500" : "text-muted-foreground",
        )}
      >
        {reached ? (
          <>
            <Check className="size-3.5" />
            Goal reached
            {period ? ` for ${period === "daily" ? "today" : "this week"}` : ""}
            !
          </>
        ) : (
          <>
            {formatNumber(remaining)} to go
            {period ? ` before the ${period} reset` : ""}
          </>
        )}
      </p>
    </div>
  );
}
