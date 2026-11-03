import type { ClipChoice } from "../engine/schedule";
import { renderLoop } from "../engine/render";
import type { Project } from "../model/types";
import { encodeMidi } from "./midi";
import { encodeWav } from "./wav";

/** Save a blob through the browser's download. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const baseName = (doc: Project) => `beat-${Math.round(doc.bpm)}bpm`;

/** Render the playing clips as one seamless loop (24-bit WAV) and download it. */
export async function downloadWav(doc: Project, clips: ClipChoice) {
  const buffer = await renderLoop(doc, { clips });
  downloadBlob(encodeWav(buffer), `${baseName(doc)}.wav`);
}

/** Download the playing clips as a Standard MIDI File. */
export function downloadMidi(doc: Project, clips: ClipChoice) {
  const bytes = encodeMidi(doc, clips);
  downloadBlob(
    new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" }),
    `${baseName(doc)}.mid`,
  );
}
