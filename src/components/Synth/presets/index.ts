import type { SynthPreset } from "./types";
import { grandPiano } from "./grandPiano";
import { square } from "./square";
import { sine } from "./sine";
import { monoLead } from "./monoLead";
import { fmBass } from "./fmBass";
import { amSynth } from "./amSynth";
import { pluckedString } from "./pluckedString";
import { metallic } from "./metallic";
import { duoSynth } from "./duoSynth";

export { type SynthPreset, type NoteInstrument } from "./types";

export const PRESETS: Record<string, SynthPreset> = {
  grandPiano,
  monoLead,
  fmBass,
  amSynth,
  pluckedString,
  metallic,
  duoSynth,
  square,
  sine,
};

export const DEFAULT_PRESET_ID = "grandPiano";
