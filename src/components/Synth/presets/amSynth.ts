import * as Tone from "tone";
import type { SynthPreset } from "./types";

export const amSynth: SynthPreset = {
  id: "amSynth",
  name: "AM Synth",
  description: "Polyphonic amplitude modulation synth",
  createChain: (destination) => {
    const chorus = new Tone.Chorus({
      frequency: 2,
      delayTime: 3.5,
      depth: 0.5,
      wet: 0.3,
    });

    const reverb = new Tone.Reverb({
      decay: 1.2,
      wet: 0.15,
    });

    const compressor = new Tone.Compressor({
      threshold: -18,
      ratio: 4,
      attack: 0.003,
      release: 0.1,
    });

    const master = new Tone.Gain(2.25).connect(destination);

    const synth = new Tone.PolySynth(Tone.AMSynth, {
      volume: -10,
      harmonicity: 3,
      oscillator: {
        type: "sine",
      },
      envelope: {
        attack: 0.01,
        decay: 0.3,
        sustain: 0.4,
        release: 0.8,
      },
      modulation: {
        type: "square",
      },
      modulationEnvelope: {
        attack: 0.5,
        decay: 0.2,
        sustain: 1,
        release: 0.5,
      },
    });

    synth.maxPolyphony = 16;
    synth.chain(chorus, reverb, compressor, master);

    chorus.start();

    const dispose = () => {
      chorus.stop();
      synth.dispose();
      chorus.dispose();
      reverb.dispose();
      compressor.dispose();
      master.dispose();
    };

    return { instrument: synth, dispose };
  },
};
