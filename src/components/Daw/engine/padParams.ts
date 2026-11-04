import type { ParamDef } from "./params";

/** A drum pad's own settings, beside its voice's params. */

export const PAD_LEVEL: ParamDef = {
  key: "level",
  label: "Level",
  min: -36,
  max: 6,
  default: 0,
  unit: "dB",
  step: 0.1,
  description: "This pad's volume.",
};

export const PAD_PAN: ParamDef = {
  key: "pan",
  label: "Pan",
  min: -1,
  max: 1,
  default: 0,
  step: 0.01,
  description: "Stereo position: -1 is hard left, 0 centre, 1 hard right.",
};

export const PAD_NOTE: ParamDef = {
  key: "note",
  label: "Note",
  min: 0,
  max: 127,
  default: 36,
  description:
    "MIDI note that plays this pad. General MIDI drums: 36 kick, 38 snare, 39 clap, 42 closed hat, 46 open hat.",
};

export const PAD_CHOKE: ParamDef = {
  key: "choke",
  label: "Choke",
  min: 0,
  max: 16,
  default: 0,
  description:
    "Pads in the same choke group cut each other off, like a closed hat stopping an open one. 0 for none.",
};
