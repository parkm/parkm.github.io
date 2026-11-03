import type { Command, CommandContext, NoteEditor } from "./types";

/**
 * The piano roll's note commands. They apply when a note editor is open;
 * their shortcuts fire while the clip area has focus.
 */

const hasEditor = (ctx: CommandContext) => !!ctx.editor;
const hasSelection = (ctx: CommandContext) => !!ctx.editor?.hasSelection();

type NoteCommand = Omit<Command, "group" | "run" | "when" | "scope"> & {
  run: (editor: NoteEditor, ctx: CommandContext) => void;
  /** Needs selected notes (shown disabled otherwise). */
  selection?: boolean;
};

const note = ({ run, selection, ...cmd }: NoteCommand): Command => ({
  ...cmd,
  group: "Notes",
  scope: "detail",
  when: hasEditor,
  enabled: selection ? hasSelection : cmd.enabled,
  run: (ctx) => run(ctx.editor!, ctx),
});

const move = (
  id: string,
  title: string,
  key: string,
  ticks: (ctx: CommandContext) => number,
  semitones: number,
) =>
  note({
    id: `notes.${id}`,
    title,
    keys: [key],
    repeat: true,
    selection: true,
    run: (editor, ctx) => editor.moveSelection(ticks(ctx), semitones),
  });

export const noteCommands: Command[] = [
  note({
    id: "notes.selectAll",
    title: "Select all notes",
    keys: ["mod+a"],
    run: (e) => e.selectAll(),
  }),
  note({
    id: "notes.copy",
    title: "Copy notes",
    keys: ["mod+c"],
    selection: true,
    run: (e) => e.copy(),
  }),
  note({
    id: "notes.cut",
    title: "Cut notes",
    keys: ["mod+x"],
    selection: true,
    run: (e) => e.cut(),
  }),
  note({
    id: "notes.paste",
    title: "Paste notes",
    keys: ["mod+v"],
    run: (e) => e.paste(),
  }),
  note({
    id: "notes.duplicate",
    title: "Duplicate notes",
    keys: ["mod+d"],
    selection: true,
    run: (e) => e.duplicateSelection(),
  }),
  note({
    id: "notes.delete",
    title: "Delete notes",
    keys: ["backspace", "delete"],
    selection: true,
    run: (e) => e.deleteSelection(),
  }),
  note({
    id: "notes.legato",
    title: (ctx) =>
      ctx.editor?.hasSelection() ? "Legato selected notes" : "Legato all notes",
    keywords: ["extend", "connect", "length"],
    run: (e) => e.legato(),
  }),
  note({
    id: "notes.stretchHalf",
    title: "Stretch selection to half",
    keywords: ["/2", "faster", "compress"],
    selection: true,
    run: (e) => e.stretchSelection(0.5),
  }),
  note({
    id: "notes.stretchDouble",
    title: "Stretch selection to double",
    keywords: ["x2", "slower", "expand"],
    selection: true,
    run: (e) => e.stretchSelection(2),
  }),
  note({
    id: "notes.loopSelection",
    title: "Loop selection",
    keywords: ["brace", "region"],
    selection: true,
    run: (e) => e.loopSelection(),
  }),
  note({
    id: "notes.cropSelection",
    title: "Crop to selection",
    keywords: ["trim", "loop"],
    selection: true,
    run: (e) => e.cropSelection(),
  }),
  move("transposeUp", "Transpose up", "up", () => 0, 1),
  move("transposeDown", "Transpose down", "down", () => 0, -1),
  move("octaveUp", "Transpose up an octave", "shift+up", () => 0, 12),
  move("octaveDown", "Transpose down an octave", "shift+down", () => 0, -12),
  move("nudgeEarlier", "Move notes earlier", "left", (ctx) => -ctx.grid, 0),
  move("nudgeLater", "Move notes later", "right", (ctx) => ctx.grid, 0),
  note({
    id: "notes.toolSelect",
    title: "Select tool",
    keywords: ["pointer", "arrow"],
    run: (e) => e.setTool("select"),
  }),
  note({
    id: "notes.toolDraw",
    title: "Draw tool",
    keywords: ["pencil"],
    run: (e) => e.setTool("draw"),
  }),
  note({
    id: "notes.toggleTool",
    title: "Switch select / draw tool",
    keys: ["b"],
    keywords: ["pencil", "pointer"],
    run: (e) => e.toggleTool(),
  }),
  note({
    id: "notes.fold",
    title: "Fold: show only rows with notes",
    keywords: ["rows", "compact"],
    run: (e) => e.toggleFold(),
  }),
  note({
    id: "notes.fit",
    title: "Zoom to fit clip",
    keys: ["shift+z"],
    keywords: ["view", "all"],
    run: (e) => e.fit(),
  }),
];
