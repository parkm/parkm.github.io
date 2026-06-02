import { useState, useEffect, useRef, useCallback } from "react";

type Note = {
  id: string;
  t: number;
  text: string;
};

type SerializedNote = { t: number; x: string };

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms}`;
}

function loadFromUrl(): {
  notes: Note[];
  fileName: string | null;
  fileSize: number | null;
} {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const notesRaw = params.get("notes");
  const fileName = params.get("fn");
  const fileSize = params.get("fs") ? Number(params.get("fs")) : null;
  let notes: Note[] = [];
  if (notesRaw) {
    try {
      const parsed: SerializedNote[] = JSON.parse(notesRaw);
      notes = parsed.map((n) => ({
        id: crypto.randomUUID(),
        t: n.t,
        text: n.x,
      }));
    } catch {
      // malformed — ignore
    }
  }
  return { notes, fileName, fileSize };
}

function saveToUrl(
  notes: Note[],
  fileName: string | null,
  fileSize: number | null,
) {
  const params = new URLSearchParams();
  if (notes.length > 0)
    params.set(
      "notes",
      JSON.stringify(notes.map((n) => ({ t: n.t, x: n.text }))),
    );
  if (fileName) params.set("fn", fileName);
  if (fileSize != null) params.set("fs", String(fileSize));
  const hash = params.toString();
  window.history.replaceState(
    null,
    "",
    hash ? `#${hash}` : window.location.pathname,
  );
}

export function VideoReviewer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [mismatchWarning, setMismatchWarning] = useState(false);

  useEffect(() => {
    const { notes: n, fileName: fn, fileSize: fs } = loadFromUrl();
    setNotes(n);
    setFileName(fn);
    setFileSize(fs);
  }, []);

  useEffect(() => {
    saveToUrl(notes, fileName, fileSize);
  }, [notes, fileName, fileSize]);

  function loadFile(file: File) {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    setBlobUrl(url);

    if (fileName && (fileName !== file.name || fileSize !== file.size)) {
      setMismatchWarning(true);
    } else {
      setMismatchWarning(false);
    }

    setFileName(file.name);
    setFileSize(file.size);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  }, []);

  function addNote() {
    const text = noteText.trim();
    if (!text || !videoRef.current) return;
    const t = videoRef.current.currentTime;
    const note: Note = { id: crypto.randomUUID(), t, text };
    setNotes((prev) => [...prev, note].sort((a, b) => a.t - b.t));
    setNoteText("");
    noteInputRef.current?.focus();
  }

  function seekTo(t: number) {
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  function deleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  function copyUrl() {
    navigator.clipboard.writeText(window.location.href);
  }

  return (
    <div className="flex flex-col min-h-screen lg:h-screen lg:overflow-hidden bg-neutral-950 text-neutral-100 p-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Video Reviewer</h1>
        {notes.length > 0 && (
          <button
            onClick={copyUrl}
            className="text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
          >
            Copy URL
          </button>
        )}
      </div>

      {!blobUrl && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          {fileName && (
            <p className="text-sm text-neutral-400 text-center">
              Notes loaded for{" "}
              <span className="text-neutral-200 font-medium">{fileName}</span>.
              Pick the same file to continue.
            </p>
          )}

          <label className="px-6 py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium transition-colors border border-neutral-700 cursor-pointer">
            Pick video file
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleInputChange}
            />
          </label>

          <p className="text-xs text-neutral-600 text-center max-w-xs">
            File stays local, nothing is uploaded. Notes live in the URL.
          </p>
        </div>
      )}

      {blobUrl && (
        <div className="flex flex-col lg:flex-row gap-4 flex-1 lg:overflow-hidden">
          <div className="flex flex-col gap-3 flex-1 min-w-0 lg:overflow-hidden">
            {mismatchWarning && (
              <div className="text-xs px-3 py-2 rounded bg-yellow-900/40 border border-yellow-700 text-yellow-300 shrink-0">
                This file doesn't match the original ({fileName}). Notes may be
                out of sync.
              </div>
            )}

            <div className="lg:flex-1 lg:min-h-0">
              <video
                ref={videoRef}
                src={blobUrl}
                controls
                className="w-full lg:h-full lg:object-contain rounded-lg bg-black"
                onTimeUpdate={handleTimeUpdate}
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-neutral-500 shrink-0">
              <span className="font-mono">{fileName}</span>
              <span>·</span>
              <span className="font-mono">{formatTime(currentTime)}</span>
              <label className="ml-auto text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer">
                Change file
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </label>
            </div>

            <div className="flex gap-2 shrink-0">
              <input
                ref={noteInputRef}
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNote()}
                placeholder="Note at current timestamp…"
                className="flex-1 px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
              />
              <button
                onClick={addNote}
                disabled={!noteText.trim()}
                className="px-4 py-2 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-sm font-medium transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          <div className="lg:w-72 flex flex-col gap-2 lg:overflow-hidden">
            <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              Notes ({notes.length})
            </div>

            {notes.length === 0 && (
              <p className="text-xs text-neutral-600 italic">
                No notes yet. Pause the video and add one above.
              </p>
            )}

            <div className="flex flex-col gap-1 overflow-y-auto max-h-[60vh] lg:max-h-none lg:flex-1">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="flex items-start gap-2 px-3 py-2 rounded bg-neutral-900 border border-neutral-800 group"
                >
                  <button
                    onClick={() => seekTo(note.t)}
                    className="font-mono text-xs text-blue-400 hover:text-blue-300 shrink-0 pt-0.5 transition-colors"
                  >
                    {formatTime(note.t)}
                  </button>
                  <span className="text-sm text-neutral-200 flex-1 leading-snug">
                    {note.text}
                  </span>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs shrink-0 pt-0.5"
                    aria-label="Delete note"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
