export const MIN_OCT = -2;
export const MAX_OCT = 8;
export const MIN_VEL = 1;
export const MAX_VEL = 127;
export const VEL_STEP = 20;

const KEY_TO_SEMITONE: Readonly<Record<string, number>> = {
  a: 0,
  s: 2,
  d: 4,
  f: 5,
  g: 7,
  h: 9,
  j: 11,
  k: 12,
  l: 14,
  ";": 16,
  "'": 17,
  w: 1,
  e: 3,
  t: 6,
  y: 8,
  u: 10,
  o: 13,
  p: 15,
};

export const clamp = (n: number, min: number, max: number) =>
  n < min ? min : n > max ? max : n;

const midiToNote = (midi: number) => {
  const names = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const pitch = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = names[pitch] ?? "";
  return `${name}${octave}`;
};

const semitoneToMidi = (semitoneFromC: number, octave: number) =>
  (octave + 1) * 12 + semitoneFromC;

export const isPlayableKey = (k: string) => k in KEY_TO_SEMITONE;

export const noteFromKey = (k: string, octave: number) => {
  const semitone = KEY_TO_SEMITONE[k];
  const midi = semitoneToMidi(semitone, octave);
  return midiToNote(midi);
};
