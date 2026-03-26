import { useCallback, useEffect, useRef, useState } from "react";
import { wsola } from "./wsola";
import { drawWaveform } from "./drawWaveform";

type View = "idle" | "recording" | "processing" | "ready";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function Recorder() {
  const [view, setView] = useState<View>("idle");
  const [timerText, setTimerText] = useState("0:00");
  const [speed, setSpeed] = useState(70);
  const [currentTime, setCurrentTime] = useState("0:00");
  const [duration, setDuration] = useState("0:00");
  const [playing, setPlaying] = useState(false);
  const [wsolaLoading, setWsolaLoading] = useState(false);
  const [gain, setGain] = useState(100);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const originalBufRef = useRef<AudioBuffer | null>(null);
  const processedBufRef = useRef<AudioBuffer | null>(null);
  const origSamplesRef = useRef<Float32Array | null>(null);
  const srcNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const playingRef = useRef(false);
  const startTRef = useRef(0);
  const pauseOffRef = useRef(0);
  const rateRef = useRef(0.7);
  const recStartRef = useRef(0);
  const timerIvRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafIdRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seekFractionRef = useRef(-1);
  const startMarkerRef = useRef(-1);
  const [startMarker, setStartMarker] = useState(-1);
  const lastTapTimeRef = useRef(0);
  const lastTapXRef = useRef(0);

  const ensureCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (
        window.AudioContext ||
        (
          window as Window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext!
      )();
      gainNodeRef.current = audioCtxRef.current.createGain();
      gainNodeRef.current.connect(audioCtxRef.current.destination);
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  }, []);

  const draw = useCallback((fraction: number) => {
    if (canvasRef.current) {
      drawWaveform(
        canvasRef.current,
        origSamplesRef.current,
        fraction,
        startMarkerRef.current >= 0 ? startMarkerRef.current : undefined,
      );
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (!playingRef.current) return;
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafIdRef.current);
    if (srcNodeRef.current) {
      try {
        srcNodeRef.current.stop();
      } catch {
        /* already stopped */
      }
      srcNodeRef.current = null;
    }
    pauseOffRef.current = audioCtxRef.current!.currentTime - startTRef.current;
    if (
      processedBufRef.current &&
      pauseOffRef.current >= processedBufRef.current.duration
    ) {
      pauseOffRef.current = 0;
    }
  }, []);

  const tick = useCallback(() => {
    if (!playingRef.current || !processedBufRef.current) return;
    const cur = audioCtxRef.current!.currentTime - startTRef.current;
    const dur = processedBufRef.current.duration;
    const frac = Math.min(cur / dur, 1);
    draw(frac);
    setCurrentTime(formatTime(Math.min(cur, dur)));
    rafIdRef.current = requestAnimationFrame(tick);
  }, [draw]);

  const startPlayback = useCallback(() => {
    if (!processedBufRef.current) return;
    ensureCtx();

    // If start marker is set, always begin from there
    if (startMarkerRef.current >= 0) {
      pauseOffRef.current =
        startMarkerRef.current * processedBufRef.current.duration;
    }

    const node = audioCtxRef.current!.createBufferSource();
    node.buffer = processedBufRef.current;
    node.connect(gainNodeRef.current!);
    node.start(0, pauseOffRef.current);
    startTRef.current = audioCtxRef.current!.currentTime - pauseOffRef.current;
    playingRef.current = true;
    setPlaying(true);
    srcNodeRef.current = node;
    node.onended = () => {
      if (playingRef.current) {
        playingRef.current = false;
        setPlaying(false);
        cancelAnimationFrame(rafIdRef.current);

        if (startMarkerRef.current >= 0 && processedBufRef.current) {
          pauseOffRef.current =
            startMarkerRef.current * processedBufRef.current.duration;
          draw(startMarkerRef.current);
          setCurrentTime(formatTime(pauseOffRef.current));
        } else {
          pauseOffRef.current = 0;
          draw(-1);
          setCurrentTime(formatTime(0));
        }
      }
    };
    tick();
  }, [ensureCtx, draw, tick]);

  const runWSOLA = useCallback(
    (overlay: boolean) => {
      if (overlay) {
        setWsolaLoading(true);
      } else {
        setView("processing");
      }

      setTimeout(() => {
        const buf = originalBufRef.current!;
        const ch = buf.numberOfChannels;
        const sr = buf.sampleRate;
        const stretched: Float32Array[] = [];
        for (let c = 0; c < ch; c++) {
          stretched.push(wsola(buf.getChannelData(c), rateRef.current));
        }
        const outLen = stretched[0].length;
        const processed = audioCtxRef.current!.createBuffer(ch, outLen, sr);
        for (let c = 0; c < ch; c++)
          processed.getChannelData(c).set(stretched[c]);
        processedBufRef.current = processed;

        // Restore playhead to proportional position after re-processing
        if (seekFractionRef.current >= 0) {
          pauseOffRef.current = seekFractionRef.current * processed.duration;
          seekFractionRef.current = -1;
        }

        setWsolaLoading(false);
        setView("ready");
        setDuration(formatTime(processed.duration));
        setCurrentTime(formatTime(pauseOffRef.current));
        const frac =
          pauseOffRef.current > 0
            ? pauseOffRef.current / processed.duration
            : -1;
        requestAnimationFrame(() => draw(frac));
      }, 30);
    },
    [draw],
  );

  const processRecording = useCallback(async () => {
    setView("processing");
    const blob = new Blob(chunksRef.current, {
      type: recorderRef.current?.mimeType,
    });
    const ab = await blob.arrayBuffer();
    try {
      originalBufRef.current = await audioCtxRef.current!.decodeAudioData(ab);
    } catch {
      alert("Could not decode audio");
      setView("idle");
      return;
    }
    if (originalBufRef.current.duration < 0.15) {
      alert("Recording too short");
      setView("idle");
      return;
    }
    origSamplesRef.current = originalBufRef.current.getChannelData(0);
    pauseOffRef.current = 0;
    runWSOLA(false);
  }, [runWSOLA]);

  const startRecording = useCallback(async () => {
    ensureCtx();
    stopPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        processRecording();
      };
      rec.start();
      recorderRef.current = rec;
      recStartRef.current = Date.now();
      setView("recording");
      timerIvRef.current = setInterval(() => {
        const s = (Date.now() - recStartRef.current) / 1000;
        setTimerText(formatTime(s));
      }, 100);
    } catch {
      alert("Mic access denied");
    }
  }, [ensureCtx, stopPlayback, processRecording]);

  const stopRecording = useCallback(() => {
    if (timerIvRef.current) clearInterval(timerIvRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const handleSpeedChange = useCallback(
    (values: number[]) => {
      setSpeed(values[0]);
      const newRate = values[0] / 100;
      if (newRate === rateRef.current) return;

      // Capture playhead fraction before stopping
      let fraction = 0;
      if (processedBufRef.current) {
        const currentOffset = playingRef.current
          ? audioCtxRef.current!.currentTime - startTRef.current
          : pauseOffRef.current;
        fraction = Math.min(
          currentOffset / processedBufRef.current.duration,
          1,
        );
      }

      rateRef.current = newRate;
      stopPlayback();
      seekFractionRef.current = fraction;
      runWSOLA(true);
    },
    [stopPlayback, runWSOLA],
  );

  const resetToIdle = useCallback(() => {
    stopPlayback();
    originalBufRef.current = null;
    processedBufRef.current = null;
    origSamplesRef.current = null;
    pauseOffRef.current = 0;
    setView("idle");
  }, [stopPlayback]);

  const seekTo = useCallback(
    (clientX: number) => {
      if (!canvasRef.current || !processedBufRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const offset = frac * processedBufRef.current.duration;

      // Clear start marker on manual seek
      startMarkerRef.current = -1;
      setStartMarker(-1);

      const wasPlaying = playingRef.current;
      if (wasPlaying) stopPlayback();

      pauseOffRef.current = offset;
      draw(frac);
      setCurrentTime(formatTime(offset));

      if (wasPlaying) startPlayback();
    },
    [stopPlayback, startPlayback, draw],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!processedBufRef.current || !canvasRef.current) return;
      e.preventDefault();
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

      const now = Date.now();
      const isDoubleTap =
        now - lastTapTimeRef.current < 300 &&
        Math.abs(e.clientX - lastTapXRef.current) < 10;
      lastTapTimeRef.current = now;
      lastTapXRef.current = e.clientX;

      if (isDoubleTap) {
        // Set start marker at this position
        const rect = canvasRef.current.getBoundingClientRect();
        const frac = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        const offset = frac * processedBufRef.current!.duration;

        const wasPlaying = playingRef.current;
        if (wasPlaying) stopPlayback();

        startMarkerRef.current = frac;
        setStartMarker(frac);
        pauseOffRef.current = offset;
        draw(frac);
        setCurrentTime(formatTime(offset));

        if (wasPlaying) startPlayback();
      } else {
        seekTo(e.clientX);
      }
    },
    [seekTo, stopPlayback, startPlayback, draw],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!processedBufRef.current) return;
      if (!(e.target as HTMLCanvasElement).hasPointerCapture(e.pointerId))
        return;
      seekTo(e.clientX);
    },
    [seekTo],
  );

  // Animate pulsing start marker when not playing
  useEffect(() => {
    if (startMarker < 0 || playing) return;
    let id: number;
    const animate = () => {
      const frac =
        pauseOffRef.current > 0 && processedBufRef.current
          ? pauseOffRef.current / processedBufRef.current.duration
          : -1;
      draw(frac);
      id = requestAnimationFrame(animate);
    };
    id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [startMarker, playing, draw]);

  // Redraw on resize
  useEffect(() => {
    const onResize = () => {
      if (view === "ready") {
        const frac =
          playingRef.current && processedBufRef.current
            ? Math.min(
                (audioCtxRef.current!.currentTime - startTRef.current) /
                  processedBufRef.current.duration,
                1,
              )
            : -1;
        draw(frac);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [view, draw]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 select-none">
      {/* ── Idle ── */}
      {view === "idle" && (
        <div className="flex animate-in fade-in slide-in-from-bottom-2 flex-col items-center gap-8 duration-300">
          <button
            onClick={startRecording}
            className="flex size-[92px] cursor-pointer items-center justify-center rounded-full border-[3px] border-red-500 bg-transparent transition-transform active:scale-[0.91]"
          >
            <div className="size-[66px] rounded-full bg-red-500" />
          </button>
          <span className="text-[13px] tracking-wider text-muted-foreground">
            tap to record
          </span>
        </div>
      )}

      {/* ── Recording ── */}
      {view === "recording" && (
        <div className="flex animate-in fade-in slide-in-from-bottom-2 flex-col items-center gap-8 duration-300">
          <div className="font-mono text-5xl font-extralight tracking-wider tabular-nums">
            {timerText}
          </div>
          <div className="relative flex items-center justify-center">
            {/* Pulse rings */}
            {[0, 650, 1300].map((delay) => (
              <div
                key={delay}
                className="absolute size-[92px] animate-[pulse-ring_2s_ease-out_infinite] rounded-full border-2 border-red-500 opacity-0"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
            <button
              onClick={stopRecording}
              className="relative z-10 flex size-[92px] cursor-pointer items-center justify-center rounded-full border-[3px] border-red-500 bg-transparent transition-transform active:scale-[0.91]"
            >
              <div className="size-[30px] rounded-[5px] bg-red-500" />
            </button>
          </div>
        </div>
      )}

      {/* ── Processing ── */}
      {view === "processing" && (
        <div className="flex animate-in fade-in slide-in-from-bottom-2 flex-col items-center gap-8 duration-300">
          <div className="size-8 animate-spin rounded-full border-[3px] border-muted border-t-emerald-400" />
          <span className="text-[13px] tracking-wider text-muted-foreground">
            processing audio...
          </span>
        </div>
      )}

      {/* ── Ready ── */}
      {view === "ready" && (
        <div className="flex w-full max-w-md animate-in fade-in slide-in-from-bottom-2 flex-col items-center gap-6 duration-300">
          {/* Waveform */}
          <div className="relative w-full overflow-hidden rounded-xl bg-card">
            <canvas
              ref={canvasRef}
              className="block h-[130px] w-full cursor-pointer touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
            />
            {wsolaLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/75">
                <div className="size-8 animate-spin rounded-full border-[3px] border-muted border-t-emerald-400" />
              </div>
            )}
          </div>

          {/* Time display */}
          <div className="flex w-full justify-between px-1 font-mono text-xs tabular-nums text-muted-foreground">
            <span>{currentTime}</span>
            <span>{duration}</span>
          </div>

          {/* Play button */}
          <button
            onClick={() => {
              if (playing) stopPlayback();
              else startPlayback();
            }}
            className={`flex size-[72px] cursor-pointer items-center justify-center rounded-full border-2 border-emerald-400 bg-transparent transition-all active:scale-[0.91] ${playing ? "shadow-[0_0_28px_rgba(52,211,153,0.25)]" : ""}`}
          >
            {playing ? (
              <div className="flex gap-1.5">
                <span className="block h-[26px] w-[5px] rounded-sm bg-emerald-400" />
                <span className="block h-[26px] w-[5px] rounded-sm bg-emerald-400" />
              </div>
            ) : (
              <div className="ml-1 size-0 border-y-[13px] border-l-[22px] border-y-transparent border-l-emerald-400" />
            )}
          </button>

          {/* Speed & Gain sliders */}
          <div className="flex w-full max-w-xs flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-[11px] uppercase tracking-widest text-muted-foreground">
                speed
              </span>
              <input
                type="range"
                min={30}
                max={100}
                value={speed}
                onChange={(e) => handleSpeedChange([+e.target.value])}
                className="range-thick flex-1"
              />
              <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums text-emerald-400">
                {speed}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-[11px] uppercase tracking-widest text-muted-foreground">
                gain
              </span>
              <input
                type="range"
                min={0}
                max={200}
                value={gain}
                onChange={(e) => {
                  const v = +e.target.value;
                  setGain(v);
                  if (gainNodeRef.current) {
                    gainNodeRef.current.gain.value = v / 100;
                  }
                }}
                className="range-thick flex-1"
              />
              <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
                {gain}%
              </span>
            </div>
          </div>

          {/* Record again */}
          <button
            onClick={resetToIdle}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-muted-foreground/50 text-muted-foreground transition-all hover:border-red-500 hover:text-red-500 active:scale-[0.91]"
            aria-label="Record again"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-[18px]"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        </div>
      )}

      {/* Pulse ring keyframes */}
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.45; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .range-thick {
          -webkit-appearance: none;
          appearance: none;
          height: 10px;
          border-radius: 5px;
          background: oklch(0.274 0.006 286.033);
          outline: none;
        }
        .range-thick::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: oklch(0.75 0.18 160);
          cursor: pointer;
        }
        .range-thick::-moz-range-thumb {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: none;
          background: oklch(0.75 0.18 160);
          cursor: pointer;
        }
        .range-thick::-moz-range-track {
          height: 10px;
          border-radius: 5px;
          background: oklch(0.274 0.006 286.033);
        }
      `}</style>
    </div>
  );
}
