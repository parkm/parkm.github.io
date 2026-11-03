import {
  addTrack,
  createClip,
  deleteClip,
  deleteScene,
  deleteTrack,
  duplicateClip,
  insertScene,
  placeClip,
  TRACK_KINDS,
  updateTrackFields,
  type TrackKind,
} from "../model/sessionOps";
import type { Command, CommandContext } from "./types";

/** The session grid: clips in slots, scenes, and tracks. */

const hasClip = (ctx: CommandContext) => !!ctx.track && !!ctx.clip;

/** Move the slot selection by whole tracks/scenes, staying in the grid. */
function moveSelection(ctx: CommandContext, tracks: number, scenes: number) {
  const doc = ctx.store.get();
  if (!ctx.track) return;
  const col = doc.tracks.findIndex((t) => t.id === ctx.track!.id);
  const next =
    doc.tracks[Math.min(doc.tracks.length - 1, Math.max(0, col + tracks))];
  const scene = Math.min(
    doc.scenes.length - 1,
    Math.max(0, ctx.scene + scenes),
  );
  ctx.workspace.select({ trackId: next.id, scene });
}

const arrow = (
  key: "up" | "down" | "left" | "right",
  tracks: number,
  scenes: number,
): Command => ({
  id: `session.select${key[0].toUpperCase()}${key.slice(1)}`,
  group: "Session",
  title: `Select slot ${key}`,
  keys: [key],
  scope: "session",
  repeat: true,
  when: (ctx) => !!ctx.track,
  run: (ctx) => moveSelection(ctx, tracks, scenes),
});

export const sessionCommands: Command[] = [
  {
    id: "session.launchClip",
    group: "Session",
    title: "Launch clip",
    keys: ["enter"],
    scope: "session",
    when: hasClip,
    run: (ctx) => ctx.session.launch(ctx.track!.id, ctx.clip!.id),
  },
  {
    id: "session.launchScene",
    group: "Session",
    title: (ctx) => `Launch scene ${ctx.scene + 1}`,
    keywords: ["row"],
    run: (ctx) => ctx.session.launchScene(ctx.scene),
  },
  {
    id: "session.createClip",
    group: "Session",
    title: "Create clip in selected slot",
    keywords: ["new", "empty"],
    when: (ctx) => !!ctx.track && !ctx.clip,
    run: (ctx) => {
      ctx.store.update((d) => createClip(d, ctx.track!.id, ctx.scene));
      ctx.workspace.setDetail("clip");
    },
  },
  {
    id: "session.duplicateClip",
    group: "Session",
    title: "Duplicate clip",
    keys: ["mod+d"],
    scope: "session",
    when: hasClip,
    run: (ctx) => {
      let scene = ctx.scene;
      ctx.store.update((d) => {
        const result = duplicateClip(d, ctx.track!.id, ctx.scene);
        scene = result.scene;
        return result.doc;
      });
      ctx.workspace.select({ trackId: ctx.track!.id, scene });
    },
  },
  {
    id: "session.deleteClip",
    group: "Session",
    title: "Delete clip",
    keys: ["backspace", "delete"],
    scope: "session",
    when: hasClip,
    run: (ctx) =>
      ctx.store.update((d) => deleteClip(d, ctx.track!.id, ctx.scene)),
  },
  {
    id: "session.copyClip",
    group: "Session",
    title: "Copy clip",
    keys: ["mod+c"],
    scope: "session",
    when: hasClip,
    run: (ctx) => {
      ctx.workspace.clipClipboard.current = ctx.clip;
    },
  },
  {
    id: "session.pasteClip",
    group: "Session",
    title: "Paste clip",
    keys: ["mod+v"],
    scope: "session",
    when: (ctx) => !!ctx.track,
    enabled: (ctx) => !!ctx.workspace.clipClipboard.current,
    run: (ctx) => {
      const clip = ctx.workspace.clipClipboard.current!;
      ctx.store.update((d) =>
        placeClip(d, clip, { trackId: ctx.track!.id, scene: ctx.scene }),
      );
    },
  },
  {
    id: "session.renameClip",
    group: "Session",
    title: "Rename clip",
    keys: ["mod+r"],
    scope: "session",
    when: hasClip,
    run: (ctx) => ctx.workspace.rename(ctx.clip!.id),
  },
  arrow("up", 0, -1),
  arrow("down", 0, 1),
  arrow("left", -1, 0),
  arrow("right", 1, 0),
  {
    id: "session.insertScene",
    group: "Session",
    title: "Insert scene below",
    keywords: ["row", "add"],
    run: (ctx) => ctx.store.update((d) => insertScene(d, ctx.scene + 1)),
  },
  {
    id: "session.deleteScene",
    group: "Session",
    title: (ctx) => `Delete scene ${ctx.scene + 1}`,
    keywords: ["row", "remove"],
    enabled: (ctx) => ctx.store.get().scenes.length > 1,
    run: (ctx) => ctx.store.update((d) => deleteScene(d, ctx.scene)),
  },
];

const addTrackCommand = (kind: TrackKind): Command => ({
  id: `track.add.${kind}`,
  group: "Track",
  title: `Add ${TRACK_KINDS[kind]} track`,
  keywords: ["new", "instrument"],
  run: (ctx) => ctx.store.update((d) => addTrack(d, kind)),
});

const hasTrack = (ctx: CommandContext) => !!ctx.track;

export const trackCommands: Command[] = [
  addTrackCommand("drums"),
  addTrackCommand("quickSynth"),
  addTrackCommand("synth"),
  {
    id: "track.rename",
    group: "Track",
    title: "Rename track",
    keys: ["mod+r"],
    when: hasTrack,
    run: (ctx) => ctx.workspace.rename(ctx.track!.id),
  },
  {
    id: "track.mute",
    group: "Track",
    title: (ctx) => (ctx.track?.mute ? "Unmute track" : "Mute track"),
    when: hasTrack,
    run: (ctx) =>
      ctx.store.update((d) =>
        updateTrackFields(d, ctx.track!.id, { mute: !ctx.track!.mute }),
      ),
  },
  {
    id: "track.solo",
    group: "Track",
    title: (ctx) => (ctx.track?.solo ? "Unsolo track" : "Solo track"),
    when: hasTrack,
    run: (ctx) =>
      ctx.store.update((d) =>
        updateTrackFields(d, ctx.track!.id, { solo: !ctx.track!.solo }),
      ),
  },
  {
    id: "track.stop",
    group: "Track",
    title: "Stop track",
    when: hasTrack,
    run: (ctx) => ctx.session.launch(ctx.track!.id, null),
  },
  {
    id: "track.delete",
    group: "Track",
    title: (ctx) => `Delete track “${ctx.track?.name}”`,
    keywords: ["remove"],
    when: hasTrack,
    run: (ctx) => ctx.store.update((d) => deleteTrack(d, ctx.track!.id)),
  },
];
