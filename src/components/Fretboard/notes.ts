const NOTES = [
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
] as const;
const WHITE_NOTES = ["C", "D", "E", "F", "G", "A", "B"];

export type Note = `${(typeof NOTES)[number]}${number}`;

const toMidi = (note: string, octave: number) => {
  const normalized = note.toUpperCase().replace("B", "#");
  const index = NOTES.indexOf(normalized as (typeof NOTES)[number]);
  return (octave + 1) * 12 + index;
};

export const midiToNote = (midi: number): Note => {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTES[midi % 12];
  return `${note}${octave}`;
};

/**
 * Get the note for a guitar string at a given fret
 *
 * Standard tuning strings (low to high): E A D G B E
 * With octaves: E2, A2, D3, G3, B3, E4
 *
 * @param stringIndex - 0-indexed from low string (0=E2, 1=A2, 2=D3, 3=G3, 4=B3, 5=E4)
 * @param fret - Fret number (0 = open string)
 * @param tuning - Note names for each string (default: standard tuning)
 * @param octaves - Octave number for each open string (default: [2,2,3,3,3,4])
 */
export const guitarNote = (
  stringIndex: number,
  fret: number,
  tuning = ["E", "A", "D", "G", "B", "E"],
  octaves = [2, 2, 3, 3, 3, 4],
): Note => midiToNote(toMidi(tuning[stringIndex], octaves[stringIndex]) + fret);

export const guitarRange = () => ({
  min: toMidi("E", 2),
  max: toMidi("E", 4) + 24,
});
export const isWhiteKey = (note: string) =>
  WHITE_NOTES.includes(note.slice(0, -1));
