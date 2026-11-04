import { Play, Plus, Square, X } from "lucide-react";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { TrackPlayState } from "../engine/session";
import {
  addTrack,
  createClip,
  deleteScene,
  deleteTrack,
  insertScene,
  moveClip,
  moveTrack,
  renameClip,
  renameScene,
  updateTrackFields,
  TRACK_KINDS,
  type Slot,
  type TrackKind,
} from "../model/sessionOps";
import type { Clip, Id, Track } from "../model/types";
import { useDaw, useDoc, useSessionState } from "./context";
import { EditableText } from "./EditableText";
import { onFrame } from "./frame";
import { Knob } from "./Knob";
import { LevelMeter } from "./Meter";
import { TrackMixer, VOLUME } from "./TrackMixer";

/**
 * Session view: tracks as columns, scenes as rows. Clips launch on the next
 * launch-quantize boundary; the music never stops while you rearrange.
 *
 * Drag a clip to any slot to move it (⌥ copies). Drag a track header to
 * reorder tracks. Click a header to show the track's devices.
 */

export type SlotSelection = Slot;
/** A rename started from the keyboard (⌘R); `n` changes on every request. */
export type RenameRequest = { id: Id; n: number } | null;

// Slot height and column width come from CSS variables set on the view, so
// phones can make everything touch-sized in one place.
const SIZES = {
  regular: { "--row-h": "28px", "--col-w": "148px" },
  large: { "--row-h": "44px", "--col-w": "132px" },
} as Record<"regular" | "large", CSSProperties>;
const DRAG_THRESHOLD = 4;

type SessionViewProps = {
  selection: SlotSelection | null;
  onSelect: (selection: SlotSelection) => void;
  onSelectTrack: (trackId: Id) => void;
  /** Open a clip in the editor (double-click / double-tap). */
  onOpen: (slot: SlotSelection) => void;
  rename: RenameRequest;
  /** "large" makes slots touch-sized. */
  size?: keyof typeof SIZES;
  /** Mixer strips under each column (phones use the Mixer tab instead). */
  showMixer?: boolean;
  masterSelected?: boolean;
  onSelectMaster?: () => void;
};

type ClipDrag = {
  from: Slot;
  x: number;
  y: number;
  active: boolean;
  target: Slot | null;
};

type TrackDrag = { trackId: Id; x: number; active: boolean; to: number | null };

/** The slot or track column under a point, from data attributes on the grid. */
function hitTest(x: number, y: number) {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const slot = el?.closest<HTMLElement>("[data-slot]")?.dataset.slot;
  const column =
    el?.closest<HTMLElement>("[data-track-index]")?.dataset.trackIndex;
  return {
    slot: slot
      ? { trackId: slot.split(":")[0], scene: Number(slot.split(":")[1]) }
      : null,
    column: column === undefined ? null : Number(column),
  };
}

