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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenVisibleOctaves, setFullscreenVisibleOctaves] = useState(2);

  const synthRef = useRef<Tone.PolySynth<Tone.Synth> | null>(null);
  const mountedRef = useRef(false);
  const activeNotesRef = useRef<Map<string, string>>(new Map());
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);

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

  const enterFullscreen = useCallback(async () => {
    const container = fullscreenContainerRef.current;
    if (!container) return;

    try {
      if (container.requestFullscreen) {
        await container.requestFullscreen();
      }
      setIsFullscreen(true);
    } catch (err) {
      console.error("Failed to enter fullscreen:", err);
      setIsFullscreen(true);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      setIsFullscreen(false);
    } catch (err) {
      console.error("Failed to exit fullscreen:", err);
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
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
      <div
        ref={fullscreenContainerRef}
        className={
          isFullscreen
            ? "fixed inset-0 z-50 bg-zinc-900 flex flex-col"
            : "mt-4 w-full h-60 relative"
        }
      >
        <Piano
          octaves={8}
          visibleOctaves={isFullscreen ? fullscreenVisibleOctaves : 2}
          startingOctave={0}
          focusOctave={3}
          activeNotes={activeNotes}
          onKeyPress={handleClickDown}
          onKeyRelease={handleClickUp}
        />
        {!isFullscreen && (
          <button
            className="absolute bottom-1 right-1 bg-black/70 border border-white/30 text-white px-3 py-2 rounded-lg text-2xl flex items-center justify-center transition-colors duration-200 hover:bg-gray-800 shadow-lg"
            onClick={enterFullscreen}
            aria-label="Enter fullscreen"
          >
            ⛶
          </button>
        )}
        {isFullscreen && (
          <div className="absolute top-4 right-4 bg-black/90 border border-white/30 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-4">
            <div className="flex items-center gap-3">
              <label
                htmlFor="octaves-slider"
                className="text-sm font-medium whitespace-nowrap"
              >
                Octaves: {fullscreenVisibleOctaves}
              </label>
              <input
                id="octaves-slider"
                type="range"
                min="1"
                max="8"
                value={fullscreenVisibleOctaves}
                onChange={(e) =>
                  setFullscreenVisibleOctaves(Number(e.target.value))
                }
                className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>
            <div className="w-px h-6 bg-white/30" />
            <button
              className="text-sm font-medium transition-colors duration-200 hover:text-gray-300 whitespace-nowrap"
              onClick={exitFullscreen}
              aria-label="Exit fullscreen"
            >
              Exit Fullscreen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
