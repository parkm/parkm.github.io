import {
  createAlignDelay,
  createCrossover,
  createCrossoverAllpass,
  dbToGain,
  gain,
  ms,
  nativeMakeup,
  setParam,
} from "./dsp";
import { blendMix, p, type EffectDef } from "./effectDef";
import { describe, inGroup } from "./params";

/**
 * Three-band compressor that can push loud parts down and pull quiet parts
 * up in each band, like Live's Multiband Dynamics (the OTT preset squashes
 * everything towards one level for that bright, dense, in-your-face sound).
 *
 *   in → crossovers → low / mid / high → Below stage → Above stage → band gain → out
 *
 * Above is plain downward compression. The native compressor can't compress
 * upwards, so Below is a downward compressor with a low threshold plus
 * makeup that brings it back to unity at the Above threshold: between the
 * two thresholds the sound is raised and squeezed (upward compression);
 * below both it's raised by the full makeup.
 */

const BANDS = ["Low", "Mid", "High"] as const;
const KNEE = 6;
/** Two native compressors in series per band, 6 ms lookahead each. */
const LATENCY = 0.012;

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
        [`${key}BelowThreshold`]: `${name} band: level above which quiet parts are brought up towards the Above threshold. Lower reaches quieter details: tails, room, breaths.`,
        [`${key}BelowRatio`]: `${name} band: how strongly quiet parts are brought up. 1 is off; 3 to 5 is heavy, OTT-style.`,
        [`${key}Gain`]: `${name} band: level after compression.`,
      },
    ),
  );

export const multibandFx: EffectDef = {
  label: "Multiband",
  mix: "blend",
  latency: () => LATENCY,
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
    // Heavy upward and downward compression on every band, with the
    // highs pushed: the "over the top" sound used all over EDM.
    OTT: {
      lowMid: 88,
      midHigh: 2500,
      attack: 5,
      release: 130,
      lowAboveThreshold: -33,
      lowAboveRatio: 20,
      lowBelowThreshold: -55,
      lowBelowRatio: 4,
      lowGain: 3,
      midAboveThreshold: -30,
      midAboveRatio: 20,
      midBelowThreshold: -50,
      midBelowRatio: 4,
      midGain: 0,
      highAboveThreshold: -36,
      highAboveRatio: 20,
      highBelowThreshold: -55,
      highBelowRatio: 4,
      highGain: 4,
      output: 14,
      mix: 50,
    },
    "OTT light": {
      lowMid: 88,
      midHigh: 2500,
      attack: 5,
      release: 130,
      lowAboveThreshold: -33,
      lowAboveRatio: 20,
      lowBelowThreshold: -55,
      lowBelowRatio: 4,
      lowGain: 3,
      midAboveThreshold: -30,
      midAboveRatio: 20,
      midBelowThreshold: -50,
      midBelowRatio: 4,
      highAboveThreshold: -36,
      highAboveRatio: 20,
      highBelowThreshold: -55,
      highBelowRatio: 4,
      highGain: 4,
      output: 14,
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
    const lowAlign = createCrossover(ctx, first.low);
    const lowIn = gain(ctx);
    lowAlign.low.connect(lowIn);
    lowAlign.high.connect(lowIn);

    // Dry for Amount: the same two phase shifts and the compressors' delay.
    const dryA = createCrossoverAllpass(ctx);
    const dryB = createCrossoverAllpass(ctx);
    dryA.output.connect(dryB.input);
    const dryDelay = createAlignDelay(ctx, LATENCY);
    dryB.output.connect(dryDelay);

    const bands = [lowIn, second.low, second.high].map((band) => {
      const below = ctx.createDynamicsCompressor();
      const belowGain = gain(ctx);
      const above = ctx.createDynamicsCompressor();
      const aboveGain = gain(ctx);
      const level = gain(ctx);
      below.knee.value = KNEE;
      above.knee.value = KNEE;
      band.connect(below).connect(belowGain).connect(above);
      above.connect(aboveGain).connect(level).connect(output);
      return { below, belowGain, above, aboveGain, level };
    });

    return {
      dry: { input: dryA.input, output: dryDelay },
      update(v) {
        dryA.set(v.lowMid);
        dryB.set(v.midHigh);
        first.set(v.lowMid);
        second.set(v.midHigh);
        lowAlign.set(v.midHigh);
        BANDS.forEach((name, i) => {
          const key = name.toLowerCase();
          const b = bands[i];
          const aboveT = v[`${key}AboveThreshold`];
          const aboveR = v[`${key}AboveRatio`];
          const belowT = Math.min(v[`${key}BelowThreshold`], aboveT);
          const belowR = v[`${key}BelowRatio`];
          for (const c of [b.below, b.above]) {
            setParam(c.attack, ms(v.attack), ctx);
            setParam(c.release, ms(v.release), ctx);
          }
          setParam(b.below.threshold, belowT, ctx);
          setParam(b.below.ratio, belowR, ctx);
          setParam(b.above.threshold, aboveT, ctx);
          setParam(b.above.ratio, aboveR, ctx);
          // Below: back to unity at the Above threshold, so everything
          // under it comes up. Each stage also undoes the node's own makeup.
          const lift = aboveT - (belowT + (aboveT - belowT) / belowR);
          setParam(
            b.belowGain.gain,
            dbToGain(lift) / nativeMakeup(belowT, KNEE, belowR),
            ctx,
          );
          setParam(
            b.aboveGain.gain,
            1 / nativeMakeup(aboveT, KNEE, aboveR),
            ctx,
          );
          setParam(b.level.gain, dbToGain(v[`${key}Gain`] + v.output), ctx);
        });
      },
      // The deepest reduction across the bands' Above stages.
      reduction: () => Math.min(...bands.map((b) => b.above.reduction)),
    };
  },
};
