import { ROUND } from "./course";

const KEYS = [
  "skyTop",
  "skyBottom",
  "sun",
  "far",
  "ground",
  "edge",
  "green",
  "sand",
  "water",
  "flag",
  "ink",
] as const;

export type Palette = Record<(typeof KEYS)[number], string>;

/** One per round of 18 holes, in order, then around again. */
const ROUNDS: Palette[] = [
  {
    skyTop: "#bfe0e2",
    skyBottom: "#eaf3e4",
    sun: "#fff6cf",
    far: "#a5cdb9",
    ground: "#2c6449",
    edge: "#3f8560",
    green: "#7cc77f",
    sand: "#ead9a8",
    water: "#3f93bd",
    flag: "#e2553b",
    ink: "#14301f",
  },
  {
    skyTop: "#f0b99c",
    skyBottom: "#f9e6c6",
    sun: "#fff1d6",
    far: "#d6958c",
    ground: "#5f3a57",
    edge: "#7d4f70",
    green: "#c98aa5",
    sand: "#f3ddb4",
    water: "#4d6fae",
    flag: "#ffd166",
    ink: "#2a1630",
  },
  {
    skyTop: "#cfdded",
    skyBottom: "#f1f5f8",
    sun: "#ffffff",
    far: "#b3c6dc",
    ground: "#44617f",
    edge: "#5c7ea1",
    green: "#a9cbe6",
    sand: "#efe6d0",
    water: "#28557f",
    flag: "#e2553b",
    ink: "#162536",
  },
  {
    skyTop: "#10162b",
    skyBottom: "#27305a",
    sun: "#e8ecff",
    far: "#1d2647",
    ground: "#39447a",
    edge: "#4c5a99",
    green: "#7f93e0",
    sand: "#9a93b8",
    water: "#1b6c9c",
    flag: "#ffd166",
    ink: "#e3e8ff",
  },
];

export const paletteFor = (hole: number) =>
  ROUNDS[Math.floor((hole - 1) / ROUND) % ROUNDS.length];

const channels = (hex: string) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toHex = (rgb: number[]) =>
  "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

/** `t` = 0 gives `a`, 1 gives `b`. */
export function mixPalettes(a: Palette, b: Palette, t: number): Palette {
  if (t <= 0 || a === b) return a;
  if (t >= 1) return b;
  const out = {} as Palette;
  for (const key of KEYS) {
    const from = channels(a[key]);
    const to = channels(b[key]);
    out[key] = toHex(from.map((c, i) => c + (to[i] - c) * t));
  }
  return out;
}
