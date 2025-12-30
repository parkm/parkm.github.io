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
  if (token.length === 0) {
    return null;
  }

  let octaveModifier = 0;

  // Get the base note (first character)
  const firstChar = token[0];
  let noteName = '';

  if (firstChar >= 'A' && firstChar <= 'G') {
    noteName = firstChar;
  } else if (firstChar >= 'a' && firstChar <= 'g') {
    noteName = firstChar.toUpperCase();
    octaveModifier += 1;
  } else {
    return null;
  }

  // Check for accidental (# or b) - must be second character if present
  let accidentalModifier = 0;
  let accidentalLength = 0;
  if (token.length > 1) {
    const secondChar = token[1];
    if (secondChar === '#') {
      accidentalModifier = 1;
      accidentalLength = 1;
    } else if (secondChar === 'b') {
      accidentalModifier = -1;
      accidentalLength = 1;
    }
  }

  // Count octave modifiers (semicolons and commas) - everything after note and optional accidental
  const octaveModifiers = token.slice(1 + accidentalLength);
  for (const char of octaveModifiers) {
    if (char === ';') {
      octaveModifier += 1;
    } else if (char === ',') {
      octaveModifier -= 1;
    }
  }

  const baseFrequency = NOTE_FREQUENCIES[noteName];
  if (!baseFrequency) {
    return null;
  }

  let frequency = baseFrequency * Math.pow(2, octaveModifier);
  frequency = frequency * Math.pow(2, accidentalModifier / 12);

  return {
    note: token,
    frequency,
  };
}
