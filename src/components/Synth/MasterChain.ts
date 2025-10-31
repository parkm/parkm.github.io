import * as Tone from "tone";

export type MasterChain = {
  input: Tone.Gain;
  output: Tone.Gain;
  meter: Tone.Meter;
  setGain: (db: number) => void;
  setEQ: (eq: { low: number; mid: number; high: number }) => void;
  dispose: () => void;
};

export function createMasterChain(): MasterChain {
  const input = new Tone.Gain(1);

  const eq = new Tone.EQ3({
    low: 0,
    mid: 0,
    high: 0,
    lowFrequency: 250,
    highFrequency: 4000,
  });

  const masterGain = new Tone.Gain(1);
  const meter = new Tone.Meter({
    normalRange: false,
    smoothing: 0.5,
  });
  const output = new Tone.Gain(1).toDestination();

  input.chain(eq, masterGain, output);
  masterGain.connect(meter);

  const setGain = (db: number) => {
    const gain = Tone.dbToGain(db);
    masterGain.gain.rampTo(gain, 0.05);
  };

  const setEQ = (eqValues: { low: number; mid: number; high: number }) => {
    eq.low.rampTo(eqValues.low, 0.05);
    eq.mid.rampTo(eqValues.mid, 0.05);
    eq.high.rampTo(eqValues.high, 0.05);
  };

  const dispose = () => {
    input.dispose();
    eq.dispose();
    masterGain.dispose();
    meter.dispose();
    output.dispose();
  };

  return {
    input,
    output,
    meter,
    setGain,
    setEQ,
    dispose,
  };
}
