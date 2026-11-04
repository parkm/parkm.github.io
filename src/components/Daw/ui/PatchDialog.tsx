import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadBlob } from "../export/download";
import { deviceLabel, readPatch, writePatch } from "../export/patch";
import { replaceDevice } from "../model/deviceOps";
import type { Device, Id } from "../model/types";
import { useDaw } from "./context";

/**
 * A device's settings as editable text: copy them out (to save, share or
 * hand to an LLM), paste edited ones back, or load and save .txt files.
 */
export function PatchDialog({
  trackId,
  device,
  onClose,
}: {
  trackId: Id;
  device: Device;
  onClose: () => void;
}) {
  const { store } = useDaw();
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => writePatch(device));
  const [status, setStatus] = useState<{
    error?: string;
    problems: string[];
    note?: string;
  }>({ problems: [] });
  const label = deviceLabel(device.type);

  useLayoutEffect(() => {
    ref.current?.showModal();
  }, []);

  const apply = () => {
    const result = readPatch(text, device);
    if (!result.ok) {
      setStatus({ error: result.error, problems: result.problems });
      return;
    }
    store.update((d) => replaceDevice(d, trackId, device.id, result.device));
    if (result.problems.length === 0) onClose();
    else
      setStatus({
        note: "Applied. Some lines were skipped or adjusted:",
        problems: result.problems,
      });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ note: "Copied.", problems: [] });
    } catch {
      setStatus({
        error: "Couldn't copy; select the text instead.",
        problems: [],
      });
    }
  };

  const button =
    "h-7 rounded px-3 text-xs text-zinc-200 bg-zinc-700 hover:bg-zinc-600";

  // Portalled out of the device chain, whose CSS zoom would scale it.
  return createPortal(
    <dialog
      ref={ref}
      aria-label={`${label} settings`}
      className="m-auto h-[80vh] w-[min(42rem,calc(100vw-32px))] rounded-lg border border-zinc-700 bg-zinc-800 p-0 text-zinc-200 shadow-2xl backdrop:bg-black/50"
      onClose={onClose}
      // The dialog element itself is only hit on the backdrop.
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">{label} settings</h2>
          <span className="text-[11px] text-zinc-500">
            Edit, or paste settings copied from here, then Apply.
          </span>
        </div>
        <textarea
          aria-label={`${label} settings text`}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-200 outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
        {(status.error || status.note) && (
          <div className="max-h-28 overflow-y-auto text-[11px]">
            {status.error && <p className="text-red-400">{status.error}</p>}
            {status.note && <p className="text-zinc-300">{status.note}</p>}
            {status.problems.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-amber-300/90">
                {status.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={button}
            title="Copy this text to the clipboard"
            onClick={() => void copy()}
          >
            Copy
          </button>
          <button
            type="button"
            className={button}
            title="Download this text as a .txt file"
            onClick={() =>
              downloadBlob(
                new Blob([text], { type: "text/plain" }),
                `${label.toLowerCase().replace(/\s+/g, "-")}.txt`,
              )
            }
          >
            Save file
          </button>
          <button
            type="button"
            className={button}
            title="Load settings from a .txt file into the editor"
            onClick={() => fileRef.current?.click()}
          >
            Open file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) setText(await file.text());
            }}
          />
          <button
            type="button"
            className={button}
            title="Discard edits and show the device's current settings"
            onClick={() => {
              setText(writePatch(device));
              setStatus({ problems: [] });
            }}
          >
            Revert
          </button>
          <div className="flex-1" />
          <button type="button" className={button} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="h-7 rounded bg-amber-400 px-3 text-xs font-medium text-zinc-900 hover:bg-amber-300"
            title="Replace the device's settings with this text (undo with ⌘Z)"
            onClick={apply}
          >
            Apply
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
