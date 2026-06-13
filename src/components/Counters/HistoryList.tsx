/**
 * Renders a counter's (or stack's) change log. Each row makes three things
 * clear at a glance: what happened (type + delta), the resulting value, and
 * whether it was you or an automatic reset (source badge). Hover shows the full
 * ISO timestamp.
 */

import {
  ArrowDown,
  ArrowUp,
  Equal,
  RotateCcw,
  Sparkles,
  Bot,
  User,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber, formatRelative } from "./helpers";
import type { ChangeType, HistoryEntry } from "./types";

const TYPE_META: Record<
  ChangeType,
  { icon: typeof ArrowUp; label: string; className: string }
> = {
  create: { icon: Sparkles, label: "Created", className: "text-violet-500" },
  increment: {
    icon: ArrowUp,
    label: "Increased",
    className: "text-emerald-500",
  },
  decrement: {
    icon: ArrowDown,
    label: "Decreased",
    className: "text-rose-500",
  },
  set: { icon: Equal, label: "Set", className: "text-sky-500" },
  reset: { icon: RotateCcw, label: "Reset", className: "text-amber-500" },
};

export function HistoryList({
  entries,
  counterNames,
  emptyHint,
  onDelete,
}: {
  entries: HistoryEntry[];
  /** When viewing a stack, map counterId → name to label each row. */
  counterNames?: Map<string, string>;
  emptyHint?: string;
  /** When provided, each row gets a delete button. */
  onDelete?: (id: string) => void;
}) {
  const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at));

  if (sorted.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {emptyHint ?? "No changes yet."}
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {sorted.map((entry) => {
        const meta = TYPE_META[entry.type];
        const Icon = meta.icon;
        const signed =
          entry.delta > 0
            ? `+${formatNumber(entry.delta)}`
            : formatNumber(entry.delta);
        return (
          <li
            key={entry.id}
            className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
          >
            <span
              className={cn(
                "bg-muted grid size-8 shrink-0 place-content-center rounded-full",
                meta.className,
              )}
            >
              <Icon className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{meta.label}</span>
                {entry.type !== "create" && entry.delta !== 0 && (
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      entry.delta > 0 ? "text-emerald-500" : "text-rose-500",
                    )}
                  >
                    {signed}
                  </span>
                )}
                {counterNames && (
                  <span className="text-muted-foreground truncate text-xs">
                    {counterNames.get(entry.counterId) ?? "—"}
                  </span>
                )}
              </div>
              <time
                className="text-muted-foreground text-xs"
                dateTime={entry.at}
                title={formatDateTime(entry.at)}
              >
                {formatRelative(entry.at)}
              </time>
            </div>

            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-semibold tabular-nums">
                {formatNumber(entry.to)}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  entry.source === "auto"
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-muted text-muted-foreground",
                )}
                title={entry.source === "auto" ? "Automatic" : "By you"}
              >
                {entry.source === "auto" ? (
                  <Bot className="size-2.5" />
                ) : (
                  <User className="size-2.5" />
                )}
                {entry.source === "auto" ? "Auto" : "You"}
              </span>
            </div>

            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(entry.id)}
                aria-label="Delete entry"
                className="text-muted-foreground/40 hover:text-destructive -mr-1 grid size-8 shrink-0 place-content-center rounded-md transition-colors"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
