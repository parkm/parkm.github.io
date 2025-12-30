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

// Major scale intervals in semitones from the root
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

// Map of note names to their semitone offset from C
const NOTE_TO_SEMITONES: Record<string, number> = {
  'C': 0,
  'C#': 1,
  'D': 2,
  'D#': 3,
  'E': 4,
  'F': 5,
  'F#': 6,
  'G': 7,
  'G#': 8,
  'A': 9,
  'A#': 10,
  'B': 11,
};

// Map of semitone offsets to note names
const SEMITONES_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

let currentKeyCenter = 'C';

export function setKeyCenter(keyCenter: string) {
  currentKeyCenter = keyCenter.toUpperCase();
}

export function getKeyCenter(): string {
  return currentKeyCenter;
}

function getScaleDegreeNote(degree: number): { noteName: string; octaveOffset: number } {
  const rootSemitones = NOTE_TO_SEMITONES[currentKeyCenter];
  if (rootSemitones === undefined) {
    return { noteName: 'C', octaveOffset: 0 }; // fallback
  }

  const degreeIndex = degree - 1; // 1-7 -> 0-6
  if (degreeIndex < 0 || degreeIndex >= MAJOR_SCALE_INTERVALS.length) {
    return { noteName: 'C', octaveOffset: 0 }; // fallback
  }

  const totalSemitones = rootSemitones + MAJOR_SCALE_INTERVALS[degreeIndex];
  const octaveOffset = Math.floor(totalSemitones / 12);
  const noteIndex = totalSemitones % 12;

  return {
    noteName: SEMITONES_TO_NOTE[noteIndex],
    octaveOffset
  };
}

export function parseNotes(text: string, keyCenter: string = 'C'): Note[] {
  currentKeyCenter = keyCenter.toUpperCase();
  const notes: Note[] = [];
  const tokens = text.trim().split(/\s+/);

  for (const token of tokens) {
    if (!token) continue;

    // Check for key center declaration (e.g., "k:D", "K:C#", "k:Db")
    if (token.toLowerCase().startsWith('k:')) {
      const keyPart = token.slice(2).toUpperCase(); // Extract everything after "k:"

      // Parse the key name (might include sharp or flat)
      if (keyPart.length > 0) {
        const baseNote = keyPart[0];
        let keyName = baseNote;

        // Check for accidental
        if (keyPart.length > 1) {
          const accidental = keyPart[1];
          if (accidental === '#' || accidental === 'B') { // 'B' for flat
            keyName = baseNote + '#'; // Store sharp
            // For flats, we need to convert to the enharmonic sharp equivalent
            if (accidental === 'B') {
              // Convert flat to enharmonic sharp
              const flatToSharp: Record<string, string> = {
                'DB': 'C#',
                'EB': 'D#',
                'GB': 'F#',
                'AB': 'G#',
                'BB': 'A#',
              };
              keyName = flatToSharp[baseNote + 'B'] || baseNote;
            }
          }
        }

        // Verify it's a valid note
        const semitones = NOTE_TO_SEMITONES[baseNote];
        if (semitones !== undefined) {
          currentKeyCenter = keyName;
        }
      }
      continue;
    }

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
  let accidentalModifier = 0;

  // Get the base note (first character)
  const firstChar = token[0];
  let noteName = '';

  if (firstChar >= 'A' && firstChar <= 'G') {
    noteName = firstChar;
  } else if (firstChar >= 'a' && firstChar <= 'g') {
    noteName = firstChar.toUpperCase();
    octaveModifier += 1;
  } else if (firstChar >= '1' && firstChar <= '7') {
    // Scale degree notation (1-7)
    const degree = parseInt(firstChar);
    const scaleResult = getScaleDegreeNote(degree);

    // Add any octave offset from the scale degree
    octaveModifier += scaleResult.octaveOffset;

    // Extract the base note and accidental from scale degree result
    if (scaleResult.noteName.length === 2 && (scaleResult.noteName[1] === '#' || scaleResult.noteName[1] === 'b')) {
      // Scale degree returned a sharp or flat (e.g., "F#")
      noteName = scaleResult.noteName[0];
      accidentalModifier = scaleResult.noteName[1] === '#' ? 1 : -1;
    } else {
      noteName = scaleResult.noteName;
    }
  } else {
    return null;
  }

  // Check for accidental (# or b) - must be second character if present (only for non-scale-degrees)
  let accidentalLength = 0;
  if (token.length > 1 && !(firstChar >= '1' && firstChar <= '7')) {
    const secondChar = token[1];
    if (secondChar === '#') {
      accidentalModifier = 1;
      accidentalLength = 1;
    } else if (secondChar === 'b') {
      accidentalModifier = -1;
      accidentalLength = 1;
    }
  } else if (token.length > 1 && (firstChar >= '1' && firstChar <= '7')) {
    // For scale degrees, check for additional accidentals after the degree number
    const secondChar = token[1];
    if (secondChar === '#') {
      accidentalModifier += 1;
      accidentalLength = 1;
    } else if (secondChar === 'b') {
      accidentalModifier -= 1;
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
