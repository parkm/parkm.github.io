import * as Tone from "tone";
import type { SynthPreset, NoteInstrument } from "./types";

export const monoLead: SynthPreset = {
  id: "monoLead",
  name: "Mono Lead",
  description: "Monophonic lead synth with glide",
  createChain: (destination) => {
    const filter = new Tone.Filter({
      type: "lowpass",
      frequency: 2000,
      rolloff: -24,
      Q: 8,
    });

    const distortion = new Tone.Distortion({
      distortion: 0.4,
      wet: 0.3,
    });

    const reverb = new Tone.Reverb({
      decay: 0.8,
      wet: 0.1,
    });

    const compressor = new Tone.Compressor({
      threshold: -24,
      ratio: 6,
      attack: 0.003,
      release: 0.1,
    });

    const master = new Tone.Gain(0.8).connect(destination);

    const synth = new Tone.MonoSynth({
      volume: -10,
      oscillator: {
        type: "sawtooth",
      },
      filter: {
        Q: 2,
        type: "lowpass",
        rolloff: -12,
      },
      envelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.6,
        release: 0.3,
      },
      filterEnvelope: {
        attack: 0.02,
        decay: 0.3,
        sustain: 0.4,
        release: 0.5,
        baseFrequency: 200,
        octaves: 4,
      },
      portamento: 0.12,
    });

    synth.chain(filter, distortion, reverb, compressor, master);

    const activeNotes = new Set<string>();

    const instrument: NoteInstrument = {
      triggerAttack: (notes, time, velocity) => {
        const note = Array.isArray(notes) ? notes[0] : notes;
        const noteStr = typeof note === "string" ? note : String(note);
        activeNotes.add(noteStr);
        synth.triggerAttack(note, time, velocity);
        return instrument;
      },
      triggerRelease: (notes, time) => {
        const note = Array.isArray(notes) ? notes[0] : notes;
        const noteStr = typeof note === "string" ? note : String(note);
        activeNotes.delete(noteStr);

        if (activeNotes.size === 0) {
          synth.triggerRelease(time);
        }
        return instrument;
      },
      releaseAll: (time) => {
        activeNotes.clear();
        synth.triggerRelease(time);
        return instrument;
      },
    };

    const dispose = () => {
      synth.dispose();
      filter.dispose();
      distortion.dispose();
      reverb.dispose();
      compressor.dispose();
      master.dispose();
    };

    return { instrument, dispose };
  },
};
