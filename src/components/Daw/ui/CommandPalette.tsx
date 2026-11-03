import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatShortcut } from "../commands/keys";
import { COMMANDS } from "../commands/registry";
import {
  commandTitle,
  isAvailable,
  isEnabled,
  type Command,
  type CommandGroup,
} from "../commands/types";
import { useCommands } from "./commands";

/**
 * The command menu (⌘K): every action that applies right now, searchable.
 * Nothing needs a dedicated button to be reachable, which keeps small
 * screens complete.
 */

type Entry = {
  cmd: Command;
  title: string;
  group: CommandGroup;
  enabled: boolean;
  shortcut: string | null;
  haystack: string;
};

/**
 * Match score, or null for no match. Every query word must appear somewhere
 * (title, group or keywords). Matches at the start of a word count more, and
 * a title containing the whole query as typed ranks highest.
 */
function score(query: string, entry: Entry): number | null {
  const q = query.trim().toLowerCase();
  let total = entry.title.toLowerCase().includes(q) ? 10 : 0;
  for (const word of q.split(/\s+/)) {
    const at = entry.haystack.indexOf(word);
    if (at < 0) return null;
    total += at === 0 ? 3 : entry.haystack[at - 1] === " " ? 2 : 1;
  }
  return total;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const commands = useCommands();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Snapshot what applies when the menu opens.
  const entries = useMemo<Entry[]>(() => {
    const ctx = commands.context();
    return COMMANDS.filter((cmd) => isAvailable(cmd, ctx)).map((cmd) => {
      const title = commandTitle(cmd, ctx);
      return {
        cmd,
        title,
        group: cmd.group,
        enabled: isEnabled(cmd, ctx),
        shortcut: cmd.keys?.[0] ? formatShortcut(cmd.keys[0]) : null,
        haystack: [title, cmd.group, ...(cmd.keywords ?? [])]
          .join(" ")
          .toLowerCase(),
      };
    });
  }, [commands]);

  const results = useMemo(() => {
    if (!query.trim()) return entries;
    return entries
      .map((entry) => ({ entry, score: score(query, entry) }))
      .filter((r): r is { entry: Entry; score: number } => r.score !== null)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.entry.enabled) - Number(a.entry.enabled),
      )
      .map((r) => r.entry);
  }, [entries, query]);

  const runnable = results.filter((r) => r.enabled);
  const current = runnable[Math.min(active, runnable.length - 1)];

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-id="${current?.cmd.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const run = (entry: Entry) => {
    onClose();
    // After the menu has closed, so the command sees the workspace again.
    requestAnimationFrame(() => void commands.run(entry.cmd.id));
  };

  // Group headings only while browsing; search results are ranked instead.
  const grouped = !query.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Command menu"
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-2xl"
      >
        <label className="flex items-center gap-2 border-b border-zinc-700 px-3">
          <Search size={15} className="text-zinc-500" />
          <input
            autoFocus
            aria-label="Search commands"
            placeholder="Search commands…"
            className="h-11 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown")
                setActive((i) => Math.min(runnable.length - 1, i + 1));
              else if (e.key === "ArrowUp")
                setActive((i) => Math.max(0, i - 1));
              else if (e.key === "Enter" && current) run(current);
              else return;
              e.preventDefault();
            }}
          />
        </label>
        <div ref={listRef} role="listbox" className="overflow-y-auto p-1">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-zinc-500">
              No matching commands
            </div>
          )}
          {results.map((entry, i) => {
            const heading =
              grouped && (i === 0 || results[i - 1].group !== entry.group);
            const selected = entry === current;
            return (
              <div key={entry.cmd.id}>
                {heading && (
                  <div className="px-2 pt-2 pb-1 text-[10px] tracking-wide text-zinc-500 uppercase">
                    {entry.group}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  data-id={entry.cmd.id}
                  aria-selected={selected}
                  disabled={!entry.enabled}
                  className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm ${
                    selected
                      ? "bg-zinc-600 text-zinc-50"
                      : "text-zinc-200 hover:bg-zinc-700"
                  } disabled:text-zinc-600 disabled:hover:bg-transparent`}
                  onPointerMove={() =>
                    entry.enabled && setActive(runnable.indexOf(entry))
                  }
                  onClick={() => run(entry)}
                >
                  <span className="flex-1 truncate">{entry.title}</span>
                  {!grouped && (
                    <span className="text-[11px] text-zinc-500">
                      {entry.group}
                    </span>
                  )}
                  {entry.shortcut && (
                    <kbd className="rounded bg-zinc-900/70 px-1.5 py-0.5 font-sans text-[11px] text-zinc-400">
                      {entry.shortcut}
                    </kbd>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
