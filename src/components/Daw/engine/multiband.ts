import { createCrossover, createCrossoverAllpass, gain } from "./dsp";
import { createDynamics } from "./dynamics";
import { blendMix, p, type EffectDef } from "./effectDef";
import { describe, inGroup } from "./params";

/**
 * Three-band compressor that can push loud parts down and pull quiet parts
 * up in each band, like Live's Multiband Dynamics (the OTT preset squashes
 * everything towards one level for that bright, dense, in-your-face sound).
 *
 *   in → crossovers → low / mid / high → dynamics (above + below) → out
 *
 * Each band is one zero-latency dynamics processor: downward compression
 * above the Above threshold, upward compression (quiet parts raised toward
 * it) below the Below threshold.
 */

const BANDS = ["Low", "Mid", "High"] as const;
const KNEE = 6;

const bandParams = (name: string, key: string) =>
  inGroup(
    name,
    describe(
      [
        p(`${key}AboveThreshold`, "Above", -60, 0, -20, "dB"),
        p(`${key}AboveRatio`, "Ratio", 1, 20, 4),
        p(`${key}BelowThreshold`, "Below", -80, 0, -40, "dB"),
        p(`${key}BelowRatio`, "Ratio", 1, 10, 1, undefined, undefined, 0.1),
        { ...p(`${key}Gain`, "Gain", -24, 24, 0, "dB"), step: 0.1 },
      ],
      {
        [`${key}AboveThreshold`]: `${name} band: level above which loud parts are turned down.`,
        [`${key}AboveRatio`]: `${name} band: how hard loud parts are turned down. 1 is off; 20 flattens them like a limiter.`,
        [`${key}BelowThreshold`]: `${name} band: quiet parts below this level are brought up toward it. Set it just under Above to squash everything to one level (OTT); lower leaves more of the dynamics alone.`,
        [`${key}BelowRatio`]: `${name} band: how strongly quiet parts are brought up. 1 is off; 3 to 5 is heavy, OTT-style.`,
        [`${key}Gain`]: `${name} band: level after compression.`,
      },
    ),
  );

export const multibandFx: EffectDef = {
  label: "Multiband",
  mix: "blend",
  params: [
    ...inGroup(
      "Split",
      describe(
        [
          p("lowMid", "Low/Mid", 40, 1000, 120, "Hz", "exp"),
          p("midHigh", "Mid/High", 1000, 12000, 2500, "Hz", "exp"),
          p("attack", "Attack", 0.1, 100, 10, "ms", "exp"),
          p("release", "Release", 10, 1000, 150, "ms", "exp"),
        ],
        {
          lowMid: "Where the low band ends and the mid band starts.",
          midHigh: "Where the mid band ends and the high band starts.",
          attack: "How fast every band reacts to rising level.",
          release:
            "How fast every band lets go. Shorter pumps and brings up more detail; longer is smoother.",
        },
      ),
    ),
    ...BANDS.flatMap((name) => bandParams(name, name.toLowerCase())),
    ...inGroup("Output", [
      {
        ...p("output", "Output", -24, 24, 0, "dB"),
        step: 0.1,
        description: "Level of the whole effect.",
      },
      {
        ...blendMix(
          100,
          "How much of the processed sound to use against the original. OTT is often used at 20 to 50%.",
        ),
        label: "Amount",
      },
    ]),
  ],
  presets: {
    Init: {},
    // Heavy downward compression above each threshold and heavy upward
    // compression just below it, so every band is squashed toward one
    // level, with the lows and highs pushed: the "over the top" sound used
    // all over EDM. Output is set so a loud input comes out about as loud.
    OTT: {
      lowMid: 88,
      midHigh: 2500,
      attack: 5,
      release: 130,
      lowAboveThreshold: -33,
      lowAboveRatio: 20,
      lowBelowThreshold: -39,
      lowBelowRatio: 4,
      lowGain: 3,
      midAboveThreshold: -30,
      midAboveRatio: 20,
      midBelowThreshold: -36,
      midBelowRatio: 4,
      midGain: 0,
      highAboveThreshold: -36,
      highAboveRatio: 20,
      highBelowThreshold: -42,
      highBelowRatio: 4,
      highGain: 4,
      output: 15,
      mix: 50,
    },
    "OTT light": {
      lowMid: 88,
      midHigh: 2500,
      attack: 5,
      release: 130,
      lowAboveThreshold: -33,
      lowAboveRatio: 20,
      lowBelowThreshold: -39,
      lowBelowRatio: 4,
      lowGain: 3,
      midAboveThreshold: -30,
      midAboveRatio: 20,
      midBelowThreshold: -36,
      midBelowRatio: 4,
      highAboveThreshold: -36,
      highAboveRatio: 20,
      highBelowThreshold: -42,
      highBelowRatio: 4,
      highGain: 4,
      output: 15,
      mix: 20,
    },
    "Mix glue": {
      lowAboveThreshold: -18,
      lowAboveRatio: 2,
      midAboveThreshold: -20,
      midAboveRatio: 1.5,
      highAboveThreshold: -22,
      highAboveRatio: 2,
      attack: 20,
      release: 200,
    },
    "Tame lows": {
      lowMid: 150,
      lowAboveThreshold: -24,
      lowAboveRatio: 6,
      attack: 15,
      release: 120,
    },
  },
  build(ctx, input, output) {
    // Split in three. The low band also runs through an all-pass at the
    // Mid/High split (a crossover summed back together), so its phase
    // matches the other two and the bands add back up flat.
    const first = createCrossover(ctx, input);
    const second = createCrossover(ctx, first.high);
    const lowAlign = createCrossoverAllpass(ctx);
    first.low.connect(lowAlign.input);

    // Dry for Amount: the same two phase shifts.
    const dryA = createCrossoverAllpass(ctx);
    const dryB = createCrossoverAllpass(ctx);
    dryA.output.connect(dryB.input);

    const sum = gain(ctx);
    sum.connect(output);
    const bands = [lowAlign.output, second.low, second.high].map((band) => {
      const dyn = createDynamics(ctx);
      band.connect(dyn.input);
      dyn.output.connect(sum);
      return dyn;
    });

    return {
      dry: { input: dryA.input, output: dryB.output },
      update(v) {
        first.set(v.lowMid);
        second.set(v.midHigh);
        lowAlign.set(v.midHigh);
        dryA.set(v.lowMid);
        dryB.set(v.midHigh);
        BANDS.forEach((name, i) => {
          const key = name.toLowerCase();
          bands[i].set({
            threshold: v[`${key}AboveThreshold`],
            ratio: v[`${key}AboveRatio`],
            belowThreshold: v[`${key}BelowThreshold`],
            belowRatio: v[`${key}BelowRatio`],
            knee: KNEE,
            attack: v.attack,
            release: v.release,
            outputGain: v[`${key}Gain`] + v.output,
          });
        });
      },
      // The deepest reduction across the bands.
      reduction: () => Math.min(...bands.map((b) => b.reduction())),
      dispose: () => bands.forEach((b) => b.dispose()),
    };
  },
};
