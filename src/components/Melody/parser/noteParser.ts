export type Note = {
  note: string;
  frequency: number;
};

const NOTE_FREQUENCIES: Record<string, number> = {
  'C': 261.63,  // C4 (middle C)
  'D': 293.66,  // D4
  'E': 329.63,  // E4
  'F': 349.23,  // F4
  'G': 392.00,  // G4
  'A': 440.00,  // A4
  'B': 493.88,  // B4
};

export function parseNotes(text: string): Note[] {
  const notes: Note[] = [];
  const tokens = text.trim().split(/\s+/);

  for (const token of tokens) {
    if (!token) continue;

    const parsed = parseNote(token);
    if (parsed) {
      notes.push(parsed);
    }
  }

  return notes;
}

function parseNote(token: string): Note | null {
  let noteName = '';
  let octaveModifier = 0;

  if (token.endsWith(',')) {
    noteName = token.slice(0, -1).toUpperCase();
    octaveModifier = -1;
  } else {
    const char = token[0];
    if (char >= 'A' && char <= 'G') {
      noteName = char;
      octaveModifier = 0;
    } else if (char >= 'a' && char <= 'g') {
      noteName = char.toUpperCase();
      octaveModifier = 1;
    } else {
      return null;
    }
  }

  const baseFrequency = NOTE_FREQUENCIES[noteName];
  if (!baseFrequency) {
    return null;
  }

  const frequency = baseFrequency * Math.pow(2, octaveModifier);

  return {
    note: token,
    frequency,
  };
}
