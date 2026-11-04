import { updateTrackFields } from "../model/sessionOps";
import { useDaw, useDoc } from "./context";
import { EditableText } from "./EditableText";
import { Knob } from "./Knob";
import { LevelMeter } from "./Meter";
import { TrackMixer, VOLUME } from "./TrackMixer";

/** Every track's mixer strip side by side, plus master (the phone Mixer tab). */
export function MixerView() {
  const { store } = useDaw();
  const tracks = useDoc((d) => d.tracks);
  const masterVolume = useDoc((d) => d.masterVolume);

  return (
    <div className="flex h-full gap-1 overflow-x-auto p-2">
      {tracks.map((track, i) => (
        <section
          key={track.id}
          aria-label={`${track.name} mixer`}
          className="flex w-28 shrink-0 flex-col items-center gap-2 rounded bg-zinc-800 p-2"
        >
          <div className="flex w-full items-center gap-1.5">
            <div
              className="h-3 w-1 shrink-0 rounded-full"
              style={{ background: `oklch(0.75 0.14 ${track.hue})` }}
            />
            <EditableText
              label="Track name"
              value={track.name}
              className="text-xs text-zinc-200"
              onCommit={(name) =>
                name &&
                store.update((d) => updateTrackFields(d, track.id, { name }))
              }
            />
          </div>
          <TrackMixer track={track} number={i + 1} size="large" />
        </section>
      ))}
      <section
        aria-label="Master mixer"
        className="flex w-28 shrink-0 flex-col items-center gap-2 rounded bg-zinc-900 p-2"
      >
        <span className="text-xs text-zinc-200">Master</span>
        <Knob
          def={{ ...VOLUME, label: "Master" }}
          value={masterVolume}
          onChange={(v) => store.update((d) => ({ ...d, masterVolume: v }))}
          onBegin={store.begin}
          onEnd={store.end}
          size={48}
        />
        <LevelMeter trackId={null} />
      </section>
    </div>
  );
}
