import { gain, setParam, stereoGain } from "./dsp";
import { blendMix, p, type EffectDef } from "./effectDef";
import { choice, describe, inGroup, showWhen } from "./params";

/**
 * Chorus, flanger and phaser in one device. Chorus and flanger are a swept
 * delay line (long and gentle vs short with feedback); the phaser is a chain
 * of swept all-pass filters. Both paths exist; the mode picks which is heard.
 * Each side has its own LFO, offset in phase by Stereo.
 */

const MODES = ["Chorus", "Flanger", "Phaser"] as const;
const PHASER_STAGES = 6;
const phaser = (v: Record<string, number>) => v.mode === 2;

/** Base delay and sweep depth at 100%, in seconds, for chorus and flanger. */
const DELAY_SHAPE = [
  { base: 0.012, depth: 0.005 },
  // Web Audio clamps delays in a feedback loop to one render quantum
  // (about 2.7 ms), so the flanger sweeps above that.
  { base: 0.005, depth: 0.0024 },
];

export const modulationFx: EffectDef = {
  label: "Modulation",
  mix: "blend",
  params: describe(
    [
      ...inGroup("Mode", [
        choice("mode", "Mode", MODES),
        p("rate", "Rate", 0.05, 10, 0.8, "Hz", "exp"),
        p("depth", "Depth", 0, 100, 50, "%"),
        p("stereo", "Stereo", 0, 100, 50, "%"),
      ]),
      ...inGroup("Tone", [
        ...showWhen(
          (v) => !phaser(v),
          [p("feedback", "Feedback", -95, 95, 0, "%")],
        ),
        ...showWhen(phaser, [
          p("center", "Center", 100, 5000, 800, "Hz", "exp"),
          p("resonance", "Reso", 0, 100, 40, "%"),
        ]),
        blendMix(
          50,
          "Effect against the original. The sweep comes from the two mixing, so 50% is the strongest; lower is subtler.",
        ),
      ]),
    ],
    {
      mode: "Chorus thickens and widens, like several players at once. Flanger is a jet-like swoosh. Phaser is a softer, swirling sweep.",
      rate: "Speed of the sweep. Slow (under 1 Hz) for movement, fast for vibrato-like wobble.",
      depth: "How far it sweeps.",
      stereo:
        "Offsets the sweep between left and right. 0% sweeps both together; 100% sweeps them in opposite directions, the widest.",
      feedback:
        "Feeds the effect back into itself for a sharper, more metallic sweep. Negative values sound hollower.",
      center: "Frequency the phaser sweeps around.",
      resonance: "Sharpens the phaser's notches for a more pronounced sweep.",
    },
  ),
  build(ctx, input, output) {
    const stereo = stereoGain(ctx);
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    input.connect(stereo).connect(split);
    merge.connect(output);

    const lfos = [ctx.createOscillator(), ctx.createOscillator()];
    const sides = lfos.map((lfo, c) => {
      const delay = ctx.createDelay(0.1);
      const feedback = gain(ctx, 0);
      const delayOut = gain(ctx, 0);
      split.connect(delay, c);
      delay.connect(feedback).connect(delay);
      delay.connect(delayOut).connect(merge, 0, c);

      const stages = Array.from({ length: PHASER_STAGES }, () => {
        const f = ctx.createBiquadFilter();
        f.type = "allpass";
        return f;
      });
      const phaserOut = gain(ctx, 0);
      split.connect(stages[0], c);
      for (let i = 1; i < stages.length; i++) stages[i - 1].connect(stages[i]);
      stages.at(-1)!.connect(phaserOut).connect(merge, 0, c);

      const delaySweep = gain(ctx, 0);
      const phaseSweep = gain(ctx, 0);
      lfo.connect(delaySweep).connect(delay.delayTime);
      lfo.connect(phaseSweep);
      for (const s of stages) phaseSweep.connect(s.detune);
      lfo.start();
      return {
        delay,
        feedback,
        delayOut,
        stages,
        phaserOut,
        delaySweep,
        phaseSweep,
      };
    });

    let offset = -1;
    return {
      update(v) {
        // Right LFO: a sine shifted by up to half a cycle.
        const phase = (v.stereo / 100) * Math.PI;
        if (phase !== offset) {
          offset = phase;
          lfos[1].setPeriodicWave(
            ctx.createPeriodicWave([0, Math.sin(phase)], [0, Math.cos(phase)], {
              disableNormalization: true,
            }),
          );
        }
        const depth = v.depth / 100;
        const shape = DELAY_SHAPE[Math.min(1, v.mode)];
        for (const [i, s] of sides.entries()) {
          setParam(lfos[i].frequency, v.rate, ctx);
          setParam(s.delayOut.gain, phaser(v) ? 0 : 1, ctx);
          setParam(s.phaserOut.gain, phaser(v) ? 1 : 0, ctx);
          setParam(s.delay.delayTime, shape.base, ctx);
          setParam(s.delaySweep.gain, shape.depth * depth, ctx);
          setParam(s.feedback.gain, phaser(v) ? 0 : v.feedback / 100, ctx);
          // ±2 octaves at full depth.
          setParam(s.phaseSweep.gain, depth * 2400, ctx);
          for (const f of s.stages) {
            setParam(f.frequency, v.center, ctx);
            setParam(f.Q, 0.3 + (v.resonance / 100) * 2.7, ctx);
          }
        }
      },
      dispose: () => lfos.forEach((l) => l.stop()),
    };
  },
};
