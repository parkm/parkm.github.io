import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CopyPlus,
  Crop,
  Dices,
  Eraser,
  Magnet,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";
import type { EditorView } from "../commands/types";
import { renameClip } from "../model/sessionOps";
import { GRID_DIVISIONS, ticksPerBar, type Tick } from "../model/time";
import type { Id } from "../model/types";
import { useCommandButton, useCommands } from "./commands";
import { useDaw, useDoc } from "./context";
import { EditableText } from "./EditableText";

/**
 * The bar above the clip editor: the clip's loop, whole-clip edits, the
 * grid, and (step grid) the selected drum row's tools. Buttons run commands,
 * so their labels, shortcuts and enabled state match the command menu.
 */

const LOOP_BARS = [1, 2, 4, 8];

function Divider() {
  return <div className="h-4 w-px bg-zinc-700" />;
}

/** A small button that runs a command. */
function CommandButton({ id, children }: { id: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-6 min-w-6 items-center justify-center gap-1 rounded px-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-35 disabled:hover:bg-transparent"
      {...useCommandButton(id)}
    >
      {children}
    </button>
  );
}

type ClipBarProps = {
  clipId: Id;
  grid: Tick;
  onGridChange: (grid: Tick) => void;
  view: EditorView;
  /** Present when the track can switch editors (drum tracks). */
  onViewChange?: (view: EditorView) => void;
  /** The selected drum pad, when its row tools apply. */
  padName?: string;
};

export function ClipBar({
  clipId,
  grid,
  onGridChange,
  view,
  onViewChange,
  padName,
}: ClipBarProps) {
  const { store } = useDaw();
  const commands = useCommands();
  const clip = useDoc((d) => d.clips[clipId]);
  const bar = useDoc((d) => ticksPerBar(d.timeSignature));
  const bars = clip.length / bar;

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 overflow-x-auto border-b border-zinc-950 px-3 text-xs *:shrink-0">
      <span
        className="flex max-w-40 rounded px-2 py-0.5 font-medium text-zinc-900"
        style={{ background: `oklch(0.8 0.15 ${clip.hue})` }}
      >
        <EditableText
          label="Clip name"
          value={clip.name}
          onCommit={(name) =>
            name && store.update((d) => renameClip(d, clipId, name))
          }
        />
      </span>

      {onViewChange && (
        <div
          className="flex rounded bg-zinc-950/60 p-0.5"
          role="group"
          aria-label="Editor"
        >
          {(["steps", "roll"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              className={`h-5 rounded-sm px-2 ${
                view === v ? "bg-zinc-600 text-zinc-50" : "text-zinc-400"
              }`}
              onClick={() => onViewChange(v)}
            >
              {v === "steps" ? "Steps" : "Notes"}
            </button>
          ))}
        </div>
      )}

      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Loop length"
      >
        <span className="mr-1 text-zinc-500">Loop</span>
        {LOOP_BARS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={bars === n}
            className={`h-6 rounded px-2 tabular-nums ${
              bars === n
                ? "bg-zinc-600 text-zinc-50"
                : "text-zinc-400 hover:bg-zinc-700"
            }`}
            onClick={() => commands.run(`clip.loop${n}`)}
          >
            {n} bar{n > 1 ? "s" : ""}
          </button>
        ))}
        <CommandButton id="clip.halveLoop">÷2</CommandButton>
        <CommandButton id="clip.doubleLoop">
          <CopyPlus size={13} /> ×2
        </CommandButton>
        <CommandButton id="clip.crop">
          <Crop size={13} /> Crop
        </CommandButton>
      </div>

      <Divider />
      <div className="flex items-center gap-1" role="group" aria-label="Clip">
        <CommandButton id="clip.rotateEarlier">
          <ChevronsLeft size={14} />
        </CommandButton>
        <CommandButton id="clip.rotateLater">
          <ChevronsRight size={14} />
        </CommandButton>
        {/* The piano roll has its own Quantize; the step grid needs one here. */}
        {view === "steps" && (
          <CommandButton id="clip.quantize">
            <Magnet size={13} /> Quantize
          </CommandButton>
        )}
      </div>
      <Divider />

      <label className="flex items-center gap-1.5 text-zinc-400">
        Grid
        <select
          className="h-6 rounded bg-zinc-900 px-1 text-zinc-200"
          value={grid}
          onChange={(e) => onGridChange(Number(e.currentTarget.value))}
        >
          {GRID_DIVISIONS.map((g) => (
            <option key={g.label} value={g.ticks}>
              {g.label}
            </option>
          ))}
        </select>
      </label>

      {padName && (
        <div
          className="ml-auto flex items-center gap-0.5"
          role="group"
          aria-label={`${padName} row`}
        >
          <span className="mr-1 text-zinc-500">{padName}</span>
          <CommandButton id="drums.shiftLeft">
            <ChevronLeft size={14} />
          </CommandButton>
          <CommandButton id="drums.shiftRight">
            <ChevronRight size={14} />
          </CommandButton>
          <CommandButton id="drums.humanize">
            <Waves size={14} />
          </CommandButton>
          <CommandButton id="drums.randomize">
            <Dices size={14} />
          </CommandButton>
          <CommandButton id="drums.clear">
            <Eraser size={14} />
          </CommandButton>
        </div>
      )}
    </div>
  );
}
