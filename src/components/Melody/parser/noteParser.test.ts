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
    expect(result[index].frequency).toBeCloseTo(frequency, 2);
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

    it("should ignore numbers and special characters", () => {
      expectNotes("C 123 D # E", [
        ["C", 261.63],
        ["D", 293.66],
        ["E", 329.63],
      ]);
    });
  });
});
