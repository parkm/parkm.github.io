import { dbToGain, ms, setParam, stereoGain } from "./dsp";
import { whenWorklets } from "./worklets";

/**
 * Main-thread side of the "daw-dynamics" processor (worklet/processors.ts):
 * the compressor, each multiband band and the limiter. Passes audio through
 * until the processor is loaded (a moment after audio starts; renders load
 * it first), then swaps it in.
 */

export type DynamicsSettings = {
  /** dB into the detector and the gain stage. */
  inputGain: number;
  /** dB; above it, sound is turned down by `ratio`. */
  threshold: number;
  /** 1 is off; 1000 and up is a brickwall. */
  ratio: number;
  /** dB width of the soft knee. */
  knee: number;
  /** dB; below it (and up to `threshold`), sound is turned up by `belowRatio`. */
  belowThreshold: number;
  /** 1 is off. */
  belowRatio: number;
  /** ms; 0 reacts instantly. */
  attack: number;
  /** ms */
  release: number;
  /** dB after the gain stage. */
  outputGain: number;
  /** Hz high-pass on what the detector hears; 20 or below is off. */
  scLowCut: number;
  /** Detect from the sidechain input instead of the signal itself. */
  external: boolean;
  /** Detect average (RMS, 20 ms) level instead of peaks: smoother, for glue. */
  rms: boolean;
  /** ms the audio waits so the gain can ramp into peaks; adds that latency. */
  lookahead: number;
  /** With lookahead, also catch peaks between samples (4x oversampled). */
  truePeak: boolean;
};

export const DYNAMICS_DEFAULTS: DynamicsSettings = {
  inputGain: 0,
  threshold: 0,
  ratio: 1,
  knee: 0,
  belowThreshold: -120,
  belowRatio: 1,
  attack: 10,
  release: 100,
  outputGain: 0,
  scLowCut: 0,
  external: false,
  rms: false,
  lookahead: 0,
  truePeak: false,
};

const STEPPED = new Set(["external", "rms", "lookahead", "truePeak"]);

export function createDynamics(ctx: BaseAudioContext) {
  const input = stereoGain(ctx);
  /** Feed a sidechain source here (used when `external` is on). */
  const sidechain = stereoGain(ctx);
  const output = stereoGain(ctx);
  input.connect(output);
  let node: AudioWorkletNode | null = null;
  let settings = DYNAMICS_DEFAULTS;
  let reduction = 0;
  let disposed = false;

  const apply = () => {
    if (!node) return;
    const s = settings;
    const values: Record<string, number> = {
      inputGain: dbToGain(s.inputGain),
      threshold: s.threshold,
      ratio: s.ratio,
      knee: s.knee,
      belowThreshold: s.belowThreshold,
      belowRatio: s.belowRatio,
      attack: ms(s.attack),
      release: ms(s.release),
      outputGain: dbToGain(s.outputGain),
      scLowCut: s.scLowCut > 20 ? s.scLowCut : 0,
      external: s.external ? 1 : 0,
      rms: s.rms ? 1 : 0,
      lookahead: ms(s.lookahead),
      truePeak: s.truePeak ? 1 : 0,
    };
    for (const [name, value] of Object.entries(values)) {
      const param = node.parameters.get(name)!;
      // Switches and lengths jump; gliding them would pass through every value between.
      if (STEPPED.has(name)) {
        param.cancelScheduledValues(0);
        param.setValueAtTime(value, ctx.currentTime);
      } else setParam(param, value, ctx);
    }
  };

  whenWorklets(ctx, () => {
    if (disposed) return;
    node = new AudioWorkletNode(ctx, "daw-dynamics", {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    node.port.onmessage = (e: MessageEvent<number>) => (reduction = e.data);
    apply();
    input.disconnect(output);
    input.connect(node, 0, 0);
    sidechain.connect(node, 0, 1);
    node.connect(output);
  });

  return {
    input: input as AudioNode,
    sidechain: sidechain as AudioNode,
    output: output as AudioNode,
    set(next: Partial<DynamicsSettings>) {
      settings = { ...DYNAMICS_DEFAULTS, ...next };
      apply();
    },
    /** Deepest gain change over the last ~10 ms, in dB (≤ 0 when reducing). */
    reduction: () => reduction,
    dispose() {
      disposed = true;
      node?.port.close();
    },
  };
}
