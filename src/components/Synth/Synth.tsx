import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Tone from "tone";
import { isPlayableKey, noteFromKey, MAX_VEL } from "./utils";
import { KeyPiano } from "./KeyPiano";
import { useComputerKeyboard } from "./useKeyboard";
import { Piano } from "./Piano";

const Badge = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center rounded-full border border-zinc-300/70 bg-white/60 px-2.5 py-0.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur">
    {children}
  </span>
);

export function Synth() {
  const [audioReady, setAudioReady] = useState(false);
  const [octave, setOctave] = useState(3);
  const [velocity, setVelocity] = useState(100);
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const [activeNotes, setActiveNotes] = useState<string[]>([]);

  const synthRef = useRef<Tone.PolySynth<Tone.Synth> | null>(null);
  const mountedRef = useRef(false);
  const activeNotesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const poly = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.45, release: 0.8 },
    });
    const reverb = new Tone.Reverb({ decay: 2.6, wet: 0.25 });
    poly.connect(reverb);
    reverb.toDestination();

    synthRef.current = poly;

    return () => {
      synthRef.current?.releaseAll();
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  const initAudio = useCallback(async () => {
    await Tone.start();
    setAudioReady(true);
  }, []);

  const triggerAttack = useCallback((noteName: string, vel: number) => {
    synthRef.current?.triggerAttack(noteName, undefined, vel);
  }, []);

  const triggerRelease = useCallback((noteName: string) => {
    synthRef.current?.triggerRelease(noteName);
  }, []);

  const updateActiveNotes = useCallback(() => {
    setActiveNotes(Array.from(activeNotesRef.current.values()));
  }, []);

  const playFromKey = useCallback(
    (key: string) => {
      const k = key.toLowerCase();
      if (!isPlayableKey(k) || pressed[k]) return;

      setPressed((prev) => ({ ...prev, [k]: true }));

      const noteName = noteFromKey(k, octave);
      const vel = velocity / MAX_VEL;
      triggerAttack(noteName, vel);
      activeNotesRef.current.set(k, noteName);
      updateActiveNotes();
    },
    [octave, pressed, triggerAttack, velocity, updateActiveNotes],
  );

  const releaseFromKey = useCallback(
    (key: string) => {
      const k = key.toLowerCase();
      if (!isPlayableKey(k)) return;

      setPressed((prev) => ({ ...prev, [k]: false }));

      const noteName = activeNotesRef.current.get(k);
      if (!noteName) return;

      triggerRelease(noteName);
      activeNotesRef.current.delete(k);
      updateActiveNotes();
    },
    [triggerRelease, updateActiveNotes],
  );

  useComputerKeyboard({
    enabled: audioReady,
    onPlay: playFromKey,
    onRelease: releaseFromKey,
    setOctave,
    setVelocity,
  });

  const handleClickDown = useCallback(
    async (noteName: string) => {
      if (!audioReady) await initAudio();
      const vel = velocity / MAX_VEL;
      triggerAttack(noteName, vel);
      activeNotesRef.current.set(noteName, noteName);
      updateActiveNotes();
    },
    [audioReady, initAudio, triggerAttack, velocity, updateActiveNotes],
  );

  const handleClickUp = useCallback(
    (noteName: string) => {
      triggerRelease(noteName);
      activeNotesRef.current.delete(noteName);
      updateActiveNotes();
    },
    [triggerRelease, updateActiveNotes],
  );

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="col-span-2 rounded-2xl border border-zinc-200 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
              <span>Key Layout</span>
              <span>Z/X octave · C/V velocity</span>
            </div>
            <KeyPiano
              pressed={pressed}
              onDown={playFromKey}
              onUp={releaseFromKey}
            />
          </div>

          <div className="flex flex-col justify-center gap-3 rounded-2xl border border-zinc-200 p-3">
            <div className="flex items-center gap-2">
              <Badge>Octave: C{octave}</Badge>
              <Badge>Velocity: {velocity}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={initAudio}
                className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-300 bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow hover:bg-black focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                disabled={audioReady}
                aria-pressed={audioReady}
              >
                {audioReady ? "Audio Ready" : "Init Audio"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 w-full h-60">
        <Piano
          octaves={8}
          visibleOctaves={2}
          startingOctave={0}
          focusOctave={3}
          activeNotes={activeNotes}
          onKeyPress={handleClickDown}
          onKeyRelease={handleClickUp}
        />
      </div>
    </div>
  );
}
