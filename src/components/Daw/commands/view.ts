import type { Command, CommandContext } from "./types";

/** What the detail area shows. */

const isDrumTrack = (ctx: CommandContext) =>
  ctx.track?.devices[0]?.type === "drumKit";

export const viewCommands: Command[] = [
  {
    id: "view.toggleDetail",
    group: "View",
    title: (ctx) => (ctx.detail === "clip" ? "Show devices" : "Show clip"),
    keys: ["shift+tab"],
    keywords: ["switch", "panel", "instrument", "effects", "editor"],
    run: (ctx) =>
      ctx.workspace.setDetail(ctx.detail === "clip" ? "devices" : "clip"),
  },
  {
    id: "view.stepEditor",
    group: "View",
    title: "Edit as steps",
    keywords: ["step sequencer", "grid", "drums"],
    when: (ctx) => isDrumTrack(ctx) && ctx.view !== "steps",
    run: (ctx) => {
      ctx.workspace.setView("steps");
      ctx.workspace.setDetail("clip");
    },
  },
  {
    id: "view.noteEditor",
    group: "View",
    title: "Edit as notes",
    keywords: ["piano roll"],
    when: (ctx) => isDrumTrack(ctx) && ctx.view !== "roll",
    run: (ctx) => {
      ctx.workspace.setView("roll");
      ctx.workspace.setDetail("clip");
    },
  },
];
