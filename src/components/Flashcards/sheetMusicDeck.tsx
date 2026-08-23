import type { ReactNode } from "react";
import { GrandStaff, type Feedback } from "./GrandStaff";

export interface Flashcard {
  id: string;
  renderPrompt: (feedback: Feedback) => ReactNode;
  choices: string[];
  answer: string;
  /** Shown after answering, e.g. "C4 · treble clef" */
  detail: string;
}

export interface Deck<Settings> {
  name: string;
  description: string;
  defaultSettings: Settings;
  /** Draws a random card allowed by settings, or null if the pool is empty. */
  draw: (settings: Settings, previousId: string | null) => Flashcard | null;
}

export type Clef = "treble" | "bass";

/** dv is a diatonic value: octave * 7 + letter index (C=0 … B=6), so middle C (C4) = 28. */
export interface StaffNote {
  dv: number;
  clef: Clef;
}

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;

export const letterOf = (dv: number) => LETTERS[dv % 7];
export const nameOf = (dv: number) => `${letterOf(dv)}${Math.floor(dv / 7)}`;

export interface SheetMusicSettings {
  trebleStaff: boolean;
  aboveTreble: boolean;
  belowTreble: boolean;
  bassStaff: boolean;
  aboveBass: boolean;
  belowBass: boolean;
  /** How far the ledger-line zones extend (1–4 ledger lines). */
  ledgerLines: number;
}

type ZoneKey = Exclude<keyof SheetMusicSettings, "ledgerLines">;

export interface Zone {
  key: ZoneKey;
  title: string;
  notes: (ledgerLines: number) => StaffNote[];
}

const range = (from: number, to: number, clef: Clef): StaffNote[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ dv: from + i, clef }));

export const ZONES: Zone[] = [
  {
    key: "trebleStaff",
    title: "Treble staff",
    notes: () => range(30, 38, "treble"),
  },
  {
    key: "aboveTreble",
    title: "Above treble",
    notes: (l) => range(39, 38 + 2 * l, "treble"),
  },
  {
    key: "belowTreble",
    title: "Below treble",
    notes: (l) => range(30 - 2 * l, 29, "treble"),
  },
  { key: "bassStaff", title: "Bass staff", notes: () => range(18, 26, "bass") },
  {
    key: "aboveBass",
    title: "Above bass",
    notes: (l) => range(27, 26 + 2 * l, "bass"),
  },
  {
    key: "belowBass",
    title: "Below bass",
    notes: (l) => range(18 - 2 * l, 17, "bass"),
  },
];

export const zoneRangeLabel = (zone: Zone, ledgerLines: number) => {
  const notes = zone.notes(ledgerLines);
  return `${nameOf(notes[0].dv)}–${nameOf(notes[notes.length - 1].dv)}`;
};

const idOf = (note: StaffNote) => `${note.clef}:${note.dv}`;

export const cardFor = (note: StaffNote): Flashcard => ({
  id: idOf(note),
  renderPrompt: (feedback) => <GrandStaff note={note} feedback={feedback} />,
  choices: [...LETTERS],
  answer: letterOf(note.dv),
  detail: `${nameOf(note.dv)} · ${note.clef} clef`,
});

export const sheetMusicDeck: Deck<SheetMusicSettings> = {
  name: "Sheet Music Notes",
  description: "Name the note shown on the grand staff.",
  defaultSettings: {
    trebleStaff: true,
    aboveTreble: false,
    belowTreble: true,
    bassStaff: true,
    aboveBass: true,
    belowBass: false,
    ledgerLines: 2,
  },
  draw(settings, previousId) {
    const pool = ZONES.filter((zone) => settings[zone.key]).flatMap((zone) =>
      zone.notes(settings.ledgerLines),
    );
    const candidates =
      pool.length > 1 ? pool.filter((note) => idOf(note) !== previousId) : pool;
    if (candidates.length === 0) return null;
    return cardFor(candidates[Math.floor(Math.random() * candidates.length)]);
  },
};
