import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { formatShortcut } from "../commands/keys";
import { getCommand } from "../commands/registry";
import {
  commandTitle,
  isAvailable,
  isEnabled,
  type CommandContext,
} from "../commands/types";
import { useDaw } from "./context";

/**
 * Connects commands to React: buttons and menus refer to a command by id and
 * get its title, shortcut, enabled state and action from the one definition.
 */

export type Commands = {
  /** A fresh context for running or checking commands. */
  context: () => CommandContext;
  run: (id: string) => void | Promise<void>;
  /** Call when UI state commands depend on changes (selection, focus). */
  notify: () => void;
  subscribe: (listener: () => void) => () => void;
};

export function createCommands(context: () => CommandContext): Commands {
  const listeners = new Set<() => void>();
  return {
    context,
    run(id) {
      const cmd = getCommand(id);
      const ctx = context();
      if (isEnabled(cmd, ctx)) return cmd.run(ctx);
    },
    notify: () => listeners.forEach((l) => l()),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const CommandsContext = createContext<Commands | null>(null);

export function CommandsProvider({
  commands,
  children,
}: {
  commands: Commands;
  children: ReactNode;
}) {
  return <CommandsContext value={commands}>{children}</CommandsContext>;
}

export function useCommands() {
  const commands = useContext(CommandsContext);
  if (!commands) throw new Error("useCommands needs a <CommandsProvider>");
  return commands;
}

export type CommandState = {
  title: string;
  /** Formatted first shortcut, e.g. "⌘D". */
  shortcut: string | null;
  available: boolean;
  enabled: boolean;
  run: () => void | Promise<void>;
};

/**
 * A command's current title and state. Re-renders only when those change:
 * after document edits, transport changes, or a workspace notify().
 */
export function useCommand(id: string): CommandState {
  const commands = useCommands();
  const { store, session } = useDaw();
  const cmd = getCommand(id);

  const snapshot = () => {
    const ctx = commands.context();
    return [
      isAvailable(cmd, ctx) ? 1 : 0,
      isEnabled(cmd, ctx) ? 1 : 0,
      commandTitle(cmd, ctx),
    ].join("|");
  };
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubs = [
        store.subscribe(listener),
        session.subscribe(listener),
        commands.subscribe(listener),
      ];
      return () => unsubs.forEach((u) => u());
    },
    [store, session, commands],
  );
  const [available, enabled, ...title] = useSyncExternalStore(
    subscribe,
    snapshot,
  ).split("|");

  return {
    title: title.join("|"),
    shortcut: cmd.keys?.[0] ? formatShortcut(cmd.keys[0]) : null,
    available: available === "1",
    enabled: enabled === "1",
    run: () => commands.run(id),
  };
}

/** Props for a button that runs a command: label with shortcut, disabled state, click. */
export function useCommandButton(id: string) {
  const cmd = useCommand(id);
  const [pending, setPending] = useState(false);
  const label = cmd.shortcut ? `${cmd.title} (${cmd.shortcut})` : cmd.title;
  return {
    title: label,
    "aria-label": label,
    disabled: !cmd.enabled || pending,
    onClick: async () => {
      const result = cmd.run();
      if (!(result instanceof Promise)) return;
      // Long actions (rendering audio) disable their button until done.
      setPending(true);
      try {
        await result;
      } finally {
        setPending(false);
      }
    },
  };
}
