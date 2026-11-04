import {
  canCrop,
  clearRow,
  cropClip,
  doubleClip,
  halveClip,
  humanizeRow,
  quantizeNotes,
  randomizeRow,
  loopEndOf,
  loopStartOf,
  setLoop,
  shiftClip,
  shiftRow,
} from "../model/ops";
import { formatBeatTime, PPQ } from "../model/time";
import { quantizeOptions } from "../ui/editorSettings";
import { insertMarker } from "../ui/insertMarker";
import type { Command, CommandContext } from "./types";

/** The selected clip as a whole: its loop, timing, and (drums) rows. */

const hasClip = (ctx: CommandContext) => !!ctx.clip;

/**
 * Where the Set buttons put a loop marker: the insert marker (click the
 * ruler to place it). With no marker, the play position snapped down to the
 * grid, so Set still works while listening.
 */
export function setPoint(ctx: CommandContext): number | null {
  const clip = ctx.clip;
  if (!clip || !ctx.track) return null;
  const marker = insertMarker.get(clip.id);
  if (marker !== null) return marker;
  const rel = ctx.session.clipPosition(ctx.track.id, clip.id, clip.length);
  return rel === null
    ? null
    : loopStartOf(clip) + Math.floor(rel / ctx.grid) * ctx.grid;
}

const pointLabel = (ctx: CommandContext, tick: number | null) =>
  tick === null
    ? "insert marker"
    : formatBeatTime(tick, ctx.store.get().timeSignature, "position");

export const clipCommands: Command[] = [
  {
    id: "clip.quantize",
    group: "Clip",
    title: (ctx) =>
      ctx.editor?.hasSelection() ? "Quantize selected notes" : "Quantize clip",
    keys: ["mod+u"],
    scope: "detail",
    keywords: ["snap", "grid", "timing"],
    when: hasClip,
    run: (ctx) => {
      // The piano roll quantizes its selection; otherwise the whole clip.
      if (ctx.editor) ctx.editor.quantize();
      else
        ctx.store.update((d) =>
          quantizeNotes(
            d,
            ctx.clip!.id,
            ctx.grid,
            undefined,
            quantizeOptions(),
          ),
        );
    },
  },
  {
    id: "clip.doubleLoop",
    group: "Clip",
    title: "Double loop",
    keys: ["mod+d"],
    scope: "detail",
    keywords: ["duplicate", "x2", "repeat"],
    when: hasClip,
    run: (ctx) => ctx.store.update((d) => doubleClip(d, ctx.clip!.id)),
  },
  {
    id: "clip.halveLoop",
    group: "Clip",
    title: "Halve loop",
    keywords: ["/2", "shorter"],
    when: hasClip,
    run: (ctx) => ctx.store.update((d) => halveClip(d, ctx.clip!.id, PPQ)),
  },
  {
    id: "clip.crop",
    group: "Clip",
    title: "Crop to loop",
    keywords: ["trim"],
    when: hasClip,
    enabled: (ctx) => !!ctx.clip && canCrop(ctx.clip),
    run: (ctx) => ctx.store.update((d) => cropClip(d, ctx.clip!.id)),
  },
  {
    id: "clip.rotateEarlier",
    group: "Clip",
    title: "Move clip earlier one step",
    keywords: ["rotate", "shift", "nudge", "downbeat"],
    when: hasClip,
    run: (ctx) =>
      ctx.store.update((d) => shiftClip(d, ctx.clip!.id, -ctx.grid)),
  },
  {
    id: "clip.rotateLater",
    group: "Clip",
    title: "Move clip later one step",
    keywords: ["rotate", "shift", "nudge", "downbeat"],
    when: hasClip,
    run: (ctx) => ctx.store.update((d) => shiftClip(d, ctx.clip!.id, ctx.grid)),
  },
  {
    id: "clip.setLoopStart",
    group: "Clip",
    title: (ctx) => `Set loop start to ${pointLabel(ctx, setPoint(ctx))}`,
    keywords: ["position", "marker", "brace"],
    when: hasClip,
    enabled: (ctx) => {
      const t = setPoint(ctx);
      return t !== null && t !== loopStartOf(ctx.clip!);
    },
    // Moves the loop, keeping its length.
    run: (ctx) => {
      const t = setPoint(ctx);
      if (t !== null)
        ctx.store.update((d) => setLoop(d, ctx.clip!.id, t, ctx.clip!.length));
    },
  },
  {
    id: "clip.setLoopEnd",
    group: "Clip",
    title: (ctx) => `Set loop end to ${pointLabel(ctx, setPoint(ctx))}`,
    keywords: ["length", "marker", "brace"],
    when: hasClip,
    enabled: (ctx) => {
      const t = setPoint(ctx);
      return (
        t !== null && t > loopStartOf(ctx.clip!) && t !== loopEndOf(ctx.clip!)
      );
    },
    run: (ctx) => {
      const t = setPoint(ctx);
      const start = loopStartOf(ctx.clip!);
      if (t !== null && t > start)
        ctx.store.update((d) => setLoop(d, ctx.clip!.id, start, t - start));
    },
  },
];

