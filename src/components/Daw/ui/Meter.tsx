import { useEffect, useRef } from "react";
import type { Id } from "../model/types";
import { useDaw } from "./context";
import { onFrame } from "./frame";

/** Meter scale, matching the volume knob's range. */
const FLOOR = -60;
const TOP = 6;
/** How fast the bar falls, in dB per second (peaks jump up instantly). */
const FALL = 24;
const HOLD_MS = 1200;

const toX = (db: number) =>
  Math.min(1, Math.max(0, (db - FLOOR) / (TOP - FLOOR)));
const ZERO_X = toX(0);
const toDb = (gain: number) => (gain > 0 ? 20 * Math.log10(gain) : -Infinity);

/**
 * Stereo peak meter for a track after its fader and pan, or the master
 * (trackId null) before the limiter. Green to -6 dB, amber to 0, red above.
 * The square at the end lights when a peak goes over 0 dB; click it to reset.
 */
export function LevelMeter({ trackId }: { trackId: Id | null }) {
  const { session } = useDaw();
  const bars = useRef<(HTMLDivElement | null)[]>([]);
  const holds = useRef<(HTMLDivElement | null)[]>([]);
  const clipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const shown = [FLOOR, FLOOR];
    const held = [
      { db: FLOOR, at: 0 },
      { db: FLOOR, at: 0 },
    ];
    let last = performance.now();
    return onFrame(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const peak = session.peak(trackId) ?? [0, 0];
      for (let c = 0; c < 2; c++) {
        const db = toDb(peak[c]);
        shown[c] = Math.max(db, shown[c] - FALL * dt, FLOOR);
        if (db >= held[c].db || now - held[c].at > HOLD_MS) {
          held[c] = { db: Math.max(db, FLOOR), at: now };
        }
        if (db > 0 && clipRef.current) clipRef.current.dataset.clip = "";
        const bar = bars.current[c];
        if (bar) {
          bar.style.transform = `scaleX(${toX(shown[c])})`;
          bar.dataset.level =
            shown[c] > 0 ? "over" : shown[c] > -6 ? "hot" : "ok";
        }
        const hold = holds.current[c];
        if (hold) {
          hold.style.left = `${toX(held[c].db) * 100}%`;
          hold.style.opacity = held[c].db > FLOOR ? "1" : "0";
        }
      }
    });
  }, [session, trackId]);

  return (
    <div className="flex w-full items-center gap-1" aria-hidden>
      <div className="relative flex h-[5px] flex-1 flex-col justify-between overflow-hidden rounded-[1px] bg-zinc-950">
        {[0, 1].map((c) => (
          <div key={c} className="relative h-[2px]">
            <div
              ref={(el) => {
                bars.current[c] = el;
              }}
              className="absolute inset-0 origin-left bg-lime-400 data-[level=hot]:bg-amber-400 data-[level=over]:bg-red-500"
              style={{ transform: "scaleX(0)" }}
            />
            <div
              ref={(el) => {
                holds.current[c] = el;
              }}
              className="absolute top-0 h-full w-px bg-zinc-200 opacity-0"
            />
          </div>
        ))}
        {/* 0 dB mark */}
        <div
          className="absolute top-0 h-full w-px bg-zinc-600"
          style={{ left: `${ZERO_X * 100}%` }}
        />
      </div>
      <button
        ref={clipRef}
        type="button"
        tabIndex={-1}
        title="Peaked over 0 dB (click to reset)"
        className="h-[5px] w-[5px] shrink-0 rounded-[1px] bg-zinc-700 data-clip:bg-red-500"
        onClick={(e) => delete e.currentTarget.dataset.clip}
      />
    </div>
  );
}

/**
 * How much a compressor is turning the sound down right now, as a bar
 * growing from the right and a dB readout.
 */
export function ReductionMeter({
  trackId,
  deviceId,
}: {
  trackId: Id;
  deviceId: Id;
}) {
  const { session } = useDaw();
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let text = "";
    return onFrame(() => {
      const db = Math.min(0, session.reduction(trackId, deviceId) ?? 0);
      if (barRef.current)
        barRef.current.style.transform = `scaleX(${Math.min(1, -db / 24)})`;
      const next = db > -0.05 ? "0.0 dB" : `${db.toFixed(1)} dB`;
      if (textRef.current && next !== text) {
        textRef.current.textContent = next;
        text = next;
      }
    });
  }, [session, trackId, deviceId]);

  return (
    <div
      className="flex w-32 flex-col gap-1"
      title="Gain reduction: how much the compressor is turning the sound down right now. The bar spans 24 dB."
    >
      <div className="flex justify-between text-[10px] tracking-wide text-zinc-500 uppercase">
        <span>Reduction</span>
        <span ref={textRef} className="text-zinc-300 tabular-nums normal-case">
          0.0 dB
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-[1px] bg-zinc-950">
        <div
          ref={barRef}
          className="absolute inset-0 origin-right bg-amber-400"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </div>
  );
}
