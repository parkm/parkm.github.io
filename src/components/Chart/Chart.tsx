import { useCallback, useEffect, useState } from "react";
import { NuqsAdapter } from "nuqs/adapters/react";
import {
  useQueryState,
  parseAsInteger,
  parseAsString,
  createParser,
  parseAsBoolean,
} from "nuqs";
import { TextField } from "./ui/TextField";
import { SelectField } from "./ui/SelectField";
import { GrooveCenter } from "./GrooveCenter";
import { KeyCenter } from "./KeyCenter";
import { FormCenter, type FormBar } from "./FormCenter";
import { usePianoAudio } from "./hooks/usePianoAudio";
import { clamp } from "@/lib/utils";

const compactObjParser = createParser<{
  title: string;
  artist: string;
  key: string;
}>({
  parse: (value: string) => {
    try {
      const decoded = atob(value);
      const obj = JSON.parse(decoded);
      return {
        title: typeof obj?.title === "string" ? obj.title : "",
        artist: typeof obj?.artist === "string" ? obj.artist : "",
        key: typeof obj?.key === "string" ? obj.key : "C",
      };
    } catch {
      return { title: "", artist: "", key: "C" };
    }
  },
  serialize: (value) => btoa(JSON.stringify(value)),
}).withDefault({ title: "", artist: "", key: "C" });

const formBarsParser = createParser<FormBar[]>({
  parse: (value: string) => {
    try {
      const decoded = atob(value);
      const arr = JSON.parse(decoded);
      if (!Array.isArray(arr)) return [];
      return arr.filter(
        (item) =>
          typeof item?.id === "string" &&
          typeof item?.note === "string" &&
          typeof item?.duration === "number",
      );
    } catch {
      return [];
    }
  },
  serialize: (value) => btoa(JSON.stringify(value)),
}).withDefault([]);

const KEYS = [
  "C",
  "C#/Db",
  "D",
  "D#/Eb",
  "E",
  "F",
  "F#/Gb",
  "G",
  "G#/Ab",
  "A",
  "A#/Bb",
  "B",
];

function AppContent() {
  const [tempo, setTempo] = useQueryState(
    "bpm",
    parseAsInteger.withDefault(120),
  );
  const [timeSig, setTimeSig] = useQueryState(
    "time",
    parseAsString.withDefault("4/4"),
  );
  const [meta, setMeta] = useQueryState("m", compactObjParser);
  const [accentEnabled, setAccentEnabled] = useQueryState(
    "accent",
    parseAsBoolean.withDefault(true),
  );
  const [baseFrequency, setBaseFrequency] = useQueryState(
    "freq",
    parseAsInteger.withDefault(440),
  );
  const [formMode, setFormMode] = useQueryState(
    "formMode",
    parseAsString.withDefault("bass"),
  );
  const [formBars, setFormBars] = useQueryState("formBars", formBarsParser);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTonePlaying, setIsTonePlaying] = useState(false);
  const [lastKeyPlayed, setLastKeyPlayed] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { playNote, stopNote } = usePianoAudio(baseFrequency);

  const handleKeyPress = useCallback(
    (note: string, octave: number) => {
      const noteId = `${note}${octave}`;
      setActiveKey(noteId);
      playNote(note, octave);
      setLastKeyPlayed(noteId);
    },
    [playNote],
  );

  const handleKeyRelease = useCallback(() => {
    setActiveKey(null);
    stopNote();
  }, [stopNote]);

  const parseNoteAndOctave = useCallback((noteStr: string) => {
    const octave = parseInt(noteStr.slice(-1), 10);
    const note = noteStr.slice(0, -1);
    return { note, octave };
  }, []);

  const handleTonePlayToggle = useCallback(() => {
    if (isTonePlaying) {
      stopNote();
      setIsTonePlaying(false);
    } else {
      if (lastKeyPlayed) {
        const { note, octave } = parseNoteAndOctave(lastKeyPlayed);
        playNote(note, octave, true);
        setIsTonePlaying(true);
      }
    }
  }, [isTonePlaying, lastKeyPlayed, playNote, stopNote, parseNoteAndOctave]);

  useEffect(() => {
    if (isTonePlaying && lastKeyPlayed) {
      stopNote();
      const { note, octave } = parseNoteAndOctave(lastKeyPlayed);
      playNote(note, octave, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFrequency]);

  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute top-40 right-[-120px] h-[420px] w-[420px] rounded-full bg-indigo-500/8 blur-3xl" />
        <div className="absolute top-[600px] left-[-120px] h-[520px] w-[520px] rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-3 pb-20 pt-4">
        <GrooveCenter
          bpm={tempo}
          setBpm={(n) => setTempo(clamp(Math.round(n), 40, 300))}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          timeSig={timeSig}
          setTimeSig={setTimeSig}
          accentEnabled={accentEnabled}
          setAccentEnabled={setAccentEnabled}
        />

        <KeyCenter
          lastKeyPlayed={lastKeyPlayed}
          activeKey={activeKey}
          onKeyPress={handleKeyPress}
          onKeyRelease={handleKeyRelease}
          isTonePlaying={isTonePlaying}
          onTonePlayToggle={handleTonePlayToggle}
          baseFrequency={baseFrequency}
          onBaseFrequencyChange={setBaseFrequency}
        />

        <FormCenter
          lastKeyPlayed={lastKeyPlayed}
          mode={formMode as "bass" | "harmony"}
          onModeChange={(mode) => setFormMode(mode)}
          bars={formBars}
          onBarsChange={setFormBars}
        />

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField
            label="Title"
            value={meta.title}
            onChange={(v) => setMeta({ ...meta, title: v })}
            placeholder="Song title"
          />
          <TextField
            label="Artist"
            value={meta.artist}
            onChange={(v) => setMeta({ ...meta, artist: v })}
            placeholder="Artist"
          />
          <SelectField
            label="Key"
            value={meta.key}
            onChange={(v) => setMeta({ ...meta, key: v })}
            options={KEYS}
          />
        </div>

        <div className="mt-5">
          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to reset all data?")) {
                stopNote();
                setIsPlaying(false);
                setIsTonePlaying(false);
                window.history.replaceState({}, "", window.location.pathname);
                window.location.reload();
              }
            }}
            className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 hover:border-white/20"
          >
            Reset All Data
          </button>
        </div>
      </div>

      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}

export function Chart() {
  return (
    <NuqsAdapter>
      <AppContent />
    </NuqsAdapter>
  );
}
