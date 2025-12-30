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
  let octaveModifier = 0;
  let workingToken = token;

  // Check for lower octave comma suffix
  if (workingToken.endsWith(',')) {
    octaveModifier = -1;
    workingToken = workingToken.slice(0, -1);
  }

  if (workingToken.length === 0) {
    return null;
  }

  // Get the base note
  const firstChar = workingToken[0];
  let noteName = '';

  if (firstChar >= 'A' && firstChar <= 'G') {
    noteName = firstChar;
  } else if (firstChar >= 'a' && firstChar <= 'g') {
    noteName = firstChar.toUpperCase();
    octaveModifier += 1;
  } else {
    return null;
  }

  // Check for accidental (# or b)
  let accidentalModifier = 0;
  if (workingToken.length > 1) {
    const accidental = workingToken[1];
    if (accidental === '#') {
      accidentalModifier = 1;
    } else if (accidental === 'b') {
      accidentalModifier = -1;
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
