import {
  createLfo,
  gain,
  LFO_SHAPES,
  setParam,
  stereoGain,
  SYNC_DIVISIONS,
} from "./dsp";
import { p, type EffectDef } from "./effectDef";
import { choice, describe } from "./params";

/**
 * Auto Pan and Tremolo: a tempo-synced LFO moving each side's level, in
 * opposite directions (pan) or together (tremolo).
 */

export const autoPanFx: EffectDef = {
  label: "Auto Pan",
  params: describe(
    [
      choice("mode", "Mode", ["Pan", "Tremolo"]),
      p("amount", "Amount", 0, 100, 50, "%"),
      choice("rate", "Rate", SYNC_DIVISIONS, 5),
      choice("shape", "Shape", LFO_SHAPES),
    ],
    {
      mode: "Pan moves the sound between left and right. Tremolo pulses its volume.",
      amount:
        "How far it moves. At 100% a pan reaches each side fully and a tremolo dips to silence.",
      rate: "Speed as a note length, synced to the tempo.",
      shape:
        "Sine and Triangle move smoothly; Square chops between two states (a gated, stuttering pulse); the saws ramp each cycle.",
    },
  ),
  build(ctx, input, output) {
    const stereo = stereoGain(ctx);
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    const sides = [gain(ctx), gain(ctx)];
    input.connect(stereo).connect(split);
    sides.forEach((g, c) => split.connect(g, c).connect(merge, 0, c));
    merge.connect(output);

    // Rounds off the square and saw edges so they don't click.
    const lfo = createLfo(ctx);
    const smooth = ctx.createBiquadFilter();
    smooth.type = "lowpass";
    smooth.frequency.value = 60;
    lfo.output.connect(smooth);
    // Pan is a balance: the side the sound moves towards stays at full
    // level and the other dips (left dips while the LFO is below 0, right
    // while it's above). Tremolo moves both sides together.
    const halves = [
      [-1, 0, 0],
      [0, 0, -1],
    ].map((points) => {
      const shaper = ctx.createWaveShaper();
      shaper.curve = Float32Array.from(points);
      smooth.connect(shaper);
      return shaper;
    });
    const panDepth = sides.map((g, c) => {
      const depth = gain(ctx, 0);
      halves[c].connect(depth).connect(g.gain);
      return depth;
    });
    const tremoloDepth = gain(ctx, 0);
    smooth.connect(tremoloDepth);
    for (const g of sides) tremoloDepth.connect(g.gain);

    return {
      update(v, env) {
        lfo.set(v.shape, v.rate, env.bpm);
        const a = v.amount / 100;
        const pan = v.mode === 0;
        // Tremolo swings each side between 1 and 1 - a around 1 - a/2.
        sides.forEach((g) => setParam(g.gain, pan ? 1 : 1 - a / 2, ctx));
        panDepth.forEach((d) => setParam(d.gain, pan ? a : 0, ctx));
        setParam(tremoloDepth.gain, pan ? 0 : a / 2, ctx);
      },
      clock: lfo.clock,
      dispose: lfo.stop,
    };
  },
};
