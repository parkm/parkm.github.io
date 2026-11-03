import { useSyncExternalStore } from "react";

/**
 * Note-editor preferences shared by the piano roll, the clip bar and
 * shortcuts. Not part of the document (no undo), kept for the session.
 */
export type EditorSettings = {
  /** Select: drag to box-select, double-click to add. Draw: click to add, drag to set length. */
  tool: "select" | "draw";
  /** 0..1 */
  quantizeAmount: number;
  quantizeEnds: boolean;
  /** Show only rows that have notes (or drum pads). */
  fold: boolean;
};

let settings: EditorSettings = {
  tool: "select",
  quantizeAmount: 1,
  quantizeEnds: false,
  fold: false,
};
const listeners = new Set<() => void>();

export const editorSettings = {
  get: () => settings,
  set(patch: Partial<EditorSettings>) {
    settings = { ...settings, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useEditorSettings = () =>
  useSyncExternalStore(editorSettings.subscribe, editorSettings.get);

/** Quantize options from the current settings. */
export const quantizeOptions = () => ({
  amount: settings.quantizeAmount,
  ends: settings.quantizeEnds,
});
