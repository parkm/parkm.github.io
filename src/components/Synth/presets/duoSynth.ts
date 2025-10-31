import * as Tone from "tone";
import type { SynthPreset } from "./types";

export const duoSynth: SynthPreset = {
  id: "duoSynth",
  name: "Duo Synth",
  description: "Polyphonic duo synth with two voices",
  createChain: (destination) => {
    const phaser = new Tone.Phaser({
      frequency: 0.5,
      octaves: 3,
      baseFrequency: 350,
      wet: 0.2,
    });

    const reverb = new Tone.Reverb({
      decay: 1.5,
      wet: 0.18,
    });

    const compressor = new Tone.Compressor({
      threshold: -18,
      ratio: 4,
      attack: 0.005,
      release: 0.1,
    });

    const master = new Tone.Gain(1.0).connect(destination);

    const synth = new Tone.PolySynth(Tone.DuoSynth, {
      volume: -10,
      vibratoAmount: 0.5,
      vibratoRate: 5,
      harmonicity: 1.5,
      voice0: {
        oscillator: {
          type: "sawtooth",
        },
        filterEnvelope: {
          attack: 0.01,
          decay: 0.0,
          sustain: 1,
          release: 0.5,
        },
        envelope: {
          attack: 0.01,
          decay: 0.0,
          sustain: 1,
          release: 0.5,
        },
      },
      voice1: {
        oscillator: {
          type: "sawtooth",
        },
        filterEnvelope: {
          attack: 0.01,
          decay: 0.0,
          sustain: 1,
          release: 0.5,
        },
        envelope: {
          attack: 0.01,
          decay: 0.0,
          sustain: 1,
          release: 0.5,
        },
      },
    });

    synth.maxPolyphony = 10;
    synth.chain(phaser, reverb, compressor, master);

    const dispose = () => {
      synth.dispose();
      phaser.dispose();
      reverb.dispose();
      compressor.dispose();
      master.dispose();
    };

    return { instrument: synth, dispose };
  },
};
