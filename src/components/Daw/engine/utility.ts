import {
  createBalance,
  createCrossover,
  createWidth,
  dbToGain,
  gain,
  setParam,
  stereoGain,
} from "./dsp";
import { p, type EffectDef } from "./effectDef";
import { choice, describe } from "./params";

/**
 * Utility: the small fixes every mix needs. Phase flip → bass split → width
 * (bass below the split goes mono) → balance → gain.
 */

const INVERT = ["Off", "Left", "Right", "Both"] as const;
/** "Bass mono" knob position that means off. */
const BASS_MONO_OFF = 20;

export const utilityFx: EffectDef = {
  label: "Utility",
  params: describe(
    [
      { ...p("gain", "Gain", -36, 36, 0, "dB"), step: 0.1 },
      p("width", "Width", 0, 200, 100, "%"),
      choice("mono", "Mono", ["Off", "On"]),
      p(
        "bassMono",
        "Bass mono",
        BASS_MONO_OFF,
        500,
        BASS_MONO_OFF,
        "Hz",
        "exp",
      ),
      p("balance", "Balance", -100, 100, 0, "%"),
      choice("invert", "Phase", INVERT),
    ],
    {
      gain: "Level change, up to 36 dB either way.",
      width:
        "Stereo spread. 0% is mono, 100% unchanged, above that wider. Mono-heavy sounds (most bass) don't get louder or quieter as you change it.",
      mono: "Sums left and right to mono, for checking how a mix holds up on one speaker.",
      bassMono:
        "Everything below this frequency goes mono, so the low end stays solid on club systems and phone speakers while the highs keep their width. Try 100 to 150 Hz. All the way down is off.",
      balance:
        "Turns one side down. Negative turns the right side down, positive the left.",
      invert:
        "Flips the waveform of one or both sides. Fixes a sound that cancels out when layered with another, or checks a stereo recording for phase problems.",
    },
  ),
  build(ctx, input, output) {
    const stereo = stereoGain(ctx);
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    const flipL = gain(ctx);
    const flipR = gain(ctx);
    input.connect(stereo).connect(split);
    split.connect(flipL, 0).connect(merge, 0, 0);
    split.connect(flipR, 1).connect(merge, 0, 1);

    const bands = createCrossover(ctx, merge);
    const lowWidth = createWidth(ctx);
    const highWidth = createWidth(ctx);
    bands.low.connect(lowWidth.input);
    bands.high.connect(highWidth.input);
    const balance = createBalance(ctx, 0);
    lowWidth.output.connect(balance.input);
    highWidth.output.connect(balance.input);
    const level = gain(ctx);
    balance.output.connect(level).connect(output);

    return {
      update(v) {
        setParam(flipL.gain, v.invert === 1 || v.invert === 3 ? -1 : 1, ctx);
        setParam(flipR.gain, v.invert === 2 || v.invert === 3 ? -1 : 1, ctx);
        const width = v.mono === 1 ? 0 : v.width / 100;
        const bassOn = v.bassMono > BASS_MONO_OFF;
        // Off: both bands get the same width, so the split changes nothing.
        if (bassOn) bands.set(v.bassMono);
        lowWidth.set(bassOn ? 0 : width);
        highWidth.set(width);
        balance.set(v.balance / 100);
        setParam(level.gain, dbToGain(v.gain), ctx);
      },
    };
  },
};
