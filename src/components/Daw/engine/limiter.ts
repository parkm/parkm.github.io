import { createDynamics } from "./dynamics";
import { p, type EffectDef } from "./effectDef";
import { choice, describe, showWhen } from "./params";

/**
 * Brickwall limiter on the shared dynamics processor: instant attack, no
 * knee, infinite ratio. By default there's no lookahead, so it adds no
 * delay; the front of a hard transient is clamped instantly, which can add
 * a little crunch when pushed. Lookahead ramps the gain into peaks instead
 * (cleanest, for the master), and True peak also catches peaks between
 * samples.
 */

const LOOKAHEAD = ["Off", "1 ms", "3 ms", "5 ms"] as const;
const LOOKAHEAD_MS = [0, 1, 3, 5];
export const limiterFx: EffectDef = {
  label: "Limiter",
  params: describe(
    [
      { ...p("gain", "Gain", 0, 24, 0, "dB"), step: 0.1 },
      { ...p("ceiling", "Ceiling", -24, 0, -0.3, "dB"), step: 0.1 },
      p("release", "Release", 1, 1000, 60, "ms", "exp"),
      choice("lookahead", "Lookahead", LOOKAHEAD),
      ...showWhen(
        (v) => v.lookahead > 0,
        [choice("truePeak", "True peak", ["Off", "On"], 1)],
      ),
    ],
    {
      gain: "Drives the sound into the limiter. Each dB here is about a dB louder once it's limiting; watch Reduction.",
      ceiling:
        "The highest level that gets out. Nothing passes above it. -0.3 dB leaves a little room for converters and encoding.",
      release:
        "How fast it recovers after a peak. Short is louder but can distort or pump on bass; long is cleaner but ducks more.",
      lookahead:
        "Off adds no delay. Otherwise the sound is delayed this much so the limiter can ease into each peak instead of clamping it: much cleaner when pushed hard. Best on the master; on a single track it would put that track late.",
      truePeak:
        "Also catches peaks that happen between samples, which can go over the ceiling once the sound is converted or encoded (MP3, streaming). Adds 0.5 ms.",
    },
  ),
  presets: {
    Init: {},
    Master: { gain: 3, ceiling: -1, release: 80, lookahead: 2, truePeak: 1 },
    Loud: { gain: 8, ceiling: -0.3, release: 40 },
    "Catch peaks": { gain: 0, ceiling: -1, release: 150 },
  },
  build(ctx, input, output) {
    const dyn = createDynamics(ctx);
    input.connect(dyn.input);
    dyn.output.connect(output);
    return {
      update(v) {
        dyn.set({
          inputGain: v.gain,
          threshold: v.ceiling,
          ratio: 1000,
          knee: 0,
          attack: 0,
          release: v.release,
          lookahead: LOOKAHEAD_MS[v.lookahead] ?? 0,
          truePeak: v.truePeak === 1,
        });
      },
      reduction: dyn.reduction,
      dispose: dyn.dispose,
    };
  },
};
