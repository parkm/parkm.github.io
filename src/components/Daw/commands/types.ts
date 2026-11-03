import type { Session } from "../engine/session";
import type { Store } from "../model/store";
import type { Tick } from "../model/time";
import type { Clip, Id, Pad, Project, Track } from "../model/types";

/**
 * Commands are every user action, defined once. Shortcuts, toolbar buttons,
 * context menus and the command menu (⌘K) all run the same definitions, so
 * adding an action means adding one entry to a command list.
 */

/** Which half of the window was last clicked. Shortcuts follow it, like Live. */
export type FocusArea = "session" | "detail";
export type DetailMode = "clip" | "devices";
export type EditorView = "steps" | "roll";
export type Slot = { trackId: Id; scene: number };

export type CommandGroup =
  | "Transport"
  | "Edit"
  | "Project"
  | "View"
  | "Session"
  | "Track"
  | "Clip"
  | "Notes"
  | "Drums";

/** Everything a command can read or act on, captured when it runs. */
export type CommandContext = {
  store: Store<Project>;
  session: Session;
  focus: FocusArea;
  detail: DetailMode;
  /** The selected track and slot. */
  track: Track | null;
  scene: number;
  /** The clip in the selected slot. */
  clip: Clip | null;
  grid: Tick;
  view: EditorView;
  /** The selected drum pad (drum tracks). */
  pad: Pad | null;
  /** The visible note editor (piano roll), if any. */
  editor: NoteEditor | null;
  workspace: WorkspaceActions;
};

/** UI state changes that commands can make. Implemented by the workspace. */
export type WorkspaceActions = {
  select: (slot: Slot) => void;
  selectTrack: (trackId: Id) => void;
  selectPad: (padId: Id) => void;
  setDetail: (mode: DetailMode) => void;
  setView: (view: EditorView) => void;
  toggleRecord: () => void;
  capture: () => void;
  /** Start renaming a clip or track in place. */
  rename: (id: Id) => void;
  openCommandMenu: () => void;
  /** A short message at the bottom of the window. */
  toast: (message: string) => void;
  /** Copied clip for session paste. */
  clipClipboard: { current: Clip | null };
};

/**
 * What a note editor (the piano roll) offers to commands. The editor owns
 * its selection; commands only call through this.
 */
export type NoteEditor = {
  hasSelection: () => boolean;
  selectAll: () => void;
  clearSelection: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  /** Selected notes, or all when nothing is selected. */
  quantize: () => void;
  legato: () => void;
  loopSelection: () => void;
  cropSelection: () => void;
  stretchSelection: (factor: number) => void;
  moveSelection: (ticks: Tick, semitones: number) => void;
  toggleTool: () => void;
  setTool: (tool: "select" | "draw") => void;
  toggleFold: () => void;
  fit: () => void;
};

export type Command = {
  /** Stable id, `area.action`. Buttons and menus refer to commands by it. */
  id: string;
  group: CommandGroup;
  title: string | ((ctx: CommandContext) => string);
  /** Shortcuts like "mod+shift+z" (mod = ⌘ on Mac, Ctrl elsewhere). The first is shown. */
  keys?: string[];
  /** Shortcuts only fire while this half of the window has focus. */
  scope?: FocusArea;
  /** Extra words the command menu matches. */
  keywords?: string[];
  /** Whether the command applies here at all. Otherwise it's hidden and its shortcut is free. */
  when?: (ctx: CommandContext) => boolean;
  /** Applies but can't run right now: shown disabled. */
  enabled?: (ctx: CommandContext) => boolean;
  /** Keep running while the key auto-repeats (nudging). */
  repeat?: boolean;
  run: (ctx: CommandContext) => void | Promise<void>;
};

export const commandTitle = (cmd: Command, ctx: CommandContext) =>
  typeof cmd.title === "function" ? cmd.title(ctx) : cmd.title;

export const isAvailable = (cmd: Command, ctx: CommandContext) =>
  cmd.when?.(ctx) ?? true;

export const isEnabled = (cmd: Command, ctx: CommandContext) =>
  isAvailable(cmd, ctx) && (cmd.enabled?.(ctx) ?? true);
