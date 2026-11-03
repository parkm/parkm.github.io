import { eventShortcut, normalizeShortcut } from "./keys";
import { clipCommands, drumCommands } from "./clip";
import { noteCommands } from "./notes";
import { sessionCommands, trackCommands } from "./session";
import { editCommands, projectCommands, transportCommands } from "./transport";
import { isEnabled, type Command, type CommandContext } from "./types";
import { viewCommands } from "./view";

/**
 * Every command, in priority order: when several share a shortcut, the
 * first that applies wins. So list contextual commands (selected notes,
 * a drum row) before general ones (the clip, the session). ⌘D, for
 * example, duplicates selected notes, else doubles the loop (clip area),
 * else duplicates the clip (session).
 */
export const COMMANDS: readonly Command[] = [
  ...noteCommands,
  ...drumCommands,
  ...clipCommands,
  ...sessionCommands,
  ...trackCommands,
  ...viewCommands,
  ...transportCommands,
  ...editCommands,
  ...projectCommands,
].map((cmd) => ({ ...cmd, keys: cmd.keys?.map(normalizeShortcut) }));

const byId = new Map(COMMANDS.map((cmd) => [cmd.id, cmd]));

if (byId.size !== COMMANDS.length) {
  throw new Error("Duplicate command id");
}

export function getCommand(id: string): Command {
  const cmd = byId.get(id);
  if (!cmd) throw new Error(`Unknown command: ${id}`);
  return cmd;
}

/** The command a key press should run here, if any. */
export function findCommand(
  e: KeyboardEvent,
  ctx: CommandContext,
): Command | null {
  const shortcut = eventShortcut(e);
  if (!shortcut) return null;
  for (const cmd of COMMANDS) {
    if (!cmd.keys?.includes(shortcut)) continue;
    if (cmd.scope && cmd.scope !== ctx.focus) continue;
    if (e.repeat && !cmd.repeat) continue;
    if (isEnabled(cmd, ctx)) return cmd;
  }
  return null;
}
