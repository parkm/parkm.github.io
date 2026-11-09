import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Check,
  KeyboardMusic,
  Link2,
  Minus,
  Moon,
  Play,
  Plus,
  Redo2,
  Square,
  Sun,
  Undo2,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button, Slider } from "@/components/ui";
import { cn } from "@/lib/utils";
import { setVolume, stopAllNotes } from "./piano/synth";
import { ChordCard, playKeys } from "./ChordCard";
import { MAX_OCTAVE, MIN_OCTAVE } from "./notes";
import {
  clampRange,
  historyReducer,
  MAX_OCTAVES,
  readUrl,
  writeUrl,
  type Settings,
  type Size,
} from "./state";

/** Smallest white-key width per card size; sets how many cards fit per row. */
const MIN_KEY_WIDTH: Record<Size, number> = { s: 10, m: 14, l: 21 };
const CHORD_MS = 1000;

export function Keyboards() {
  const [initial] = useState(readUrl);
  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initial.sections,
    future: [],
    lastEdit: null,
  });
  const sections = history.present;
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const { startOctave, octaves, volume, size } = settings;
  const updateSettings = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      return { ...next, ...clampRange(next.startOctave, next.octaves) };
    });

  useEffect(() => writeUrl(sections, settings), [sections, settings]);
  useEffect(() => setVolume(volume), [volume]);
  useEffect(() => stopAllNotes, []);

  // ---- Undo / redo shortcuts ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" || key === "y") {
        e.preventDefault();
        dispatch({ type: key === "y" || e.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ---- Progression playback ----
  const [activeId, setActiveId] = useState<number | null>(null);
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const stopPlayback = useCallback(() => {
    setActiveId((current) => {
      if (current !== null) stopAllNotes();
      return null;
    });
  }, []);

  const playAll = () => {
    const first = sections.find((s) => s.keys.length > 0);
    setActiveId(first ? first.id : null);
  };

  useEffect(() => {
    if (activeId === null) return;
    const list = sectionsRef.current;
    const index = list.findIndex((s) => s.id === activeId);
    const section = list[index];
    if (!section) return;
    stopAllNotes();
    playKeys(section.keys);
    const release = setTimeout(stopAllNotes, CHORD_MS - 80);
    const advance = setTimeout(() => {
      const next = sectionsRef.current
        .slice(sectionsRef.current.findIndex((s) => s.id === activeId) + 1)
        .find((s) => s.keys.length > 0);
      setActiveId(next ? next.id : null);
    }, CHORD_MS);
    return () => {
      clearTimeout(release);
      clearTimeout(advance);
    };
  }, [activeId]);

  // Stop if the playing keyboard gets deleted.
  useEffect(() => {
    if (activeId !== null && !sections.some((s) => s.id === activeId)) {
      stopPlayback();
    }
  }, [sections, activeId, stopPlayback]);

  const hasAnyNotes = sections.some((s) => s.keys.length > 0);
  const isPlayingAll = activeId !== null;

  // ---- Drag to reorder ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    dispatch({
      type: "move",
      from: sections.findIndex((s) => s.id === active.id),
      to: sections.findIndex((s) => s.id === over.id),
    });
  };

  // Card padding (2 × 10px) + border (2px) + keyboard outline (2px).
  const minColumn = octaves * 7 * MIN_KEY_WIDTH[size] + 24;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-1.5 gap-y-2 px-3 py-2 sm:gap-x-3 sm:px-5">
          <div className="flex items-center gap-2">
            <KeyboardMusic className="hidden size-5 text-primary sm:block" />
            <h1 className="text-base font-semibold">Keyboards</h1>
          </div>

          <div className="flex items-center">
            <IconButton
              label="Undo (⌘Z)"
              disabled={!history.past.length}
              onClick={() => dispatch({ type: "undo" })}
            >
              <Undo2 />
            </IconButton>
            <IconButton
              label="Redo (⇧⌘Z)"
              disabled={!history.future.length}
              onClick={() => dispatch({ type: "redo" })}
            >
              <Redo2 />
            </IconButton>
          </div>

          <div className="ml-auto flex items-center gap-1 xl:order-last">
            <Button
              variant="outline"
              size="sm"
              className="w-8 justify-start px-0 has-[>svg]:px-2 sm:w-[5.75rem] sm:has-[>svg]:px-3"
              disabled={!hasAnyNotes && !isPlayingAll}
              onClick={() => (isPlayingAll ? stopPlayback() : playAll())}
              aria-label={isPlayingAll ? "Stop" : "Play all"}
              title={
                isPlayingAll
                  ? "Stop playback"
                  : "Play every keyboard in order, one second each"
              }
            >
              {isPlayingAll ? <Square className="fill-current" /> : <Play />}
              <span className="hidden sm:inline">
                {isPlayingAll ? "Stop" : "Play all"}
              </span>
            </Button>
            <CopyLinkButton />
            <ThemeToggle />
            <Button
              size="sm"
              onClick={() => dispatch({ type: "add" })}
              className="ml-1"
            >
              <Plus />
              <span className="hidden sm:inline">Add keyboard</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>

          <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 border-t pt-2 xl:w-auto xl:flex-1 xl:justify-center xl:border-0 xl:pt-0">
            <Stepper
              label="From"
              title="Lowest octave shown"
              value={`C${startOctave}`}
              onChange={(d) => updateSettings({ startOctave: startOctave + d })}
              canDecrement={startOctave > MIN_OCTAVE}
              canIncrement={startOctave + octaves - 1 < MAX_OCTAVE}
            />
            <Stepper
              label="Octaves"
              title="Number of octaves shown"
              value={String(octaves)}
              onChange={(d) => updateSettings({ octaves: octaves + d })}
              canDecrement={octaves > 1}
              canIncrement={
                octaves < MAX_OCTAVES && startOctave + octaves - 1 < MAX_OCTAVE
              }
            />
            <SizePicker
              value={size}
              onChange={(s) => updateSettings({ size: s })}
            />
            <VolumeControl
              value={volume}
              onChange={(v) => updateSettings({ volume: v })}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-2 pb-16 pt-3 sm:px-5 sm:pt-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sections.map((s) => s.id)}
            strategy={rectSortingStrategy}
          >
            <div
              className="grid gap-2 sm:gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minColumn}px), 1fr))`,
              }}
            >
              {sections.map((section, index) => (
                <ChordCard
                  key={section.id}
                  section={section}
                  index={index}
                  octaves={octaves}
                  startOctave={startOctave}
                  canRemove={sections.length > 1}
                  isActive={activeId === section.id}
                  dispatch={dispatch}
                  onPlayStart={stopPlayback}
                />
              ))}
              <button
                type="button"
                onClick={() => dispatch({ type: "add" })}
                className="flex min-h-32 items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
              >
                <Plus className="size-4" />
                Add keyboard
              </button>
            </div>
          </SortableContext>
        </DndContext>
      </main>
    </div>
  );
}

