/**
 * Import / export. The format is plain JSON — human-readable but condensed
 * (2-space indent, no redundant wrapping). A small version field lets future
 * releases migrate older exports.
 */

import type { Counter, ExportPayload, HistoryEntry, Stack } from "./types";
import { nowISO } from "./helpers";

export const EXPORT_VERSION = 1;

export function buildExport(
  counters: Counter[],
  stacks: Stack[],
  history: HistoryEntry[],
): ExportPayload {
  return {
    app: "counters",
    version: EXPORT_VERSION,
    exportedAt: nowISO(),
    counters,
    stacks,
    history,
  };
}

export function serialize(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export class ImportError extends Error {}

/**
 * Parse and validate an exported file. Throws ImportError with a friendly
 * message on anything malformed so the UI can surface it directly.
 */
export function parseImport(text: string): ExportPayload {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("That doesn't look like valid JSON.");
  }

  if (!data || typeof data !== "object") {
    throw new ImportError("Expected an object at the top level.");
  }

  const obj = data as Partial<ExportPayload>;
  if (obj.app !== "counters") {
    throw new ImportError("This file isn't a Counters export.");
  }
  if (!Array.isArray(obj.counters)) {
    throw new ImportError("Missing the “counters” list.");
  }

  return {
    app: "counters",
    version: typeof obj.version === "number" ? obj.version : EXPORT_VERSION,
    exportedAt: obj.exportedAt ?? nowISO(),
    counters: obj.counters as Counter[],
    stacks: Array.isArray(obj.stacks) ? (obj.stacks as Stack[]) : [],
    history: Array.isArray(obj.history) ? (obj.history as HistoryEntry[]) : [],
  };
}

/** Trigger a browser download of the export text. */
export function downloadExport(text: string): void {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `counters-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
