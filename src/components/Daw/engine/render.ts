import { secondsPerTick, swingTick } from "../model/time";
import type { Id, Project } from "../model/types";
import { createEngine } from "./engine";
import {
  chosenClip,
  forEachNoteInRange,
  loopLength,
  type ClipChoice,
} from "./schedule";

type RenderOptions = {
  /** Which clip each track plays; tracks without one are silent. */
  clips: ClipChoice;
  sampleRate?: number;
  loops?: number;
  /** Render only these tracks (stems). */
  trackIds?: Id[];
};

/**
 * Render the chosen clips faster than realtime with the same engine code
 * used live. One extra loop is rendered first and discarded, so tails from
 * the end wrap into the start and the file loops seamlessly.
 */
export async function renderLoop(
  doc: Project,
  opts: RenderOptions,
): Promise<AudioBuffer> {
  const { clips, sampleRate = 48000, loops = 1, trackIds } = opts;
  const length = loopLength(doc, clips);
  if (length === 0) throw new Error("Nothing to render");
  const spt = secondsPerTick(doc.bpm);
  const loopFrames = Math.round(length * spt * sampleRate);

  const ctx = new OfflineAudioContext(2, loopFrames * (loops + 1), sampleRate);
  const engine = createEngine(ctx);
  const tracks = trackIds
    ? doc.tracks.filter((t) => trackIds.includes(t.id))
    : doc.tracks;
  engine.sync({ ...doc, tracks });

  for (const track of tracks) {
    const clip = chosenClip(doc, track, clips);
    if (!clip) continue;
    forEachNoteInRange(clip, 0, length * (loops + 1), (note, at) => {
      const time = swingTick(at, doc.swing) * spt;
      const end = swingTick(at + note.duration, doc.swing) * spt;
      engine.noteOn(track.id, note.pitch, note.velocity, time, end - time);
    });
  }

  const rendered = await ctx.startRendering();
  const out = new AudioBuffer({
    numberOfChannels: 2,
    length: loopFrames * loops,
    sampleRate,
  });
  for (let c = 0; c < 2; c++) {
    out.copyToChannel(rendered.getChannelData(c).subarray(loopFrames), c);
  }
  return out;
}
