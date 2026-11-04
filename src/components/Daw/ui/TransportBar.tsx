import {
  Circle,
  Command as CommandIcon,
  Download,
  Metronome,
  Play,
  Redo2,
  Scan,
  Square,
  Undo2,
} from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { PPQ, swingPercent } from "../model/time";
import { useCommandButton } from "./commands";
import { useDaw, useDoc, useSessionState } from "./context";
import { DragNumber } from "./DragNumber";
import { ProjectMenu } from "./ProjectMenu";

function ToolButton({
  active,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex h-7 min-w-7 items-center justify-center gap-1.5 rounded px-1.5 text-xs disabled:opacity-35 ${
        active
          ? "bg-amber-400 text-zinc-900"
          : "text-zinc-300 hover:bg-zinc-700"
      } ${className}`}
      {...props}
    />
  );
}

/** A transport button that runs a command (label, shortcut and state from its definition). */
function CommandToolButton({
  id,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { id: string; active?: boolean }) {
  return <ToolButton {...useCommandButton(id)} {...props} />;
}

const LAUNCH_QUANTIZE: [string, number][] = [
  ["None", 0],
  ["1/16", PPQ / 4],
  ["1/4", PPQ],
  ["1/2", PPQ * 2],
  ["1 Bar", PPQ * 4],
  ["2 Bars", PPQ * 8],
  ["4 Bars", PPQ * 16],
];

export function TransportBar() {
  const { store, session } = useDaw();
  const playing = useSessionState((s) => s.playing);
  const recording = useSessionState((s) => s.recording);
  const metronome = useSessionState((s) => s.metronome);
  const quantize = useDoc((d) => d.launchQuantize);
  const bpm = useDoc((d) => d.bpm);
  const swing = useDoc((d) => d.swing);
  const [num, den] = useDoc((d) => d.timeSignature);

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-950 bg-zinc-800 px-3 *:shrink-0">
      <ProjectMenu />
      <div className="mx-2 h-5 w-px bg-zinc-700" />
      <ToolButton
        title="Play (Space)"
        aria-label="Play (Space)"
        active={playing}
        onClick={() => session.play()}
      >
        <Play size={14} fill="currentColor" />
      </ToolButton>
      <ToolButton
        title="Stop (Space)"
        aria-label="Stop (Space)"
        onClick={() => session.stop()}
      >
        <Square size={12} fill="currentColor" />
      </ToolButton>
      <CommandToolButton id="transport.record" active={recording}>
        <Circle
          size={12}
          fill="currentColor"
          className={recording ? "text-red-600" : "text-red-400"}
        />
      </CommandToolButton>
      <CommandToolButton
        id="transport.capture"
        className="enabled:text-amber-300"
      >
        <Scan size={14} />
      </CommandToolButton>
      <CommandToolButton id="transport.metronome" active={metronome}>
        <Metronome size={14} />
      </CommandToolButton>

      <div className="mx-2 h-5 w-px bg-zinc-700" />

      <DragNumber
        label="Tempo"
        value={bpm}
        min={40}
        max={300}
        format={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
        onChange={(v) => store.update((d) => ({ ...d, bpm: v }))}
        onBegin={store.begin}
        onEnd={store.end}
      />
      <span className="mr-2 text-[11px] text-zinc-500">BPM</span>
      <span className="mr-3 tabular-nums text-zinc-400">
        {num}/{den}
      </span>
      <DragNumber
        label="Swing"
        value={swing}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(swingPercent(v))}%`}
        parse={(t) => (parseFloat(t) - 50) / 25}
        onChange={(v) => store.update((d) => ({ ...d, swing: v }))}
        onBegin={store.begin}
        onEnd={store.end}
      />
      <span className="text-[11px] text-zinc-500">Swing</span>

      <label className="ml-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
        <select
          aria-label="Launch quantization"
          title="Clip launches wait for this boundary"
          className="h-6 rounded bg-zinc-950/60 px-1 text-[13px] text-zinc-200"
          value={quantize}
          onChange={(e) => {
            const launchQuantize = Number(e.currentTarget.value);
            store.update((d) => ({ ...d, launchQuantize }));
          }}
        >
          {LAUNCH_QUANTIZE.map(([label, ticks]) => (
            <option key={label} value={ticks}>
              {label}
            </option>
          ))}
        </select>
        Launch
      </label>

      <div className="mx-2 h-5 w-px bg-zinc-700" />

      <CommandToolButton id="edit.undo">
        <Undo2 size={14} />
      </CommandToolButton>
      <CommandToolButton id="edit.redo">
        <Redo2 size={14} />
      </CommandToolButton>

      <div className="ml-auto flex items-center gap-1">
        <CommandToolButton id="project.exportWav">
          <Download size={14} /> WAV
        </CommandToolButton>
        <CommandToolButton id="project.exportMidi">
          <Download size={14} /> MIDI
        </CommandToolButton>
        <div className="mx-1 h-5 w-px bg-zinc-700" />
        <CommandToolButton id="edit.commandMenu">
          <CommandIcon size={13} /> K
        </CommandToolButton>
      </div>
    </header>
  );
}
