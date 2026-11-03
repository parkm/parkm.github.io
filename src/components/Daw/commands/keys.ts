/**
 * Keyboard shortcuts as strings like "mod+shift+z": modifiers in a fixed
 * order (mod, alt, shift) then the key. Keys come from `event.code`, so they
 * don't change with keyboard layout or Shift.
 */

const MODIFIERS = ["mod", "alt", "shift"] as const;

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "Shift+Mod+Z" → "mod+shift+z" */
export function normalizeShortcut(spec: string) {
  const parts = spec.toLowerCase().split("+");
  const key = parts.pop()!;
  const mods = MODIFIERS.filter((m) => parts.includes(m));
  return [...mods, key].join("+");
}

const CODE_KEYS: Record<string, string> = {
  Space: "space",
  Escape: "escape",
  Enter: "enter",
  Backspace: "backspace",
  Delete: "delete",
  Tab: "tab",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** The shortcut string for a key event, or null for a lone modifier. */
export function eventShortcut(e: KeyboardEvent): string | null {
  const key = e.code.startsWith("Key")
    ? e.code.slice(3).toLowerCase()
    : e.code.startsWith("Digit")
      ? e.code.slice(5)
      : CODE_KEYS[e.code];
  if (!key) return null;
  const mods = [
    e.metaKey || e.ctrlKey ? "mod" : null,
    e.altKey ? "alt" : null,
    e.shiftKey ? "shift" : null,
  ].filter(Boolean);
  return [...mods, key].join("+");
}

const SYMBOLS: Record<string, string> = {
  space: "Space",
  escape: "Esc",
  enter: "↵",
  backspace: "⌫",
  delete: "⌦",
  tab: "Tab",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

/** "mod+shift+z" → "⌘⇧Z" on Mac, "Ctrl+Shift+Z" elsewhere. */
export function formatShortcut(spec: string) {
  const parts = normalizeShortcut(spec).split("+");
  const key = parts.pop()!;
  const keyLabel = SYMBOLS[key] ?? key.toUpperCase();
  if (isMac) {
    const mac: Record<string, string> = { mod: "⌘", alt: "⌥", shift: "⇧" };
    return parts.map((m) => mac[m]).join("") + keyLabel;
  }
  const other: Record<string, string> = {
    mod: "Ctrl",
    alt: "Alt",
    shift: "Shift",
  };
  return [...parts.map((m) => other[m]), keyLabel].join("+");
}
