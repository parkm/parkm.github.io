import * as Tone from "tone";

export interface NoteInstrument {
  triggerAttack(
    notes: Tone.Unit.Frequency | Tone.Unit.Frequency[],
    time?: Tone.Unit.Time,
    velocity?: number,
  ): this;
  triggerRelease(
    notes: Tone.Unit.Frequency | Tone.Unit.Frequency[],
    time?: Tone.Unit.Time,
  ): this;
  releaseAll(time?: Tone.Unit.Time): this;
}

export type SynthPreset = {
  id: string;
  name: string;
  description: string;
  createChain: (destination: Tone.ToneAudioNode) => {
    instrument: NoteInstrument;
    dispose: () => void;
  };
};
