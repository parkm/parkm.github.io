import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CommandContext,
  DetailMode,
  EditorView,
  FocusArea,
  NoteEditor,
  Slot,
  WorkspaceActions,
} from "./commands/types";
import { createSession } from "./engine/session";
import { createDefaultProject } from "./model/defaults";
import { drumKitOf } from "./model/ops";
import { autosave, loadProject } from "./model/persist";
import { createClip } from "./model/sessionOps";
import { createStore } from "./model/store";
import { PPQ, type Tick } from "./model/time";
import type { Clip, Id } from "./model/types";
import { CommandPalette } from "./ui/CommandPalette";
import { CommandsProvider, createCommands } from "./ui/commands";
import { DawContext, useDaw, useDoc } from "./ui/context";
import { useKeyboard } from "./ui/keyboard";
import { PhoneLayout, type PhoneTab } from "./ui/PhoneLayout";
import type { RenameRequest } from "./ui/SessionView";
import { PHONE, useMediaQuery } from "./ui/useMediaQuery";
import { WideLayout } from "./ui/WideLayout";
import type { WorkspaceView } from "./ui/workspace";

export function Daw() {
  const [value] = useState(() => {
    const store = createStore(loadProject() ?? createDefaultProject());
    return { store, session: createSession(store) };
  });

  useEffect(() => {
    const stopSaving = autosave(value.store);
    return () => {
      stopSaving();
      value.session.dispose();
    };
  }, [value]);

  return (
    <DawContext value={value}>
      <Workspace />
    </DawContext>
  );
}

/**
 * UI state that isn't part of the document (selection, focus, views, grid),
 * and the commands that act on it. Renders the wide or phone layout; both
 * read the same state through a WorkspaceView.
 */
