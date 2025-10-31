import * as Tone from "tone";
import type { SynthPreset } from "./types";

export const fmBass: SynthPreset = {
  id: "fmBass",
  name: "FM Bass",
  description: "Polyphonic FM synthesis bass",
  createChain: (destination) => {
    const filter = new Tone.Filter({
      type: "lowpass",
      frequency: 800,
      rolloff: -24,
      Q: 3,
    });

    const compressor = new Tone.Compressor({
      threshold: -20,
      ratio: 8,
      attack: 0.001,
      release: 0.05,
    });

    const reverb = new Tone.Reverb({
      decay: 0.3,
      wet: 0.05,
    });

    const master = new Tone.Gain(1.0).connect(destination);

    const synth = new Tone.PolySynth(Tone.FMSynth, {
      volume: -8,
      harmonicity: 2,
      modulationIndex: 10,
      oscillator: {
        type: "sine",
      },
      envelope: {
        attack: 0.005,
        decay: 0.3,
        sustain: 0.1,
        release: 0.2,
      },
      modulation: {
        type: "square",
      },
      modulationEnvelope: {
        attack: 0.01,
        decay: 0.5,
        sustain: 0.2,
        release: 0.2,
      },
    });

    synth.maxPolyphony = 8;
    synth.chain(filter, compressor, reverb, master);

    const dispose = () => {
      synth.dispose();
      filter.dispose();
      compressor.dispose();
      reverb.dispose();
      master.dispose();
    };

    return { instrument: synth, dispose };
  },
};
