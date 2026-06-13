/**
 * Live countdown to a counter's next automatic reset. Ticks once a minute so
 * the "resets in 2h 14m" stays current without re-rendering the whole app.
 */

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, nextResetBoundary } from "./helpers";
import type { Counter } from "./types";

export function ResetInfo({
  counter,
  className,
}: {
  counter: Counter;
  className?: string;
}) {
  const [now, setNow] = useState(() => DateTime.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(DateTime.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!counter.reset.enabled) return null;

  const next = nextResetBoundary(counter.reset, now);
  const ms = next.toMillis() - now.toMillis();
  const when = next.toLocaleString(DateTime.TIME_SIMPLE);

  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1.5 text-xs",
        className,
      )}
      title={`Resets to ${counter.reset.resetTo} at ${next.toLocaleString(
        DateTime.DATETIME_MED,
      )}`}
    >
      <RotateCcw className="size-3.5" />
      Resets in {formatDuration(ms)}
      <span className="opacity-60">({when})</span>
    </span>
  );
}
