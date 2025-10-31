import * as Tone from "tone";
import type { SynthPreset } from "./types";

export const metallic: SynthPreset = {
  id: "metallic",
  name: "Metallic",
  description: "Polyphonic metallic synth with high harmonicity",
  createChain: (destination) => {
    const feedbackDelay = new Tone.FeedbackDelay({
      delayTime: "8n",
      feedback: 0.3,
      wet: 0.15,
    });

    const reverb = new Tone.Reverb({
      decay: 1.8,
      wet: 0.2,
    });

    const filter = new Tone.Filter({
      type: "bandpass",
      frequency: 2000,
      Q: 5,
    });

    const compressor = new Tone.Compressor({
      threshold: -16,
      ratio: 4,
      attack: 0.005,
      release: 0.15,
    });

    const master = new Tone.Gain(1.0).connect(destination);

    const synth = new Tone.PolySynth(Tone.MetalSynth, {
      volume: -12,
      harmonicity: 12,
      resonance: 800,
      modulationIndex: 20,
      envelope: {
        attack: 0.001,
        decay: 0.4,
        sustain: 0.1,
        release: 0.8,
      },
      octaves: 1.5,
    });

    synth.maxPolyphony = 12;
    synth.chain(filter, feedbackDelay, reverb, compressor, master);

    const dispose = () => {
      synth.dispose();
      filter.dispose();
      feedbackDelay.dispose();
      reverb.dispose();
      compressor.dispose();
      master.dispose();
    };

    return { instrument: synth, dispose };
  },
};
