import * as Tone from "tone";
import type { SynthPreset } from "./types";

export const pluckedString: SynthPreset = {
  id: "pluckedString",
  name: "Plucked String",
  description: "Plucked string physical modeling synth",
  createChain: (destination) => {
    const reverb = new Tone.Reverb({
      decay: 2.5,
      wet: 0.25,
    });

    const filter = new Tone.Filter({
      type: "highpass",
      frequency: 100,
      rolloff: -12,
    });

    const compressor = new Tone.Compressor({
      threshold: -15,
      ratio: 3,
      attack: 0.01,
      release: 0.2,
    });

    const master = new Tone.Gain(1.0).connect(destination);

    const synth = new Tone.PolySynth(Tone.Synth, {
      volume: -6,
      oscillator: {
        type: "triangle",
      },
      envelope: {
        attack: 0.001,
        decay: 0.3,
        sustain: 0.0,
        release: 0.8,
        releaseCurve: "exponential",
      },
    });

    synth.maxPolyphony = 24;
    synth.chain(filter, reverb, compressor, master);

    const dispose = () => {
      synth.dispose();
      reverb.dispose();
      filter.dispose();
      compressor.dispose();
      master.dispose();
    };

    return { instrument: synth, dispose };
  },
};
