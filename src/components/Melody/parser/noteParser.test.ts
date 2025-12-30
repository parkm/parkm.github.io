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
