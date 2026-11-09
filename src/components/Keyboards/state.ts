import { clamp } from "@/lib/utils";
import { MAX_OCTAVE, MIN_OCTAVE, normalizeKeys } from "./notes";

export type Section = { id: number; label: string; keys: string[] };
export type Size = "s" | "m" | "l";

export type Settings = {
  startOctave: number;
  octaves: number;
  volume: number;
  size: Size;
};

export const MAX_OCTAVES = 7;
const DEFAULT_SETTINGS: Settings = {
  startOctave: 3,
  octaves: 3,
  volume: 0.1,
  size: "m",
};

/** Keep the visible range inside the notes the synth can play (C0–B8). */
export function clampRange(startOctave: number, octaves: number) {
  const start = clamp(Math.round(startOctave), MIN_OCTAVE, MAX_OCTAVE);
  const count = clamp(
    Math.round(octaves),
    1,
    Math.min(MAX_OCTAVES, MAX_OCTAVE - start + 1),
  );
  return { startOctave: start, octaves: count };
}

// ---------- URL (de)serialization ----------
// `sections` is base64 JSON, same as the original format so old links load.
// Encoding goes through UTF-8 so labels like "C♯m" don't crash btoa.

function encodeSections(sections: Section[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(sections));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function decodeSections(value: string): Section[] | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(data)) return null;
    const usedIds = new Set<number>();
    const sections = data
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s, i) => {
        let id = typeof s.id === "number" ? s.id : i;
        while (usedIds.has(id)) id++;
        usedIds.add(id);
        return {
          id,
          label: typeof s.label === "string" ? s.label : "",
          keys: normalizeKeys(s.keys),
        };
      });
    return sections.length ? sections : null;
  } catch {
    return null;
  }
}

export function readUrl(): { sections: Section[]; settings: Settings } {
  const params = new URLSearchParams(window.location.search);
  const num = (name: string, fallback: number) => {
    const n = parseFloat(params.get(name) ?? "");
    return Number.isFinite(n) ? n : fallback;
  };
  const size = params.get("size");
  return {
    sections: decodeSections(params.get("sections") ?? "") ?? [
      { id: 0, label: "", keys: [] },
    ],
    settings: {
      ...clampRange(
        num("start", DEFAULT_SETTINGS.startOctave),
        num("octaves", DEFAULT_SETTINGS.octaves),
      ),
      volume: clamp(num("vol", DEFAULT_SETTINGS.volume), 0, 1),
      size: size === "s" || size === "l" ? size : "m",
    },
  };
}

export function writeUrl(sections: Section[], settings: Settings) {
  const params = new URLSearchParams(window.location.search);
  const set = (name: string, value: string, fallback: string) => {
    if (value === fallback) params.delete(name);
    else params.set(name, value);
  };
  const isBlank =
    sections.length === 1 && !sections[0].label && !sections[0].keys.length;
  if (isBlank) params.delete("sections");
  else params.set("sections", encodeSections(sections));
  set("vol", String(settings.volume), String(DEFAULT_SETTINGS.volume));
  set("octaves", String(settings.octaves), String(DEFAULT_SETTINGS.octaves));
  set(
    "start",
    String(settings.startOctave),
    String(DEFAULT_SETTINGS.startOctave),
  );
  set("size", settings.size, DEFAULT_SETTINGS.size);
  const query = params.toString();
  const url = window.location.pathname + (query ? `?${query}` : "");
  if (url !== window.location.pathname + window.location.search) {
    window.history.replaceState(window.history.state, "", url);
  }
}

// ---------- Sections reducer with undo/redo ----------

export type History = {
  past: Section[][];
  present: Section[];
  future: Section[][];
  /** Consecutive label edits on one card collapse into a single undo step. */
  lastEdit: string | null;
};

export type Action =
  | { type: "toggleKey"; id: number; key: string }
  | {
      type: "setKeys";
      id: number;
      keys: string[];
      /** Consecutive setKeys with the same group collapse into one undo step. */
      undoGroup?: string;
    }
  | { type: "setLabel"; id: number; label: string }
  | { type: "add" }
  | { type: "duplicate"; id: number }
  | { type: "remove"; id: number }
  | { type: "move"; from: number; to: number }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 200;

const nextId = (sections: Section[]) =>
  sections.reduce((max, s) => Math.max(max, s.id), -1) + 1;

function apply(sections: Section[], action: Action): Section[] {
  const update = (id: number, fn: (s: Section) => Section) =>
    sections.map((s) => (s.id === id ? fn(s) : s));

  switch (action.type) {
    case "toggleKey":
      return update(action.id, (s) => ({
        ...s,
        keys: s.keys.includes(action.key)
          ? s.keys.filter((k) => k !== action.key)
          : normalizeKeys([...s.keys, action.key]),
      }));
    case "setKeys":
      return update(action.id, (s) => ({
        ...s,
        keys: normalizeKeys(action.keys),
      }));
    case "setLabel":
      return update(action.id, (s) => ({ ...s, label: action.label }));
    case "add":
      return [...sections, { id: nextId(sections), label: "", keys: [] }];
    case "duplicate": {
      const index = sections.findIndex((s) => s.id === action.id);
      if (index === -1) return sections;
      const copy = { ...sections[index], id: nextId(sections) };
      return [
        ...sections.slice(0, index + 1),
        copy,
        ...sections.slice(index + 1),
      ];
    }
    case "remove":
      if (sections.length <= 1) return sections;
      return sections.filter((s) => s.id !== action.id);
    case "move": {
      const next = [...sections];
      const [item] = next.splice(action.from, 1);
      next.splice(action.to, 0, item);
      return next;
    }
    default:
      return sections;
  }
}

export function historyReducer(state: History, action: Action): History {
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1],
      future: [state.present, ...state.future],
      lastEdit: null,
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
      lastEdit: null,
    };
  }

  const present = apply(state.present, action);
  if (present === state.present) return state;

  const editKey =
    action.type === "setLabel"
      ? `label:${action.id}`
      : action.type === "setKeys" && action.undoGroup
        ? `keys:${action.id}:${action.undoGroup}`
        : null;
  if (editKey && editKey === state.lastEdit) {
    return { ...state, present, future: [] };
  }
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
    lastEdit: editKey,
  };
}
