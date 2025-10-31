import * as Tone from "tone";
import type { SynthPreset } from "./types";

export const square: SynthPreset = {
  id: "square",
  name: "Square Wave",
  description: "It's a square wave",
  createChain: (destination) => {
    const filter = new Tone.Filter({
      type: "lowpass",
      frequency: 3000,
      rolloff: -24,
      Q: 2,
    });

    const reverb = new Tone.Reverb({
      decay: 0.5,
      wet: 0.05,
    });

    const compressor = new Tone.Compressor({
      threshold: -20,
      ratio: 4,
      attack: 0.003,
      release: 0.1,
    });

    const master = new Tone.Gain(0.5).connect(destination);

    const synth = new Tone.PolySynth(Tone.Synth, {
      volume: -12,
      oscillator: {
        type: "square",
      },
      envelope: {
        attack: 0.005,
        decay: 0.1,
        sustain: 0.4,
        release: 0.1,
      },
    });

    synth.maxPolyphony = 32;
    synth.chain(filter, reverb, compressor, master);

    const dispose = () => {
      synth.dispose();
      filter.dispose();
      reverb.dispose();
      compressor.dispose();
      master.dispose();
    };

    return { instrument: synth, dispose };
  },
};
