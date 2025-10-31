import * as Tone from "tone";
import type { SynthPreset } from "./types";

export const grandPiano: SynthPreset = {
  id: "grandPiano",
  name: "Grand Piano",
  description: "A kinda grand piano sound",
  createChain: (destination) => {
    const filter = new Tone.Filter({
      type: "lowpass",
      frequency: 5000,
      rolloff: -12,
      Q: 1,
    });

    const reverb = new Tone.Reverb({
      decay: 2.0,
      wet: 0.15,
    });

    const compressor = new Tone.Compressor({
      threshold: -18,
      ratio: 3,
      attack: 0.003,
      release: 0.1,
    });

    const master = new Tone.Gain(0.6).connect(destination);

    const synth = new Tone.PolySynth(Tone.Synth, {
      volume: -8,
      oscillator: {
        type: "custom",
        partials: [1, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1, 0.05],
      },
      envelope: {
        attack: 0.002,
        attackCurve: "exponential",
        decay: 2.0,
        decayCurve: "exponential",
        sustain: 0.1,
        release: 0.8,
        releaseCurve: "exponential",
      },
    });

    synth.maxPolyphony = 32;
    synth.chain(filter, reverb, compressor, master);

    const originalTriggerAttack = synth.triggerAttack.bind(synth);
    synth.triggerAttack = (
      notes: Tone.Unit.Frequency | Tone.Unit.Frequency[],
      time?: Tone.Unit.Time,
      velocity?: number,
    ) => {
      const vel = velocity ?? 0.8;
      const noteFreq = Array.isArray(notes) ? notes[0] : notes;
      const freq = Tone.Frequency(noteFreq).toFrequency();

      const brightness = 2000 + vel * 6000 + (freq / 440) * 1000;
      filter.frequency.rampTo(Math.min(brightness, 10000), 0.01);

      originalTriggerAttack(notes, time, velocity);

      setTimeout(() => {
        const targetFreq = 1500 + freq * 0.4;
        filter.frequency.rampTo(targetFreq, 2.0);
      }, 20);

      return synth;
    };

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
