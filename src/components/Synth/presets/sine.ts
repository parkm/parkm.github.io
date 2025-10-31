import * as Tone from "tone";
import type { SynthPreset } from "./types";

export const sine: SynthPreset = {
  id: "sine",
  name: "Sine Wave",
  description: "It's a sine wave",
  createChain: (destination) => {
    const reverb = new Tone.Reverb({
      decay: 1.5,
      wet: 0.2,
    });

    const compressor = new Tone.Compressor({
      threshold: -15,
      ratio: 2,
      attack: 0.005,
      release: 0.1,
    });

    const master = new Tone.Gain(0.7).connect(destination);

    const synth = new Tone.PolySynth(Tone.Synth, {
      volume: -8,
      oscillator: {
        type: "sine",
      },
      envelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.5,
        release: 0.3,
      },
    });

    synth.maxPolyphony = 32;
    synth.chain(reverb, compressor, master);

    const dispose = () => {
      synth.dispose();
      reverb.dispose();
      compressor.dispose();
      master.dispose();
    };

    return { instrument: synth, dispose };
  },
};