export function SessionView({
  selection,
  onSelect,
  onSelectTrack,
  onOpen,
  rename,
  size = "regular",
  showMixer = true,
  masterSelected = false,
  onSelectMaster,
}: SessionViewProps) {
  const { store } = useDaw();
  const tracks = useDoc((d) => d.tracks);
  const [dropSlot, setDropSlot] = useState<Slot | null>(null);
  const [dropColumn, setDropColumn] = useState<number | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<Clip | null>(null);

  /** Start a possible clip drag; a plain click falls through as selection. */
  function beginClipDrag(e: ReactPointerEvent, from: Slot, clip: Clip) {
    if (e.button !== 0) return;
    const drag: ClipDrag = {
      from,
      x: e.clientX,
      y: e.clientY,
      active: false,
      target: null,
    };
    const move = (ev: PointerEvent) => {
      if (!drag.active) {
        if (
          Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < DRAG_THRESHOLD
        )
          return;
        drag.active = true;
        setGhost(clip);
      }
      const g = ghostRef.current;
      if (g)
        g.style.transform = `translate(${ev.clientX + 8}px, ${ev.clientY + 8}px)`;
      const { slot } = hitTest(ev.clientX, ev.clientY);
      if (
        slot?.trackId !== drag.target?.trackId ||
        slot?.scene !== drag.target?.scene
      ) {
        drag.target = slot;
        setDropSlot(slot);
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGhost(null);
      setDropSlot(null);
      const to = drag.target;
      if (!drag.active || !to) return;
      store.update((d) => moveClip(d, drag.from, to, ev.altKey));
      onSelect(to);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function beginTrackDrag(e: ReactPointerEvent, trackId: Id) {
    if (e.button !== 0) return;
    const drag: TrackDrag = { trackId, x: e.clientX, active: false, to: null };
    const move = (ev: PointerEvent) => {
      if (!drag.active && Math.abs(ev.clientX - drag.x) < DRAG_THRESHOLD)
        return;
      drag.active = true;
      const { column } = hitTest(ev.clientX, ev.clientY);
      if (column !== drag.to) {
        drag.to = column;
        setDropColumn(column);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDropColumn(null);
      if (!drag.active) {
        onSelectTrack(trackId);
        return;
      }
      if (drag.to !== null)
        store.update((d) => moveTrack(d, trackId, drag.to!));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-auto" style={SIZES[size]}>
      {tracks.map((track, i) => (
        <TrackColumn
          key={track.id}
          track={track}
          index={i}
          selectedScene={
            selection?.trackId === track.id ? selection.scene : null
          }
          dropScene={dropSlot?.trackId === track.id ? dropSlot.scene : null}
          dropBefore={dropColumn === i}
          rename={rename}
          onSelect={onSelect}
          onOpen={onOpen}
          showMixer={showMixer}
          onClipPointerDown={beginClipDrag}
          onHeaderPointerDown={beginTrackDrag}
        />
      ))}
      <div className="flex shrink-0 flex-col gap-1 p-1.5">
        {(Object.keys(TRACK_KINDS) as TrackKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-label={`Add ${TRACK_KINDS[kind]} track`}
            className="flex h-6 items-center gap-1 rounded px-1.5 text-xs whitespace-nowrap text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
            onClick={() => {
              store.update((d) => addTrack(d, kind));
              onSelectTrack(store.get().tracks.at(-1)!.id);
            }}
          >
            <Plus size={13} /> {TRACK_KINDS[kind]}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <MasterColumn
        showMixer={showMixer}
        selected={masterSelected}
        onSelect={onSelectMaster}
      />
      {ghost && (
        <div
          ref={ghostRef}
          className="pointer-events-none fixed top-0 left-0 z-50 rounded px-2 py-1 text-xs text-zinc-950 shadow-lg"
          style={{
            background: `oklch(0.7 0.12 ${ghost.hue})`,
            transform: "translate(-999px, 0)",
          }}
        >
          {ghost.name}
        </div>
      )}
    </div>
  );
}

function ColumnHeader({
  children,
  onPointerDown,
}: {
  children: ReactNode;
  onPointerDown?: (e: ReactPointerEvent) => void;
}) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-1 border-b border-zinc-950 bg-zinc-800 px-1.5 h-(--row-h)"
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}

function MixerFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 mt-auto flex flex-col items-center gap-1.5 border-t border-zinc-950 bg-zinc-800 px-1.5 pt-1.5 pb-2">
      {children}
    </div>
  );
}

type TrackColumnProps = {
  track: Track;
  index: number;
  selectedScene: number | null;
  dropScene: number | null;
  dropBefore: boolean;
  rename: RenameRequest;
  onSelect: (selection: SlotSelection) => void;
  onOpen: (slot: SlotSelection) => void;
  showMixer: boolean;
  onClipPointerDown: (e: ReactPointerEvent, from: Slot, clip: Clip) => void;
  onHeaderPointerDown: (e: ReactPointerEvent, trackId: Id) => void;
};

const TrackColumn = memo(function TrackColumn({
  track,
  index,
  selectedScene,
  dropScene,
  dropBefore,
  rename,
  onSelect,
  onOpen,
  showMixer,
  onClipPointerDown,
  onHeaderPointerDown,
}: TrackColumnProps) {
  const { store } = useDaw();
  const play = useSessionState((s) => s.tracks[track.id]);
  const trackId = track.id;
  const set = (patch: Parameters<typeof updateTrackFields>[2]) =>
    store.update((d) => updateTrackFields(d, trackId, patch));
  const selected = selectedScene !== null;

  return (
    <div
      data-track-index={index}
      className={`flex shrink-0 flex-col border-r border-zinc-950 ${
        dropBefore ? "shadow-[inset_3px_0_0_0_var(--color-amber-400)]" : ""
      } w-(--col-w)`}
    >
      <ColumnHeader onPointerDown={(e) => onHeaderPointerDown(e, trackId)}>
        <div
          className="h-3 w-1 shrink-0 rounded-full"
          style={{ background: `oklch(0.75 0.14 ${track.hue})` }}
        />
        <EditableText
          label="Track name"
          value={track.name}
          editSignal={rename?.id === trackId ? rename.n : 0}
          className={`flex-1 cursor-grab text-xs font-medium ${selected ? "text-zinc-50" : "text-zinc-300"}`}
          onCommit={(name) => set({ name: name || track.name })}
        />
        <button
          type="button"
          title="Delete track"
          aria-label={`Delete ${track.name}`}
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => store.update((d) => deleteTrack(d, trackId))}
        >
          <X size={12} />
        </button>
      </ColumnHeader>

      {track.slots.map((clipId, scene) => (
        <ClipSlot
          key={scene}
          track={track}
          scene={scene}
          clipId={clipId}
          play={play}
          selected={scene === selectedScene}
          dropTarget={scene === dropScene}
          rename={rename}
          onSelect={onSelect}
          onOpen={onOpen}
          onClipPointerDown={onClipPointerDown}
        />
      ))}

      {showMixer && (
        <MixerFooter>
          <TrackMixer track={track} number={index + 1} />
        </MixerFooter>
      )}
    </div>
  );
});

type ClipSlotProps = {
  track: Track;
  scene: number;
  clipId: Id | null;
  play: TrackPlayState | undefined;
  selected: boolean;
  dropTarget: boolean;
  rename: RenameRequest;
  onSelect: (selection: SlotSelection) => void;
  onOpen: (slot: SlotSelection) => void;
  onClipPointerDown: (e: ReactPointerEvent, from: Slot, clip: Clip) => void;
};

function ClipSlot({
  track,
  scene,
  clipId,
  play,
  selected,
  dropTarget,
  rename,
  onSelect,
  onOpen,
  onClipPointerDown,
}: ClipSlotProps) {
  const { store, session } = useDaw();
  const clip = useDoc((d) => (clipId ? d.clips[clipId] : undefined));
  const trackId = track.id;
  const select = () => onSelect({ trackId, scene });
  const ring = dropTarget
    ? "ring-2 ring-inset ring-amber-400"
    : selected
      ? "ring-1 ring-inset ring-zinc-100"
      : "";

  if (!clip) {
    return (
      <div
        data-slot={`${trackId}:${scene}`}
        className={`group flex items-center border-b border-zinc-900 bg-zinc-800/40 hover:bg-zinc-800 ${ring} h-(--row-h)`}
        title="Double-click to create a clip"
        onPointerDown={select}
        onDoubleClick={() => {
          store.update((d) => createClip(d, trackId, scene));
          onOpen({ trackId, scene });
        }}
      >
        <button
          type="button"
          title="Stop track"
          aria-label={`Stop ${track.name}`}
          className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-sm text-zinc-600 hover:bg-zinc-700 hover:text-zinc-200"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => session.launch(trackId, null)}
        >
          <Square size={7} fill="currentColor" />
        </button>
      </div>
    );
  }

  const playing = play?.playing === clip.id;
  const queued = play?.queued === clip.id;

  return (
    <div
      data-slot={`${trackId}:${scene}`}
      className={`relative flex h-(--row-h) cursor-grab items-center gap-1 overflow-hidden border-b border-zinc-900 pr-1.5 ${ring}`}
      style={{
        background: `oklch(${selected ? "0.62 0.12" : "0.5 0.09"} ${clip.hue})`,
      }}
      onPointerDown={(e) => {
        select();
        onClipPointerDown(e, { trackId, scene }, clip);
      }}
      onDoubleClick={() => onOpen({ trackId, scene })}
    >
      <button
        type="button"
        title="Launch clip"
        aria-label={`Launch ${clip.name}`}
        className="flex h-full w-6 shrink-0 cursor-pointer items-center justify-center hover:bg-black/15"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          select();
          session.launch(trackId, clip.id);
        }}
      >
        <Play
          size={11}
          fill="currentColor"
          className={
            playing
              ? "text-lime-300"
              : queued
                ? "animate-pulse text-lime-300"
                : "text-zinc-900/70"
          }
        />
      </button>
      <EditableText
        label="Clip name"
        value={clip.name}
        editSignal={rename?.id === clip.id ? rename.n : 0}
        className="text-xs text-zinc-950"
        onCommit={(name) =>
          name && store.update((d) => renameClip(d, clip.id, name))
        }
      />
      {playing && (
        <ClipProgress trackId={trackId} clipId={clip.id} length={clip.length} />
      )}
    </div>
  );
}

/** Loop progress bar for a playing clip, updated per frame outside React. */
function ClipProgress({
  trackId,
  clipId,
  length,
}: {
  trackId: Id;
  clipId: Id;
  length: number;
}) {
  const { session } = useDaw();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return onFrame(() => {
      const pos = session.clipPosition(trackId, clipId, length);
      el.style.transform = `scaleX(${pos === null ? 0 : pos / length})`;
    });
  }, [session, trackId, clipId, length]);

  return (
    <div
      ref={ref}
      className="absolute right-0 bottom-0 left-0 h-[3px] origin-left bg-lime-300/80"
      style={{ transform: "scaleX(0)" }}
    />
  );
}

