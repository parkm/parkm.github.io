import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { IconButton } from "./ui/IconButton";
import { Checkbox } from "./ui/Checkbox";
import { clamp } from "@/lib/utils";

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatBpm(bpm: number) {
  if (!Number.isFinite(bpm)) return "–";
  return Math.round(bpm).toString();
}

type MetronomeControls = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  sync: (targetNow?: number) => void;
};

function getAudioContextCtor() {
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  );
}

function useMetronomeEngine(
  bpm: number,
  isPlaying: boolean,
  beatsPerBar: number,
  accentEnabled: boolean,
): MetronomeControls {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  const schedulerTimerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const beatIndexRef = useRef<number>(0);

  const bpmRef = useRef<number>(bpm);
  const beatsPerBarRef = useRef<number>(beatsPerBar);
  const accentEnabledRef = useRef<boolean>(accentEnabled);
  const isPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    bpmRef.current = clamp(bpm, 40, 300);
  }, [bpm]);

  useEffect(() => {
    beatsPerBarRef.current = clamp(beatsPerBar, 1, 12);
  }, [beatsPerBar]);

  useEffect(() => {
    accentEnabledRef.current = accentEnabled;
  }, [accentEnabled]);

  const ensureContext = async () => {
    if (!ctxRef.current) {
      const Ctor = getAudioContextCtor();
      const ctx = new Ctor();
      ctxRef.current = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      masterGainRef.current = master;
    }

    if (ctxRef.current.state === "suspended") {
      try {
        await ctxRef.current.resume();
      } catch {
        // ignore
      }
    }
  };

  const scheduleClick = (time: number, accent: boolean) => {
    const ctx = ctxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const freq = accent ? 1100 : 850;
    const peak = accent ? 0.22 : 0.14;

    osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);

    osc.connect(gain);
    gain.connect(master);

    osc.start(time);
    osc.stop(time + 0.04);

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };
  };

  const startScheduler = () => {
    const lookaheadMs = 25;
    const scheduleAheadTime = 0.2;

    const scheduler = () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (!isPlayingRef.current) return;

      const secondsPerBeat = 60 / bpmRef.current;
      const now = ctx.currentTime;

      while (nextNoteTimeRef.current < now + scheduleAheadTime) {
        const bpb = beatsPerBarRef.current;
        const beatInBar = bpb > 0 ? beatIndexRef.current % bpb : 0;
        const accent = accentEnabledRef.current && beatInBar === 0;

        scheduleClick(nextNoteTimeRef.current, accent);

        beatIndexRef.current += 1;
        nextNoteTimeRef.current += secondsPerBeat;
      }
    };

    if (schedulerTimerRef.current != null) return;
    schedulerTimerRef.current = window.setInterval(scheduler, lookaheadMs);
  };

  const stopScheduler = () => {
    if (schedulerTimerRef.current != null) {
      window.clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
  };

  const start = async () => {
    isPlayingRef.current = true;
    await ensureContext();

    const ctx = ctxRef.current;
    if (!ctx) return;

    beatIndexRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.08;

    startScheduler();
  };

  const stop = async () => {
    isPlayingRef.current = false;
    stopScheduler();

    beatIndexRef.current = 0;
    nextNoteTimeRef.current = 0;

    const ctx = ctxRef.current;
    if (ctx && ctx.state === "running") {
      try {
        await ctx.suspend();
      } catch {
        // ignore
      }
    }
  };

  const sync = (targetNow?: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const now = typeof targetNow === "number" ? targetNow : ctx.currentTime;
    const smallOffset = 0.06;
    nextNoteTimeRef.current = Math.max(
      now + smallOffset,
      ctx.currentTime + 0.01,
    );
  };

  useEffect(() => {
    if (isPlaying) {
      void start();
    } else {
      void stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    const onVisibility = () => {
      const ctx = ctxRef.current;
      if (!ctx) return;

      if (document.visibilityState === "visible" && isPlayingRef.current) {
        void ensureContext();
        nextNoteTimeRef.current = ctx.currentTime + 0.08;
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return { start, stop, sync };
}

type TapState = {
  lastTapAt: number | null;
  taps: number[];
};

function computeBpmFromTaps(taps: number[]) {
  if (taps.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
  if (intervals.length === 0) return null;

  const m = median(intervals);
  const filtered = intervals.filter((x) => x >= m * 0.75 && x <= m * 1.25);
  const use = filtered.length >= 2 ? filtered : intervals;

  const avg = use.reduce((a, b) => a + b, 0) / use.length;
  const bpm = 60000 / avg;
  return bpm;
}

type GrooveCenterProps = {
  bpm: number;
  setBpm: (n: number) => void;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  timeSig: string;
  setTimeSig: (v: string) => void;
  accentEnabled: boolean;
  setAccentEnabled: (v: boolean) => void;
};

export function GrooveCenter({
  bpm,
  setBpm,
  isPlaying,
  setIsPlaying,
  timeSig,
  setTimeSig,
  accentEnabled,
  setAccentEnabled,
}: GrooveCenterProps) {
  const [tapState, setTapState] = useState<TapState>({
    lastTapAt: null,
    taps: [],
  });
  const [flash, setFlash] = useState(false);

  const beatsPerBar = useMemo(() => {
    const n = parseInt(timeSig.split("/")[0] || "4", 10);
    return Number.isFinite(n) ? clamp(n, 1, 12) : 4;
  }, [timeSig]);

  const metronome = useMetronomeEngine(
    bpm,
    isPlaying,
    beatsPerBar,
    accentEnabled,
  );

  const onTap = () => {
    const nowMs = performance.now();
    setFlash(true);
    window.setTimeout(() => setFlash(false), 70);

    const gap = tapState.lastTapAt == null ? null : nowMs - tapState.lastTapAt;
    const reset = gap != null && gap > 2000;
    const nextTaps = reset ? [nowMs] : [...tapState.taps, nowMs].slice(-8);

    const bpmEst = computeBpmFromTaps(nextTaps);
    if (bpmEst != null) {
      setBpm(clamp(Math.round(bpmEst), 40, 300));
    }

    setTapState({ lastTapAt: nowMs, taps: nextTaps });

    if (isPlaying) {
      metronome.sync();
    }
  };

  const clearTaps = () => setTapState({ lastTapAt: null, taps: [] });
  const nudge = (delta: number) =>
    setBpm(clamp(Math.round(bpm + delta), 40, 300));
  const bpmDisplay = formatBpm(bpm);

  return (
    <div className="w-full">
      <div className="mx-auto max-w-[640px]">
        <div className="relative rounded-t-[28px] border-t border-x border-emerald-400/15 bg-gradient-to-br from-emerald-500/8 to-emerald-600/6 shadow-[0_8px_32px_rgba(16,185,129,0.15)] overflow-hidden backdrop-blur-sm">
          <button
            type="button"
            onClick={onTap}
            className="w-full px-5 py-8 sm:py-10 text-left select-none active:scale-[0.995] transition-transform border-b border-emerald-400/10"
            aria-label="Tap tempo"
          >
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[12px] uppercase tracking-[0.18em] text-emerald-200/60">
                  Tap Tempo
                </div>
                <div className="mt-2 flex items-end gap-3">
                  <div className="text-6xl sm:text-7xl font-extrabold leading-none text-white tabular-nums">
                    {bpmDisplay}
                  </div>
                  <div className="pb-1">
                    <div className="text-sm font-semibold text-white/80">
                      BPM
                    </div>
                    <div className="text-xs text-white/45">tap 4–8 times</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div
                  className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    flash
                      ? "bg-emerald-400/20 border-emerald-400/30"
                      : "bg-white/6 border-white/12"
                  }`}
                >
                  {tapState.taps.length < 2
                    ? "waiting…"
                    : `${tapState.taps.length} taps`}
                </div>
                <div className="text-[11px] text-white/45">
                  long pause resets
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="h-2 w-full rounded-full bg-white/5 border border-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-150 ${flash ? "w-full opacity-100" : "w-0 opacity-0"}`}
                  style={{ background: "rgba(16,185,129,0.4)" }}
                />
              </div>
            </div>
          </button>

          <div className="px-5 py-4">
            <div className="flex items-center gap-2 flex-wrap">
              <IconButton label="Clear taps" onClick={clearTaps}>
                Clear
              </IconButton>
              <IconButton label="Minus five" onClick={() => nudge(-5)}>
                -5
              </IconButton>
              <IconButton label="Minus one" onClick={() => nudge(-1)}>
                -1
              </IconButton>
              <IconButton label="Plus one" onClick={() => nudge(+1)}>
                +1
              </IconButton>
              <IconButton label="Plus five" onClick={() => nudge(+5)}>
                +5
              </IconButton>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/45">Time Sig</span>
                  <select
                    value={timeSig}
                    onChange={(e) => setTimeSig(e.target.value)}
                    className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                  >
                    {["4/4", "3/4", "6/8", "12/8", "5/4", "7/8"].map((t) => (
                      <option key={t} value={t} className="bg-[#0b0f18]">
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <Checkbox
                  label="Accent first beat"
                  checked={accentEnabled}
                  onChange={setAccentEnabled}
                />
              </div>

              <div className="text-xs text-white/45">
                <IconButton
                  label={isPlaying ? "Stop metronome" : "Start metronome"}
                  onClick={() => setIsPlaying(!isPlaying)}
                  tone={isPlaying ? "danger" : "primary"}
                >
                  {isPlaying ? <Pause /> : <Play />}
                </IconButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
