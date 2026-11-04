import { newId, DEFAULT_VELOCITY } from "./ops";
import { PPQ } from "./time";
import type {
  Clip,
  Note,
  Pad,
  Project,
  Scene,
  Track,
  VoiceType,
} from "./types";

type PadSpec = [
  name: string,
  pitch: number,
  voice: VoiceType,
  level: number,
  params?: Record<string, number>,
  choke?: number,
];

// General MIDI drum note numbers, so exported MIDI opens with any kit.
const KIT: PadSpec[] = [
  ["Kick", 36, "kick", -2],
  ["Snare", 38, "snare", -6],
  ["Clap", 39, "clap", -5],
  ["Rim", 37, "rim", -9],
  ["Closed Hat", 42, "hat", -7, { decay: 55 }, 1],
  ["Open Hat", 46, "hat", -9, { decay: 420 }, 1],
  ["Low Tom", 45, "tom", -5, { tune: 100 }],
  ["High Tom", 50, "tom", -6, { tune: 165 }],
  ["Cowbell", 56, "cowbell", -10],
];

export function createKitPads(): Pad[] {
  return KIT.map(([name, pitch, voice, level, params = {}, choke = null]) => ({
    id: newId(),
    name,
    pitch,
    voice,
    params,
    level,
    pan: 0,
    mute: false,
    choke,
  }));
}

const STEP = PPQ / 4;

function pattern(rows: [pitch: number, steps: string][]): Note[] {
  // "x" = accent, "o" = normal, "." = rest
  return rows.flatMap(([pitch, steps]) =>
    [...steps].flatMap((c, i) =>
      c === "."
        ? []
        : [
            {
              id: newId(),
              pitch,
              start: i * STEP,
              duration: STEP,
              velocity: c === "x" ? DEFAULT_VELOCITY : 0.5,
            },
          ],
    ),
  );
}

export const SCENE_COUNT = 8;

const TRACK_HUES = [55, 150, 250, 15, 195, 300, 95, 345];
export const trackHue = (index: number) =>
  TRACK_HUES[index % TRACK_HUES.length];

export function createDrumTrack(
  name: string,
  hue: number,
  sceneCount: number,
): Track {
  return {
    id: newId(),
    name,
    hue,
    devices: [{ id: newId(), type: "drumKit", pads: createKitPads() }],
    slots: Array.from({ length: sceneCount }, () => null),
    volume: 0,
    pan: 0,
    mute: false,
    solo: false,
  };
}

export function createSynthTrack(
  name: string,
  hue: number,
  sceneCount: number,
  type: "synth" | "quickSynth" | "fmSynth" = "synth",
): Track {
  return {
    ...createDrumTrack(name, hue, sceneCount),
    devices: [{ id: newId(), type, params: {} }],
  };
}

export const createScene = (): Scene => ({ id: newId(), name: "" });

export function createDefaultProject(): Project {
  const clip: Clip = {
    id: newId(),
    name: "Beat",
    hue: trackHue(0),
    length: PPQ * 4,
    notes: pattern([
      [36, "x.......x.x....."],
      [38, "....x.......x..."],
      [42, "x.o.x.o.x.o.x..."],
      [46, "..............x."],
    ]),
  };
  const track = createDrumTrack("Drums", trackHue(0), SCENE_COUNT);
  track.slots[0] = clip.id;

  return {
    version: 1,
    bpm: 120,
    timeSignature: [4, 4],
    swing: 0,
    masterVolume: 0,
    launchQuantize: PPQ * 4,
    scenes: Array.from({ length: SCENE_COUNT }, createScene),
    clips: { [clip.id]: clip },
    tracks: [track],
  };
}

/** An empty project: a drum track and a Quick Synth, no clips (capture detects the tempo). */
export function createEmptyProject(): Project {
  const drums = createDrumTrack("Drums", trackHue(0), SCENE_COUNT);
  const synth = createSynthTrack(
    "Quick Synth",
    trackHue(1),
    SCENE_COUNT,
    "quickSynth",
  );
  return {
    version: 1,
    bpm: 120,
    timeSignature: [4, 4],
    swing: 0,
    masterVolume: 0,
    launchQuantize: PPQ * 4,
    scenes: Array.from({ length: SCENE_COUNT }, createScene),
    clips: {},
    tracks: [drums, synth],
  };
}
