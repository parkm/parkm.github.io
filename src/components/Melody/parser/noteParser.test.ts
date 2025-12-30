import { describe, it, expect } from "vitest";
import { parseNotes, type Note } from "./noteParser";

/**
 * Helper function to make test cases easy to write and read
 */
function expectNotes(input: string, expected: Array<[string, number]>) {
  const result = parseNotes(input);
  expect(result).toHaveLength(expected.length);

  expected.forEach(([noteName, frequency], index) => {
    expect(result[index].note).toBe(noteName);
    expect(result[index].frequency).toBeCloseTo(frequency, 1);
  });
}

/**
 * Helper to test a single note
 */
function expectNote(input: string, noteName: string, frequency: number) {
  expectNotes(input, [[noteName, frequency]]);
}

/**
 * Helper to test that input produces no valid notes
 */
function expectEmpty(input: string) {
  const result = parseNotes(input);
  expect(result).toHaveLength(0);
}

describe("noteParser", () => {
  describe("middle C octave (uppercase)", () => {
    it("should parse C (middle C)", () => {
      expectNote("C", "C", 261.63);
    });

    it("should parse D", () => {
      expectNote("D", "D", 293.66);
    });

    it("should parse E", () => {
      expectNote("E", "E", 329.63);
    });

    it("should parse F", () => {
      expectNote("F", "F", 349.23);
    });

    it("should parse G", () => {
      expectNote("G", "G", 392.00);
    });

    it("should parse A", () => {
      expectNote("A", "A", 440.00);
    });

    it("should parse B", () => {
      expectNote("B", "B", 493.88);
    });
  });

  describe("upper octave (lowercase)", () => {
    it("should parse c (C5)", () => {
      expectNote("c", "c", 523.26);
    });

    it("should parse d (D5)", () => {
      expectNote("d", "d", 587.32);
    });

    it("should parse e (E5)", () => {
      expectNote("e", "e", 659.26);
    });

    it("should parse g (G5)", () => {
      expectNote("g", "g", 784.00);
    });

    it("should parse a (A5)", () => {
      expectNote("a", "a", 880.00);
    });
  });

  describe("lower octave (comma suffix)", () => {
    it("should parse C, (C3)", () => {
      expectNote("C,", "C,", 130.82);
    });

    it("should parse D, (D3)", () => {
      expectNote("D,", "D,", 146.83);
    });

    it("should parse E, (E3)", () => {
      expectNote("E,", "E,", 164.82);
    });

    it("should parse G, (G3)", () => {
      expectNote("G,", "G,", 196.00);
    });

    it("should parse A, (A3)", () => {
      expectNote("A,", "A,", 220.00);
    });
  });

  describe("semicolon octave modifiers (raise octave)", () => {
    it("should parse C; (C5) - same as c", () => {
      expectNote("C;", "C;", 523.26);
    });

    it("should parse D; (D5)", () => {
      expectNote("D;", "D;", 587.32);
    });

    it("should parse C;; (C6)", () => {
      expectNote("C;;", "C;;", 1046.52);
    });

    it("should parse C;;; (C7)", () => {
      expectNote("C;;;", "C;;;", 2093.04);
    });

    it("should verify C; and c are the same", () => {
      const cSemi = parseNotes("C;")[0];
      const cLower = parseNotes("c")[0];
      expect(cSemi.frequency).toBeCloseTo(cLower.frequency, 1);
    });
  });

  describe("comma octave modifiers (lower octave)", () => {
    it("should parse C,, (C2)", () => {
      expectNote("C,,", "C,,", 65.41);
    });

    it("should parse D,, (D2)", () => {
      expectNote("D,,", "D,,", 73.42);
    });

    it("should parse C,,, (C1)", () => {
      expectNote("C,,,", "C,,,", 32.70);
    });
  });

  describe("mixed octave modifiers", () => {
    it("should parse c; (C6)", () => {
      expectNote("c;", "c;", 1046.52);
    });

    it("should parse c;; (C7)", () => {
      expectNote("c;;", "c;;", 2093.04);
    });

    it("should parse c, (C4) - lowercase with comma", () => {
      expectNote("c,", "c,", 261.63);
    });

    it("should parse c,, (C3)", () => {
      expectNote("c,,", "c,,", 130.82);
    });

    it("should verify c, and C are the same", () => {
      const cLowerComma = parseNotes("c,")[0];
      const cUpper = parseNotes("C")[0];
      expect(cLowerComma.frequency).toBeCloseTo(cUpper.frequency, 1);
    });
  });

  describe("octave modifiers with accidentals", () => {
    it("should parse C#; (C#5)", () => {
      expectNote("C#;", "C#;", 554.37);
    });

    it("should parse Db;; (Db6)", () => {
      expectNote("Db;;", "Db;;", 1108.73);
    });

    it("should parse F#, (F#3)", () => {
      expectNote("F#,", "F#,", 185.00);
    });

    it("should parse Gb,, (Gb2)", () => {
      expectNote("Gb,,", "Gb,,", 92.50);
    });

    it("should parse c#; (C#6)", () => {
      expectNote("c#;", "c#;", 1108.73);
    });

    it("should parse db, (Db4)", () => {
      expectNote("db,", "db,", 277.18);
    });
  });

  describe("multiple notes", () => {
    it("should parse C major scale in middle octave", () => {
      expectNotes("C D E F G A B", [
        ["C", 261.63],
        ["D", 293.66],
        ["E", 329.63],
        ["F", 349.23],
        ["G", 392.00],
        ["A", 440.00],
        ["B", 493.88],
      ]);
    });

    it("should parse notes across octaves", () => {
      expectNotes("C, C D c", [
        ["C,", 130.82],
        ["C", 261.63],
        ["D", 293.66],
        ["c", 523.26],
      ]);
    });

    it("should parse notes with octave modifiers", () => {
      expectNotes("C,, C, C C; c c; c;;", [
        ["C,,", 65.41],
        ["C,", 130.82],
        ["C", 261.63],
        ["C;", 523.26],
        ["c", 523.26],
        ["c;", 1046.52],
        ["c;;", 2093.04],
      ]);
    });

    it("should handle multiple spaces", () => {
      expectNotes("C  D   E", [
        ["C", 261.63],
        ["D", 293.66],
        ["E", 329.63],
      ]);
    });

    it("should handle leading and trailing whitespace", () => {
      expectNotes("  C D E  ", [
        ["C", 261.63],
        ["D", 293.66],
        ["E", 329.63],
      ]);
    });
  });

  describe("sharps (middle octave)", () => {
    it("should parse C# (C sharp)", () => {
      expectNote("C#", "C#", 277.18);
    });

    it("should parse D# (D sharp)", () => {
      expectNote("D#", "D#", 311.13);
    });

    it("should parse F# (F sharp)", () => {
      expectNote("F#", "F#", 369.99);
    });

    it("should parse G# (G sharp)", () => {
      expectNote("G#", "G#", 415.30);
    });

    it("should parse A# (A sharp)", () => {
      expectNote("A#", "A#", 466.16);
    });
  });

  describe("flats (middle octave)", () => {
    it("should parse Db (D flat)", () => {
      expectNote("Db", "Db", 277.18);
    });

    it("should parse Eb (E flat)", () => {
      expectNote("Eb", "Eb", 311.13);
    });

    it("should parse Gb (G flat)", () => {
      expectNote("Gb", "Gb", 369.99);
    });

    it("should parse Ab (A flat)", () => {
      expectNote("Ab", "Ab", 415.30);
    });

    it("should parse Bb (B flat)", () => {
      expectNote("Bb", "Bb", 466.16);
    });
  });

  describe("sharps (upper octave)", () => {
    it("should parse c# (C#5)", () => {
      expectNote("c#", "c#", 554.37);
    });

    it("should parse d# (D#5)", () => {
      expectNote("d#", "d#", 622.25);
    });

    it("should parse f# (F#5)", () => {
      expectNote("f#", "f#", 739.99);
    });

    it("should parse g# (G#5)", () => {
      expectNote("g#", "g#", 830.61);
    });
  });

  describe("flats (upper octave)", () => {
    it("should parse db (Db5)", () => {
      expectNote("db", "db", 554.37);
    });

    it("should parse eb (Eb5)", () => {
      expectNote("eb", "eb", 622.25);
    });

    it("should parse gb (Gb5)", () => {
      expectNote("gb", "gb", 739.99);
    });

    it("should parse ab (Ab5)", () => {
      expectNote("ab", "ab", 830.61);
    });
  });

  describe("sharps and flats (lower octave)", () => {
    it("should parse C#, (C#3)", () => {
      expectNote("C#,", "C#,", 138.59);
    });

    it("should parse Db, (Db3)", () => {
      expectNote("Db,", "Db,", 138.59);
    });

    it("should parse F#, (F#3)", () => {
      expectNote("F#,", "F#,", 185.00);
    });

    it("should parse Gb, (Gb3)", () => {
      expectNote("Gb,", "Gb,", 185.00);
    });
  });

  describe("mixed sequences with accidentals", () => {
    it("should parse chromatic scale segment", () => {
      expectNotes("C C# D D# E", [
        ["C", 261.63],
        ["C#", 277.18],
        ["D", 293.66],
        ["D#", 311.13],
        ["E", 329.63],
      ]);
    });

    it("should parse mixed sharps and flats", () => {
      expectNotes("C# Db D# Eb", [
        ["C#", 277.18],
        ["Db", 277.18],
        ["D#", 311.13],
        ["Eb", 311.13],
      ]);
    });

    it("should parse across octaves with accidentals", () => {
      expectNotes("C#, C# c#", [
        ["C#,", 138.59],
        ["C#", 277.18],
        ["c#", 554.37],
      ]);
    });

    it("should mix naturals and accidentals", () => {
      expectNotes("C D# E F# G", [
        ["C", 261.63],
        ["D#", 311.13],
        ["E", 329.63],
        ["F#", 369.99],
        ["G", 392.00],
      ]);
    });
  });

  describe("scale degrees (C major)", () => {
    it("should parse 1 as C (middle C)", () => {
      expectNote("1", "1", 261.63);
    });

    it("should parse 2 as D", () => {
      expectNote("2", "2", 293.66);
    });

    it("should parse 3 as E", () => {
      expectNote("3", "3", 329.63);
    });

    it("should parse 4 as F", () => {
      expectNote("4", "4", 349.23);
    });

    it("should parse 5 as G", () => {
      expectNote("5", "5", 392.00);
    });

    it("should parse 6 as A", () => {
      expectNote("6", "6", 440.00);
    });

    it("should parse 7 as B", () => {
      expectNote("7", "7", 493.88);
    });
  });

  describe("scale degrees with accidentals", () => {
    it("should parse 1# as C#", () => {
      expectNote("1#", "1#", 277.18);
    });

    it("should parse 4# as F#", () => {
      expectNote("4#", "4#", 369.99);
    });

    it("should parse 5b as Gb", () => {
      expectNote("5b", "5b", 369.99);
    });

    it("should parse 2b as Db", () => {
      expectNote("2b", "2b", 277.18);
    });
  });

  describe("scale degrees with octave modifiers", () => {
    it("should parse 1; as C5 (one octave up)", () => {
      expectNote("1;", "1;", 523.26);
    });

    it("should parse 1, as C3 (one octave down)", () => {
      expectNote("1,", "1,", 130.82);
    });

    it("should parse 5;; as G6 (two octaves up)", () => {
      expectNote("5;;", "5;;", 1568.00);
    });

    it("should parse 5,, as G2 (two octaves down)", () => {
      expectNote("5,,", "5,,", 98.00);
    });
  });

  describe("scale degrees with accidentals and octave modifiers", () => {
    it("should parse 4#; as F#5", () => {
      expectNote("4#;", "4#;", 739.99);
    });

    it("should parse 5b,, as Gb2", () => {
      expectNote("5b,,", "5b,,", 92.50);
    });

    it("should parse 1#;; as C#6", () => {
      expectNote("1#;;", "1#;;", 1108.73);
    });
  });

  describe("mixed scale degrees and note names", () => {
    it("should parse a C major scale using scale degrees", () => {
      expectNotes("1 2 3 4 5 6 7", [
        ["1", 261.63],
        ["2", 293.66],
        ["3", 329.63],
        ["4", 349.23],
        ["5", 392.00],
        ["6", 440.00],
        ["7", 493.88],
      ]);
    });

    it("should mix scale degrees and note names", () => {
      expectNotes("1 D 3 F 5", [
        ["1", 261.63],
        ["D", 293.66],
        ["3", 329.63],
        ["F", 349.23],
        ["5", 392.00],
      ]);
    });

    it("should parse user example: 1; 1, 2, 1# 4#; 5b 5b,,", () => {
      expectNotes("1; 1, 2, 1# 4#; 5b 5b,,", [
        ["1;", 523.26],
        ["1,", 130.82],
        ["2,", 146.83],
        ["1#", 277.18],
        ["4#;", 739.99],
        ["5b", 369.99],
        ["5b,,", 92.50],
      ]);
    });
  });

  describe("key center support", () => {
    it("should parse scale degrees in D major using k: prefix", () => {
      expectNotes("k:D 1 2 3 4 5 6 7", [
        ["1", 293.66],   // D4
        ["2", 329.63],   // E4
        ["3", 369.99],   // F#4
        ["4", 392.00],   // G4
        ["5", 440.00],   // A4
        ["6", 493.88],   // B4
        ["7", 554.37],   // C#5 (crosses octave)
      ]);
    });

    it("should parse scale degrees in G major using k: prefix", () => {
      expectNotes("k:G 1 2 3 4 5 6 7", [
        ["1", 392.00],   // G4
        ["2", 440.00],   // A4
        ["3", 493.88],   // B4
        ["4", 523.26],   // C5 (crosses octave)
        ["5", 587.32],   // D5
        ["6", 659.26],   // E5
        ["7", 739.99],   // F#5
      ]);
    });

    it("should parse scale degrees in F major using k: prefix", () => {
      expectNotes("k:F 1 2 3 4 5", [
        ["1", 349.23],   // F4
        ["2", 392.00],   // G4
        ["3", 440.00],   // A4
        ["4", 466.16],   // Bb4
        ["5", 523.26],   // C5 (crosses octave)
      ]);
    });

    it("should parse scale degrees in A major", () => {
      expectNotes("k:A 1 4 5", [
        ["1", 440.00],   // A4
        ["4", 587.32],   // D5 (crosses octave)
        ["5", 659.26],   // E5
      ]);
    });

    it("should parse scale degrees in E major", () => {
      expectNotes("k:E 1 2 3", [
        ["1", 329.63],   // E4
        ["2", 369.99],   // F#4
        ["3", 415.30],   // G#4
      ]);
    });

    it("should parse scale degrees in B major", () => {
      expectNotes("k:B 1 5", [
        ["1", 493.88],   // B4
        ["5", 739.99],   // F#5 (crosses octave)
      ]);
    });

    it("should support K: uppercase format", () => {
      expectNotes("K:D 1 2 3", [
        ["1", 293.66],   // D
        ["2", 329.63],   // E
        ["3", 369.99],   // F#
      ]);
    });

    it("should support sharps in key names (k:C#)", () => {
      expectNotes("k:C# 1 2 3", [
        ["1", 277.18],   // C#
        ["2", 311.13],   // D#
        ["3", 349.23],   // F (E#)
      ]);
    });

    it("should support flats in key names (k:Db)", () => {
      expectNotes("k:Db 1 2 3", [
        ["1", 277.18],   // Db (same as C#)
        ["2", 311.13],   // Eb (same as D#)
        ["3", 349.23],   // F
      ]);
    });

    it("should support F# major", () => {
      expectNotes("k:F# 1 2 3", [
        ["1", 369.99],   // F#
        ["2", 415.30],   // G#
        ["3", 466.16],   // A#
      ]);
    });

    it("should support dynamic key changes", () => {
      expectNotes("1 2 3 k:D 1 2 3 k:G 1 2", [
        ["1", 261.63],   // C (key of C)
        ["2", 293.66],   // D
        ["3", 329.63],   // E
        ["1", 293.66],   // D (key of D)
        ["2", 329.63],   // E
        ["3", 369.99],   // F#
        ["1", 392.00],   // G (key of G)
        ["2", 440.00],   // A
      ]);
    });

    it("should support accidentals in different keys", () => {
      expectNotes("k:G 1# 4# 5b", [
        ["1#", 415.30],  // G#4
        ["4#", 554.37],  // C#5 (C natural would be C5, so C# is also C#5)
        ["5b", 554.37],  // Db5 (same as C#5)
      ]);
    });

    it("should support octave modifiers in different keys", () => {
      expectNotes("k:D 1; 1, 5;;", [
        ["1;", 587.32],   // D5
        ["1,", 146.83],   // D3
        ["5;;", 1760.00], // A6
      ]);
    });

    it("should parse Bb major scale correctly", () => {
      expectNotes("k:Bb 1 2 3 4 5 6 7 1;", [
        ["1", 466.16],   // Bb4
        ["2", 523.26],   // C5
        ["3", 587.32],   // D5
        ["4", 622.25],   // Eb5
        ["5", 698.46],   // F5
        ["6", 783.99],   // G5
        ["7", 880.00],   // A5
        ["1;", 932.33],  // Bb5 (octave up)
      ]);
    });
  });

  describe("specific bug tests", () => {
    it("should parse 'c c;' as two different frequencies an octave apart", () => {
      const result = parseNotes("c c;");
      expect(result).toHaveLength(2);
      expect(result[0].note).toBe("c");
      expect(result[1].note).toBe("c;");
      expect(result[0].frequency).toBeCloseTo(523.26, 1);
      expect(result[1].frequency).toBeCloseTo(1046.52, 1);
      // Verify they are exactly one octave apart
      expect(result[1].frequency / result[0].frequency).toBeCloseTo(2, 1);
    });
  });

  describe("edge cases", () => {
    it("should return empty array for empty string", () => {
      expectEmpty("");
    });

    it("should return empty array for whitespace only", () => {
      expectEmpty("   ");
    });

    it("should ignore invalid note names", () => {
      expectEmpty("X Y Z");
    });

    it("should parse valid notes and skip invalid ones", () => {
      expectNotes("C X D Y E", [
        ["C", 261.63],
        ["D", 293.66],
        ["E", 329.63],
      ]);
    });

    it("should ignore standalone #", () => {
      expectNotes("C # D # E", [
        ["C", 261.63],
        ["D", 293.66],
        ["E", 329.63],
      ]);
    });

    it("should parse lowercase b as B5", () => {
      expectNote("b", "b", 987.77);
    });
  });
});
