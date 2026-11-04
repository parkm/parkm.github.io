import { downloadBlob, downloadMidi, downloadWav } from "../export/download";
import { createDefaultProject, createEmptyProject } from "../model/defaults";
import { parseProject, serializeProject } from "../model/persist";
import type { Command, CommandContext } from "./types";

/** Playback, undo, project files and export: available everywhere. */

const anyClipPlaying = (ctx: CommandContext) =>
  Object.values(ctx.session.getState().tracks).some((t) => t.playing);

export const transportCommands: Command[] = [
  {
    id: "transport.playStop",
    group: "Transport",
    title: (ctx) => (ctx.session.getState().playing ? "Stop" : "Play"),
    keys: ["space"],
    keywords: ["start", "pause"],
    run: (ctx) => ctx.session.toggle(),
  },
  {
    id: "transport.record",
    group: "Transport",
    title: (ctx) =>
      ctx.session.getState().recording ? "Stop recording" : "Record",
    keys: ["r"],
    keywords: ["arm"],
    run: (ctx) => ctx.workspace.toggleRecord(),
  },
  {
    id: "transport.capture",
    group: "Transport",
    title: "Capture MIDI",
    keys: ["c"],
    keywords: ["recover", "phrase", "what I played"],
    enabled: (ctx) =>
      !!ctx.track && !!ctx.session.getState().capturable[ctx.track.id],
    run: (ctx) => ctx.workspace.capture(),
  },
  {
    id: "transport.metronome",
    group: "Transport",
    title: (ctx) =>
      ctx.session.getState().metronome ? "Metronome off" : "Metronome on",
    keys: ["m"],
    keywords: ["click", "beat"],
    run: (ctx) => ctx.session.setMetronome(!ctx.session.getState().metronome),
  },
  {
    id: "transport.preview",
    group: "Transport",
    title: (ctx) =>
      ctx.session.getState().preview ? "Preview notes off" : "Preview notes on",
    keywords: ["audition", "headphones", "hear", "sound", "mute"],
    run: (ctx) => ctx.session.setPreview(!ctx.session.getState().preview),
  },
  {
    id: "transport.stopAllClips",
    group: "Transport",
    title: "Stop all clips",
    run: (ctx) => ctx.session.stopAll(),
  },
  {
    id: "transport.releaseNotes",
    group: "Transport",
    title: "Release all notes",
    keys: ["escape"],
    keywords: ["panic", "stuck", "deselect"],
    run: (ctx) => {
      ctx.editor?.clearSelection();
      ctx.session.allNotesOff();
    },
  },
];

export const editCommands: Command[] = [
  {
    id: "edit.undo",
    group: "Edit",
    title: "Undo",
    keys: ["mod+z"],
    enabled: (ctx) => ctx.store.canUndo(),
    run: (ctx) => ctx.store.undo(),
  },
  {
    id: "edit.redo",
    group: "Edit",
    title: "Redo",
    keys: ["mod+shift+z", "mod+y"],
    enabled: (ctx) => ctx.store.canRedo(),
    run: (ctx) => ctx.store.redo(),
  },
  {
    id: "edit.commandMenu",
    group: "Edit",
    title: "Command menu",
    keys: ["mod+k"],
    keywords: ["search", "palette", "actions"],
    run: (ctx) => ctx.workspace.openCommandMenu(),
  },
];

/** One hidden file picker, created on first use and kept for later. */
let picker: HTMLInputElement | null = null;

/** Ask for a project file and load it (one undo step). */
function openProjectFile(ctx: CommandContext) {
  if (!picker) {
    picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".json,application/json";
    picker.hidden = true;
    document.body.append(picker);
  }
  picker.value = "";
  picker.onchange = async () => {
    const file = picker?.files?.[0];
    if (!file) return;
    const doc = parseProject(await file.text());
    if (doc) ctx.session.replaceProject(doc);
    else ctx.workspace.toast("That file isn't a project saved from here.");
  };
  picker.click();
}

export const projectCommands: Command[] = [
  {
    id: "project.new",
    group: "Project",
    title: "New project",
    keywords: ["reset", "clear", "empty"],
    run: (ctx) => ctx.session.replaceProject(createEmptyProject()),
  },
  {
    id: "project.demo",
    group: "Project",
    title: "Load demo",
    keywords: ["example", "starter"],
    run: (ctx) => ctx.session.replaceProject(createDefaultProject()),
  },
  {
    id: "project.save",
    group: "Project",
    title: "Save to file…",
    keywords: ["download", "json"],
    run: (ctx) =>
      downloadBlob(
        new Blob([serializeProject(ctx.store.get())], {
          type: "application/json",
        }),
        "project.daw.json",
      ),
  },
  {
    id: "project.open",
    group: "Project",
    title: "Open file…",
    keywords: ["load", "import"],
    run: openProjectFile,
  },
  {
    id: "project.exportWav",
    group: "Project",
    title: "Export WAV",
    keywords: ["render", "audio", "bounce"],
    enabled: anyClipPlaying,
    run: (ctx) => downloadWav(ctx.store.get(), ctx.session.clipChoice()),
  },
  {
    id: "project.exportMidi",
    group: "Project",
    title: "Export MIDI",
    keywords: ["mid", "smf"],
    enabled: anyClipPlaying,
    run: (ctx) => downloadMidi(ctx.store.get(), ctx.session.clipChoice()),
  },
];
