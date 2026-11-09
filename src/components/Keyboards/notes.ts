import { Chord, Interval, Note } from "tonal";

const PITCH_CLASSES = [
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

export const MIN_OCTAVE = 0;
export const MAX_OCTAVE = 8;
const MIN_PITCH = MIN_OCTAVE * 12;
const MAX_PITCH = MAX_OCTAVE * 12 + 11;

export function parseKey(key: string): { note: string; octave: number } | null {
  const match = /^([A-G]#?)(\d)$/.exec(key);
  if (!match || !PITCH_CLASSES.includes(match[1])) return null;
  const octave = parseInt(match[2]);
  if (octave < MIN_OCTAVE || octave > MAX_OCTAVE) return null;
  return { note: match[1], octave };
}

/** Semitones above C0, or null for an invalid key. */
export function keyToPitch(key: string): number | null {
  const parsed = parseKey(key);
  if (!parsed) return null;
  return parsed.octave * 12 + PITCH_CLASSES.indexOf(parsed.note);
}

export function pitchToKey(pitch: number): string {
  return `${PITCH_CLASSES[pitch % 12]}${Math.floor(pitch / 12)}`;
}

/** Valid, de-duplicated keys sorted from low to high. */
export function normalizeKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  const pitches = new Set<number>();
  for (const key of keys) {
    if (typeof key !== "string") continue;
    const pitch = keyToPitch(key);
    if (pitch !== null) pitches.add(pitch);
  }
  return [...pitches].sort((a, b) => a - b).map(pitchToKey);
}

/**
 * Invert a voicing: "up" moves the lowest note to the first octave above the
 * highest note, "down" moves the highest note to the first octave below the
 * lowest. Returns null when it can't be done: fewer than two notes, or the
 * moved note would land outside the given (visible) range.
 */
export function invert(
  keys: string[],
  direction: "up" | "down",
  range: { startOctave: number; octaves: number } = {
    startOctave: MIN_OCTAVE,
    octaves: MAX_OCTAVE - MIN_OCTAVE + 1,
  },
): string[] | null {
  const minPitch = Math.max(MIN_PITCH, range.startOctave * 12);
  const maxPitch = Math.min(
    MAX_PITCH,
    (range.startOctave + range.octaves) * 12 - 1,
  );
  const pitches = normalizeKeys(keys).map((k) => keyToPitch(k)!);
  if (pitches.length < 2) return null;
  const low = pitches[0];
  const high = pitches[pitches.length - 1];

  if (direction === "up") {
    let moved = low + 12;
    while (moved <= high) moved += 12;
    if (moved > maxPitch) return null;
    return [...pitches.slice(1), moved].map(pitchToKey);
  } else {
    let moved = high - 12;
    while (moved >= low) moved -= 12;
    if (moved < minPitch) return null;
    return [moved, ...pitches.slice(0, -1)].map(pitchToKey);
  }
}

/** Pretty-print sharps, e.g. "C#m7" -> "C♯m7". */
export function prettyNote(note: string): string {
  return note.replaceAll("#", "♯");
}

export function prettyKey(key: string): string {
  return prettyNote(key);
}

/** Best chord name for a set of (sorted) keys, or null if empty. */
export function detectChord(sortedKeys: string[]): string | null {
  if (sortedKeys.length === 0) return null;
  const notes = sortedKeys.map((k) => parseKey(k)!.note);
  const unique = [...new Set(notes)];
  if (unique.length === 1) return prettyNote(unique[0]);
  const [best] = Chord.detect(notes);
  if (!best) return unique.map(prettyNote).join(" ");
  return prettyChordName(best);
}

/** Tidy tonal's chord symbols into the way musicians usually write them. */
function prettyChordName(name: string): string {
  return prettyNote(
    name
      // "CM" → "C", "CMadd9" → "Cadd9"
      .replace(/^([A-G][#b]?)M(?=add|\/|$)/, "$1")
      // "Cm/ma7" → "Cm(maj7)"
      .replace("m/ma7", "m(maj7)")
      // "C6add9" → "C6/9"
      .replace(/6add9/, "6/9"),
  )
    .replace(/(?<=[A-G])b/g, "♭") // B♭, E♭/B♭
    .replace(/b(?=\d)/g, "♭"); // m7♭5, 7♭9
}

// ---------- Chord library ----------

export type ChordQuality = { symbol: string; label: string; name: string };

/** Qualities offered in the chord picker, grouped like a chord chart. */
export const CHORD_GROUPS: { name: string; qualities: ChordQuality[] }[] = [
  {
    name: "Triads",
    qualities: [
      { symbol: "", label: "maj", name: "Major" },
      { symbol: "m", label: "m", name: "Minor" },
      { symbol: "dim", label: "dim", name: "Diminished" },
      { symbol: "aug", label: "aug", name: "Augmented" },
      { symbol: "sus2", label: "sus2", name: "Suspended 2nd" },
      { symbol: "sus4", label: "sus4", name: "Suspended 4th" },
      { symbol: "5", label: "5", name: "Power chord (no 3rd)" },
    ],
  },
  {
    name: "Sevenths",
    qualities: [
      { symbol: "7", label: "7", name: "Dominant 7th" },
      { symbol: "maj7", label: "maj7", name: "Major 7th" },
      { symbol: "m7", label: "m7", name: "Minor 7th" },
      { symbol: "m7b5", label: "m7♭5", name: "Half-diminished" },
      { symbol: "dim7", label: "dim7", name: "Diminished 7th" },
      { symbol: "mMaj7", label: "m(maj7)", name: "Minor-major 7th" },
      { symbol: "7sus4", label: "7sus4", name: "Dominant 7th suspended 4th" },
    ],
  },
  {
    name: "Sixths & added",
    qualities: [
      { symbol: "6", label: "6", name: "Major 6th" },
      { symbol: "m6", label: "m6", name: "Minor 6th" },
      { symbol: "add9", label: "add9", name: "Added 9th" },
      { symbol: "madd9", label: "m(add9)", name: "Minor added 9th" },
      { symbol: "69", label: "6/9", name: "Six-nine" },
      { symbol: "m69", label: "m6/9", name: "Minor six-nine" },
    ],
  },
  {
    name: "Extended",
    qualities: [
      { symbol: "9", label: "9", name: "Dominant 9th" },
      { symbol: "maj9", label: "maj9", name: "Major 9th" },
      { symbol: "m9", label: "m9", name: "Minor 9th" },
      { symbol: "9sus4", label: "9sus4", name: "Dominant 9th suspended 4th" },
      { symbol: "11", label: "11", name: "Dominant 11th" },
      { symbol: "m11", label: "m11", name: "Minor 11th" },
      { symbol: "13", label: "13", name: "Dominant 13th" },
      { symbol: "maj13", label: "maj13", name: "Major 13th" },
      { symbol: "m13", label: "m13", name: "Minor 13th" },
    ],
  },
  {
    name: "Altered",
    qualities: [
      { symbol: "7b9", label: "7♭9", name: "Dominant 7th flat 9" },
      { symbol: "7#9", label: "7♯9", name: "Dominant 7th sharp 9" },
      { symbol: "7#11", label: "7♯11", name: "Dominant 7th sharp 11" },
      { symbol: "7b5", label: "7♭5", name: "Dominant 7th flat 5" },
      { symbol: "7#5", label: "7♯5", name: "Dominant 7th sharp 5" },
    ],
  },
];

export const ROOTS = PITCH_CLASSES;

export type ParsedChord = {
  /** Display name, e.g. "B♭7/D". */
  name: string;
  /** Pitch class of the lowest note's root (0 = C). */
  rootChroma: number;
  /** Semitones above the root, lowest first (slash chords already voiced). */
  semitones: number[];
};

/**
 * Parse a typed chord name like "Dm7", "f#maj9", "B♭7/D" or "Am(maj7)".
 * Returns null if it isn't a chord tonal recognizes.
 */
export function parseChordName(input: string): ParsedChord | null {
  const text = input
    .trim()
    .replace(/\s+/g, "")
    .replaceAll("♯", "#")
    .replaceAll("♭", "b");
  if (!/^[a-gA-G]/.test(text)) return null;
  const normalized = text[0].toUpperCase() + text.slice(1);
  const candidates = [
    normalized,
    normalized.replace(/[()]/g, ""),
    normalized.replace(/[()]/g, "").replace(/maj7$/, "Maj7"),
  ];
  for (const candidate of candidates) {
    const chord = Chord.get(candidate);
    if (chord.empty || !chord.tonic) continue;
    const rootChroma = Note.chroma(chord.tonic);
    if (rootChroma === undefined || Number.isNaN(rootChroma)) continue;
    return {
      name: prettyChordName(chord.symbol),
      rootChroma,
      semitones: chord.intervals.map((i) => Interval.semitones(i) ?? 0),
    };
  }
  return null;
}

/** Notes for one of the picker's chords. */
export function buildChord(rootChroma: number, symbol: string): ParsedChord {
  const chord = Chord.get(PITCH_CLASSES[rootChroma] + symbol);
  return {
    name: prettyChordName(chord.symbol),
    rootChroma,
    semitones: chord.intervals.map((i) => Interval.semitones(i) ?? 0),
  };
}

/**
 * Place a chord on the keyboard: pick the octave that keeps every note inside
 * the visible range, as close to its middle as possible.
 */
export function voiceChord(
  chord: ParsedChord,
  range: { startOctave: number; octaves: number },
): string[] {
  const low = range.startOctave * 12;
  const high = (range.startOctave + range.octaves) * 12 - 1;
  const center = (low + high) / 2;
  let best: number[] | null = null;
  let bestDistance = Infinity;
  for (let octave = MIN_OCTAVE; octave <= MAX_OCTAVE; octave++) {
    const pitches = chord.semitones.map(
      (s) => octave * 12 + chord.rootChroma + s,
    );
    const min = Math.min(...pitches);
    const max = Math.max(...pitches);
    if (min < MIN_PITCH || max > MAX_PITCH) continue;
    // Prefer voicings that fit the visible range, then the most central.
    const fits = min >= low && max <= high;
    const distance = Math.abs((min + max) / 2 - center) + (fits ? 0 : 1000);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = pitches;
    }
  }
  return normalizeKeys((best ?? []).map(pitchToKey));
}
