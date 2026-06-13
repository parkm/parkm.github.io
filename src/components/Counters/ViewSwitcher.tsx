/**
 * Horizontal, scrollable strip of counters and stacks for switching the active
 * view, with a "+" menu to create either. Built for touch: chips are large and
 * the strip scrolls horizontally without wrapping.
 */

import { useEffect, useRef, useState } from "react";
import { Plus, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "./helpers";
import type { CountersStore } from "./store";
import type { ViewRef } from "./types";

function isActive(view: ViewRef | null, ref: ViewRef) {
  return view?.type === ref.type && view.id === ref.id;
}

export function ViewSwitcher({
  store,
  onNewCounter,
  onNewStack,
}: {
  store: CountersStore;
  onNewCounter: () => void;
  onNewStack: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const chipClass = (active: boolean) =>
    cn(
      "flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-background hover:bg-accent border-input",
    );

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {store.counters.map((c) => {
          const ref: ViewRef = { type: "counter", id: c.id };
          const active = isActive(store.currentView, ref);
          return (
            <button
              key={c.id}
              className={chipClass(active)}
              onClick={() => store.setCurrentView(ref)}
            >
              <span className="max-w-32 truncate">{c.name}</span>
              <span
                className={cn(
                  "tabular-nums",
                  active ? "opacity-80" : "text-muted-foreground",
                )}
              >
                {formatNumber(c.value)}
              </span>
            </button>
          );
        })}

        {store.stacks.map((s) => {
          const ref: ViewRef = { type: "stack", id: s.id };
          const active = isActive(store.currentView, ref);
          return (
            <button
              key={s.id}
              className={chipClass(active)}
              onClick={() => store.setCurrentView(ref)}
            >
              <Layers className="size-3.5" />
              <span className="max-w-32 truncate">{s.name}</span>
            </button>
          );
        })}
      </div>

      {/* Add menu */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          aria-label="Add"
          onClick={() => setMenuOpen((v) => !v)}
          className="bg-background hover:bg-accent border-input grid size-10 place-content-center rounded-full border transition-colors"
        >
          <Plus className="size-5" />
        </button>
        {menuOpen && (
          <div className="bg-popover absolute top-12 right-0 z-20 flex w-44 flex-col rounded-lg border p-1 shadow-md">
            <button
              className="hover:bg-accent flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm"
              onClick={() => {
                setMenuOpen(false);
                onNewCounter();
              }}
            >
              <Plus className="size-4" />
              New counter
            </button>
            <button
              className="hover:bg-accent flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm disabled:opacity-50"
              disabled={store.counters.length === 0}
              onClick={() => {
                setMenuOpen(false);
                onNewStack();
              }}
            >
              <Layers className="size-4" />
              New stack
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
