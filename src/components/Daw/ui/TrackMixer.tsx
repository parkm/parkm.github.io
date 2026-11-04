import { Square } from "lucide-react";
import type { ParamDef } from "../engine/params";
import { updateTrackFields } from "../model/sessionOps";
import type { Track } from "../model/types";
import { useDaw, useSessionState } from "./context";
import { Knob } from "./Knob";
import { LevelMeter } from "./Meter";

/**
 * A track's mixer strip: stop, volume, pan, level meter, mute (the numbered
 * track activator) and solo. Shown under each session column on wide screens and in
 * the Mixer tab on phones.
 */

export const VOLUME: ParamDef = {
  key: "volume",
  label: "Volume",
  min: -60,
  max: 6,
  default: 0,
  unit: "dB",
  step: 0.1,
};

export const PAN: ParamDef = {
  key: "pan",
  label: "Pan",
  min: -1,
  max: 1,
  default: 0,
  step: 0.01,
};

export const formatPan = (v: number) =>
  Math.abs(v) < 0.005
    ? "C"
    : `${Math.round(Math.abs(v) * 50)}${v < 0 ? "L" : "R"}`;

export function TrackMixer({
  track,
  number,
  size = "regular",
}: {
  track: Track;
  /** Shown on the activator button, like Live's track numbers. */
  number: number;
  /** "large" gives touch-sized controls. */
  size?: "regular" | "large";
}) {
  const { store, session } = useDaw();
  const play = useSessionState((s) => s.tracks[track.id]);
  const set = (patch: Parameters<typeof updateTrackFields>[2]) =>
    store.update((d) => updateTrackFields(d, track.id, patch));
  const button = size === "large" ? "h-9" : "h-5";
  const knob = size === "large" ? 48 : 36;

  return (
    <>
      <button
        type="button"
        title="Stop track"
        aria-label={`Stop ${track.name}`}
        className={`flex ${button} w-full items-center justify-center rounded-sm ${
          play?.queued === null
            ? "animate-pulse bg-zinc-500"
            : "bg-zinc-700/70 hover:bg-zinc-600"
        }`}
        onClick={() => session.launch(track.id, null)}
      >
        <Square size={9} fill="currentColor" />
      </button>
      <div className="flex">
        <Knob
          def={VOLUME}
          value={track.volume}
          onChange={(volume) => set({ volume })}
          onBegin={store.begin}
          onEnd={store.end}
          size={knob}
        />
        <Knob
          def={PAN}
          value={track.pan}
          onChange={(pan) => set({ pan })}
          onBegin={store.begin}
          onEnd={store.end}
          format={formatPan}
          size={knob}
        />
      </div>
      <LevelMeter trackId={track.id} />
      <div className="flex w-full gap-1">
        <button
          type="button"
          title={track.mute ? "Unmute track" : "Mute track"}
          aria-pressed={!track.mute}
          className={`${button} flex-1 rounded-sm text-[11px] font-semibold tabular-nums ${
            track.mute
              ? "bg-zinc-700 text-zinc-400"
              : "bg-amber-400 text-zinc-900"
          }`}
          onClick={() => set({ mute: !track.mute })}
        >
          {number}
        </button>
        <button
          type="button"
          title="Solo track"
          aria-pressed={track.solo}
          className={`${button} flex-1 rounded-sm text-[11px] font-semibold ${
            track.solo
              ? "bg-sky-400 text-zinc-900"
              : "bg-zinc-700 text-zinc-300"
          }`}
          onClick={() => set({ solo: !track.solo })}
        >
          S
        </button>
      </div>
    </>
  );
}