function IconButton({
  label,
  className,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

function Stepper({
  label,
  title,
  value,
  onChange,
  canDecrement,
  canIncrement,
}: {
  label: string;
  title: string;
  value: string;
  onChange: (delta: number) => void;
  canDecrement: boolean;
  canIncrement: boolean;
}) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex h-8 items-center rounded-md border bg-background shadow-xs dark:bg-input/30">
        <button
          type="button"
          onClick={() => onChange(-1)}
          disabled={!canDecrement}
          className="flex h-full w-7 items-center justify-center rounded-l-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus className="size-3.5" />
        </button>
        <span className="w-7 text-center text-sm font-medium tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(1)}
          disabled={!canIncrement}
          className="flex h-full w-7 items-center justify-center rounded-r-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function SizePicker({
  value,
  onChange,
}: {
  value: Size;
  onChange: (size: Size) => void;
}) {
  const options: { value: Size; label: string; title: string }[] = [
    { value: "s", label: "S", title: "Small: most keyboards per row" },
    { value: "m", label: "M", title: "Medium" },
    { value: "l", label: "L", title: "Large: bigger keys" },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Size</span>
      <div
        role="radiogroup"
        aria-label="Keyboard size"
        className="flex h-8 rounded-md border bg-background p-0.5 shadow-xs dark:bg-input/30"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "w-7 rounded-[5px] text-xs font-medium transition-colors",
              value === o.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function VolumeControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [lastAudible, setLastAudible] = useState(value || 0.1);
  const Icon = value === 0 ? VolumeX : value < 0.4 ? Volume1 : Volume2;

  return (
    <div className="flex flex-1 items-center gap-1 sm:flex-none">
      <IconButton
        label={value === 0 ? "Unmute" : "Mute"}
        onClick={() => {
          if (value === 0) onChange(lastAudible);
          else {
            setLastAudible(value);
            onChange(0);
          }
        }}
      >
        <Icon />
      </IconButton>
      <Slider
        value={[value]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={([v]) => onChange(v)}
        className="min-w-20 flex-1 sm:w-24 sm:flex-none"
        aria-label="Volume"
      />
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <IconButton
      label={copied ? "Link copied" : "Copy link to these keyboards"}
      onClick={() =>
        navigator.clipboard
          .writeText(window.location.href)
          .then(() => setCopied(true))
          .catch(() => {})
      }
    >
      {copied ? <Check className="text-green-600" /> : <Link2 />}
    </IconButton>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.theme = next ? "dark" : "light";
    } catch {
      // storage unavailable
    }
    setDark(next);
  };
  return (
    <IconButton
      label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    >
      {dark ? <Sun /> : <Moon />}
    </IconButton>
  );
}