// Drum rows: the selected pad's row in the step grid.

const inSteps = (ctx: CommandContext) =>
  !!ctx.clip && !!ctx.pad && ctx.view === "steps";

/** How busy "randomize" makes a row, by voice. */
const DENSITY: Record<string, number> = {
  kick: 0.25,
  snare: 0.15,
  hat: 0.55,
  clap: 0.12,
};

const rowCommand = (
  id: string,
  title: string,
  edit: (ctx: CommandContext, pitch: number) => void,
  keywords: string[] = [],
): Command => ({
  id: `drums.${id}`,
  group: "Drums",
  title: (ctx) => `${title} (${ctx.pad?.name ?? "row"})`,
  keywords: ["row", "pad", ...keywords],
  when: inSteps,
  run: (ctx) => edit(ctx, ctx.pad!.pitch),
});

/** Pick the pad above or below in the step grid. */
function stepPad(ctx: CommandContext, by: number) {
  const pads = ctx.track?.devices.find((d) => d.type === "drumKit")?.pads ?? [];
  const i = pads.findIndex((p) => p.id === ctx.pad?.id);
  const next = pads[Math.min(pads.length - 1, Math.max(0, i + by))];
  if (next) ctx.workspace.selectPad(next.id);
}

export const drumCommands: Command[] = [
  rowCommand("shiftLeft", "Shift row left", (ctx, p) =>
    ctx.store.update((d) => shiftRow(d, ctx.clip!.id, p, -ctx.grid)),
  ),
  rowCommand("shiftRight", "Shift row right", (ctx, p) =>
    ctx.store.update((d) => shiftRow(d, ctx.clip!.id, p, ctx.grid)),
  ),
  rowCommand(
    "humanize",
    "Humanize row",
    (ctx, p) => ctx.store.update((d) => humanizeRow(d, ctx.clip!.id, p)),
    ["feel", "random"],
  ),
  rowCommand(
    "randomize",
    "Randomize row",
    (ctx, p) =>
      ctx.store.update((d) =>
        randomizeRow(
          d,
          ctx.clip!.id,
          p,
          ctx.grid,
          DENSITY[ctx.pad!.voice] ?? 0.2,
        ),
      ),
    ["generate", "dice"],
  ),
  rowCommand(
    "clear",
    "Clear row",
    (ctx, p) => ctx.store.update((d) => clearRow(d, ctx.clip!.id, p)),
    ["erase"],
  ),
  {
    id: "drums.padUp",
    group: "Drums",
    title: "Select pad above",
    keys: ["up"],
    scope: "detail",
    repeat: true,
    when: inSteps,
    run: (ctx) => stepPad(ctx, -1),
  },
  {
    id: "drums.padDown",
    group: "Drums",
    title: "Select pad below",
    keys: ["down"],
    scope: "detail",
    repeat: true,
    when: inSteps,
    run: (ctx) => stepPad(ctx, 1),
  },
];
