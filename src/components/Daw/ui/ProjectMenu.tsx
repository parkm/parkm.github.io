import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCommandButton } from "./commands";

/** The Project menu: project commands with a line about each. */

const ITEMS: [id: string, hint: string][] = [
  ["project.new", "Empty drum and synth tracks. Undo with ⌘Z."],
  ["project.demo", "The starter beat."],
  ["project.save", "Download this project as a .json file."],
  ["project.open", "Load a project saved from here."],
];

function MenuItem({
  id,
  hint,
  onDone,
}: {
  id: string;
  hint: string;
  onDone: () => void;
}) {
  const { onClick, title, ...button } = useCommandButton(id);
  return (
    <button
      type="button"
      role="menuitem"
      {...button}
      className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-zinc-700 disabled:opacity-40"
      onClick={() => {
        onDone();
        void onClick();
      }}
    >
      <span className="text-xs text-zinc-100">{title}</span>
      <span className="text-[11px] text-zinc-500">{hint}</span>
    </button>
  );
}

export function ProjectMenu() {
  // Where the menu opens, in viewport pixels; null while closed. It's fixed
  // rather than absolute so the scrolling toolbar doesn't clip it.
  const [open, setOpen] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const dismiss = () => setOpen(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  return (
    <div ref={menuRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!open}
        className="flex h-7 items-center gap-1 rounded px-2 text-xs text-zinc-300 hover:bg-zinc-700"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setOpen((o) => (o ? null : { left: box.left, top: box.bottom + 4 }));
        }}
      >
        Project <ChevronDown size={12} />
      </button>
      {open && (
        <div
          role="menu"
          className="fixed z-50 w-64 max-w-[calc(100vw-16px)] rounded border border-zinc-700 bg-zinc-800 p-1 shadow-xl"
          style={open}
        >
          {ITEMS.map(([id, hint]) => (
            <MenuItem
              key={id}
              id={id}
              hint={hint}
              onDone={() => setOpen(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