function Workspace() {
  const { store, session } = useDaw();
  const phone = useMediaQuery(PHONE);
  const tracks = useDoc((d) => d.tracks);
  const sceneCount = useDoc((d) => d.scenes.length);
  const [selection, setSelection] = useState<Slot | null>(() =>
    tracks[0] ? { trackId: tracks[0].id, scene: 0 } : null,
  );
  const [padByTrack, setPadByTrack] = useState<Record<Id, Id>>({});
  const [viewByTrack, setViewByTrack] = useState<Record<Id, EditorView>>({});
  const [grid, setGrid] = useState<Tick>(PPQ / 4);
  const [octave, setOctave] = useState(4);
  const [rename, setRename] = useState<RenameRequest>(null);
  const [commandMenu, setCommandMenu] = useState(false);
  const [toast, setToast] = useState<{ message: string; n: number } | null>(
    null,
  );
  // Wide layout: which half was last clicked, and what the detail panel shows.
  const [clickedFocus, setFocus] = useState<FocusArea>("detail");
  const [wideDetail, setWideDetail] = useState<DetailMode>("clip");
  // Phone layout: the open panel and the Play sheet.
  const [tab, setTab] = useState<PhoneTab>("session");
  const [playOpen, setPlayOpen] = useState(false);
  const clipClipboard = useRef<Clip | null>(null);
  const editorRef = useRef<NoteEditor | null>(null);

  // On phones the open tab decides both, so commands behave the same.
  const focus: FocusArea = phone
    ? tab === "session" || tab === "mixer"
      ? "session"
      : "detail"
    : clickedFocus;
  const detail: DetailMode = phone
    ? tab === "devices"
      ? "devices"
      : "clip"
    : wideDetail;
  const showDetail = (mode: DetailMode) =>
    phone ? setTab(mode) : setWideDetail(mode);

  // Keep the selection valid when tracks or scenes are deleted.
  const track =
    tracks.find((t) => t.id === selection?.trackId) ?? tracks[0] ?? null;
  const scene = Math.min(selection?.scene ?? 0, sceneCount - 1);
  const clipId = track?.slots[scene] ?? null;
  const clip = useDoc((d) => (clipId ? d.clips[clipId] : undefined)) ?? null;
  const kit = drumKitOf(track ?? undefined);
  const pad =
    kit?.pads.find((p) => p.id === padByTrack[track!.id]) ??
    kit?.pads[0] ??
    null;
  const view: EditorView = kit ? (viewByTrack[track!.id] ?? "steps") : "roll";
  const padLabels = useMemo(
    () => (kit ? new Map(kit.pads.map((p) => [p.pitch, p.name])) : undefined),
    [kit],
  );

  const actions: WorkspaceActions = {
    select: (slot) => {
      setSelection(slot);
      // Wide: the detail panel follows the selection. Phones stay on the
      // grid; double-tap opens the clip.
      const hasClip = tracks.find((t) => t.id === slot.trackId)?.slots[
        slot.scene
      ];
      if (hasClip && !phone) setWideDetail("clip");
    },
    selectTrack: (trackId) => {
      setSelection({ trackId, scene });
      showDetail("devices");
    },
    selectPad: (padId) =>
      track && setPadByTrack((m) => ({ ...m, [track.id]: padId })),
    setDetail: showDetail,
    setView: (v) => track && setViewByTrack((m) => ({ ...m, [track.id]: v })),
    /**
     * Session record, like Ableton: recording targets the selected slot. An
     * empty slot gets a new clip; either way it starts playing in time and
     * notes you play are written into it.
     */
    toggleRecord: () => {
      if (session.getState().recording || !track) {
        session.setRecording(!session.getState().recording);
        return;
      }
      if (!clipId) store.update((d) => createClip(d, track.id, scene));
      const id = store.get().tracks.find((t) => t.id === track.id)?.slots[
        scene
      ];
      if (id) session.recordInto(track.id, id);
      showDetail("clip");
    },
    capture: () => {
      if (!track) return;
      const slot = session.capture(track.id, scene);
      if (!slot) return;
      setSelection(slot);
      showDetail("clip");
    },
    rename: (id) => setRename((r) => ({ id, n: (r?.n ?? 0) + 1 })),
    openCommandMenu: () => setCommandMenu(true),
    toast: (message) => setToast((t) => ({ message, n: (t?.n ?? 0) + 1 })),
    clipClipboard,
  };

  // Commands read the workspace through this, so they always see the latest state.
  const latest = useRef<Omit<CommandContext, "store" | "session" | "editor">>(
    null!,
  );
  latest.current = {
    focus,
    detail,
    track,
    scene,
    clip,
    grid,
    view,
    pad,
    workspace: actions,
  };
  const [commands] = useState(() =>
    createCommands(() => ({
      store,
      session,
      editor: editorRef.current,
      ...latest.current,
    })),
  );
  // Buttons showing command state re-check after any workspace change.
  useLayoutEffect(() => commands.notify());

  useKeyboard(commands, session, () => ({ track, grid, octave, setOctave }));

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const ws: WorkspaceView = {
    track,
    scene,
    clipId,
    kit,
    pad,
    view,
    padLabels,
    grid,
    setGrid,
    octave,
    setOctave,
    rename,
    editorRef,
    actions,
    openClip: (slot) => {
      setSelection(slot);
      showDetail("clip");
    },
  };

  return (
    <CommandsProvider commands={commands}>
      {phone ? (
        <PhoneLayout
          ws={ws}
          tab={tab}
          setTab={setTab}
          playOpen={playOpen}
          setPlayOpen={setPlayOpen}
        />
      ) : (
        <WideLayout ws={ws} detail={detail} setFocus={setFocus} />
      )}
      {commandMenu && <CommandPalette onClose={() => setCommandMenu(false)} />}
      {toast && (
        <div
          key={toast.n}
          role="status"
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded bg-zinc-700 px-3 py-2 text-xs text-zinc-100 shadow-lg"
        >
          {toast.message}
        </div>
      )}
    </CommandsProvider>
  );
}
