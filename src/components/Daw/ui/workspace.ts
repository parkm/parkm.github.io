import type { RefObject } from "react";
import type {
  EditorView,
  NoteEditor,
  Slot,
  WorkspaceActions,
} from "../commands/types";
import type { Tick } from "../model/time";
import type { DrumKitDevice, Id, Pad, Track } from "../model/types";
import type { RenameRequest } from "./SessionView";

/**
 * What the layouts render from: the workspace's derived selection and
 * settings, and the actions that change them. Layouts only arrange panels;
 * the workspace owns the state.
 */
export type WorkspaceView = {
  track: Track | null;
  scene: number;
  clipId: Id | null;
  kit: DrumKitDevice | undefined;
  pad: Pad | null;
  view: EditorView;
  /** Drum pad names by pitch, for the piano roll's keys. */
  padLabels: Map<number, string> | undefined;
  grid: Tick;
  setGrid: (grid: Tick) => void;
  octave: number;
  setOctave: (octave: number) => void;
  rename: RenameRequest;
  editorRef: RefObject<NoteEditor | null>;
  actions: WorkspaceActions;
  /** Open a clip in the editor. */
  openClip: (slot: Slot) => void;
};