function MasterColumn({
  showMixer,
  selected,
  onSelect,
}: {
  showMixer: boolean;
  selected: boolean;
  /** Click the header to show the master's effects. */
  onSelect?: () => void;
}) {
  const { store, session } = useDaw();
  const scenes = useDoc((d) => d.scenes);
  const masterVolume = useDoc((d) => d.masterVolume);

  return (
    <div className="sticky right-0 z-20 flex shrink-0 flex-col border-l border-zinc-950 bg-zinc-900 w-(--col-w)">
      <ColumnHeader>
        <button
          type="button"
          title="Show master effects"
          aria-pressed={selected}
          className={`flex-1 self-stretch text-left text-xs font-medium ${
            selected ? "text-amber-300" : "text-zinc-200 hover:text-zinc-50"
          }`}
          onClick={onSelect}
        >
          Master
        </button>
      </ColumnHeader>
      {scenes.map((scene, i) => (
        <div
          key={scene.id}
          className="group flex items-center gap-1 border-b border-zinc-950 bg-zinc-800/80 pr-1 h-(--row-h)"
        >
          <button
            type="button"
            title="Launch scene"
            aria-label={`Launch scene ${scene.name || i + 1}`}
            className="flex h-full w-6 shrink-0 items-center justify-center text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
            onPointerDown={(e) => {
              if (e.button === 0) session.launchScene(i);
            }}
          >
            <Play size={11} fill="currentColor" />
          </button>
          <EditableText
            label="Scene name"
            value={scene.name}
            placeholder={String(i + 1)}
            className="flex-1 text-xs text-zinc-300"
            onCommit={(name) => store.update((d) => renameScene(d, i, name))}
          />
          <button
            type="button"
            title="Insert scene below"
            aria-label="Insert scene below"
            className="hidden rounded p-0.5 text-zinc-500 group-hover:block hover:bg-zinc-700 hover:text-zinc-200"
            onClick={() => store.update((d) => insertScene(d, i + 1))}
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            title="Delete scene"
            aria-label={`Delete scene ${scene.name || i + 1}`}
            className="hidden rounded p-0.5 text-zinc-500 group-hover:block hover:bg-zinc-700 hover:text-zinc-200"
            onClick={() => store.update((d) => deleteScene(d, i))}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {showMixer && (
        <MixerFooter>
          <button
            type="button"
            title="Stop all clips"
            aria-label="Stop all clips"
            className="flex h-5 w-full items-center justify-center gap-1 rounded-sm bg-zinc-700/70 text-[11px] text-zinc-300 hover:bg-zinc-600"
            onClick={session.stopAll}
          >
            <Square size={9} fill="currentColor" /> All
          </button>
          <Knob
            def={{ ...VOLUME, label: "Master" }}
            value={masterVolume}
            onChange={(v) => store.update((d) => ({ ...d, masterVolume: v }))}
            onBegin={store.begin}
            onEnd={store.end}
          />
          <LevelMeter trackId={null} />
          <div className="h-5" />
        </MixerFooter>
      )}
    </div>
  );
}
