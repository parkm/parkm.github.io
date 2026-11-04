/**
 * AudioWorklet processors, as typed TypeScript. `processors` never runs on
 * the main thread: its source text is loaded into each AudioContext (see
 * worklets.ts) and runs in the worklet's global scope.
 *
 * Rules, because the function is shipped as text:
 *   - self-contained: no imports or outer variables, only worklet globals;
 *   - no class fields (`x = 1` in a class body): the production build lowers
 *     them to a helper outside the function. Use `declare` + the constructor.
 *   - no allocation in process(): garbage collection on the audio thread
 *     glitches.
 */

// The AudioWorkletGlobalScope, which TypeScript's DOM lib doesn't describe.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor,
): void;
declare const sampleRate: number;

type Inputs = Float32Array[][];
type Params = Record<string, Float32Array>;

export function processors() {
  /** dB = DB_PER_NEPER × ln(gain). */
  const DB_PER_NEPER = 20 / Math.LN10;
  /** Upward compression never lifts more than this (keeps silence silent-ish). */
  const MAX_LIFT_DB = 30;
  /** Ratios at or above this are treated as infinite (brickwall). */
  const INFINITE_RATIO = 1000;
  /** Below this the detector reads as silence. */
  const FLOOR_DB = -120;
  /** Gain reduction is reported this many blocks apart (~10 ms). */
  const REPORT_BLOCKS = 4;
  /** Longest peak hold: covers the gaps between rectified peaks down to ~40 Hz. */
  const MAX_HOLD = 0.012;
  /** RMS detector averaging time. */
  const RMS_TIME = 0.02;
  /**
   * True-peak interpolator: 4x oversampling, Kaiser-windowed sinc with this
   * many taps per phase (reads within ~0.15 dB of an ideal reconstruction on
   * full-band noise; tested against 16x with 129 taps).
   */
  const TP_TAPS = 48;
  const TP_KAISER_BETA = 8;
  /** How many samples late its estimates arrive (they sit up to TP_TAPS / 2 back). */
  const TP_DELAY = TP_TAPS / 2;
  /** Longest buffers we ever need, in seconds (lookahead + hold, with room). */
  const MAX_BUFFER = 0.05;

  /**
   * One dynamics engine for the compressor, each multiband band and the
   * limiter. The design follows Giannoulis, Massberg & Reiss, "Digital
   * Dynamic Range Compressor Design — A Tutorial and Analysis" (JAES 2012):
   * feed-forward, gain computer in the log domain, smoothing applied to the
   * gain after it (so attack and release mean the same thing at any
   * threshold or ratio).
   *
   *   1. detector: stereo-linked level of the input (or the sidechain when
   *      `external` is 1), optionally high-passed. Peak: max(|L|, |R|), or
   *      with `truePeak` also the 4x-oversampled inter-sample peaks. RMS:
   *      mean of L² and R² over 20 ms (also held, see 2).
   *   2. hold: peak level is the maximum over a sliding window (up to 12 ms,
   *      never longer than the release, and covering the lookahead). It
   *      bridges the dips between a waveform's peaks, so the gain doesn't
   *      wobble within each cycle of a bass note: that wobble is distortion.
   *   3. gain computer (dB): downward above `threshold` (ratio, quadratic
   *      soft knee of width `knee`), upward below `belowThreshold`.
   *   4. smoothing (dB, smooth branching): attack when the gain falls,
   *      release when it rises. Attack 0 follows instantly.
   *   5. lookahead (optional): the audio is delayed `lookahead` seconds and
   *      the gain is a moving average over that length. Every gain in the
   *      average was computed with that sample's own level in its hold
   *      window, so each is at most the gain the sample needs and the
   *      average is too: the output never exceeds the threshold, and the
   *      gain ramps smoothly into peaks instead of jumping. True-peak
   *      estimates arrive TP_DELAY samples late (the interpolator looks
   *      around that far back), so with them the audio waits that much
   *      longer and the hold covers it.
   *
   * With attack 0, knee 0, ratio ≥ 1000 it's a brickwall: the hold window
   * includes the current sample, so the output never exceeds the threshold
   * (sample peaks; true peaks with `truePeak` and lookahead).
   */
  class Dynamics extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      const k = (
        name: string,
        defaultValue: number,
        minValue: number,
        maxValue: number,
      ) => ({
        name,
        defaultValue,
        minValue,
        maxValue,
        automationRate: "k-rate",
      });
      return [
        k("inputGain", 1, 0, 1000),
        k("threshold", 0, -120, 24),
        k("ratio", 1, 1, INFINITE_RATIO),
        k("knee", 0, 0, 48),
        k("belowThreshold", -120, -120, 24),
        k("belowRatio", 1, 1, 100),
        k("attack", 0.01, 0, 2),
        k("release", 0.1, 0.001, 5),
        k("outputGain", 1, 0, 1000),
        k("scLowCut", 0, 0, 2000),
        k("external", 0, 0, 1),
        k("rms", 0, 0, 1),
        k("lookahead", 0, 0, 0.02),
        k("truePeak", 0, 0, 1),
      ];
    }

    // Smoothed gain (dB) and metering.
    declare gain: number;
    declare least: number;
    declare blocks: number;
    // RMS detector: mean square.
    declare meanSquare: number;
    // Sliding maximum (monotonic deque over a ring buffer).
    declare dqValue: Float64Array;
    declare dqTime: Float64Array;
    declare dqHead: number;
    declare dqSize: number;
    declare now: number;
    // Lookahead: delayed audio and the moving-average window of gains.
    declare delayL: Float32Array;
    declare delayR: Float32Array;
    declare gains: Float64Array;
    declare gainSum: number;
    declare avgLength: number;
    declare avgPos: number;
    declare delayLength: number;
    declare delayPos: number;
    // True peak: recent input history per channel and the 3 in-between phases.
    declare tpL: Float64Array;
    declare tpR: Float64Array;
    declare tpPos: number;
    declare tpCoef: Float64Array;
    // Sidechain high-pass: coefficients and per-channel state.
    declare hpFreq: number;
    declare hp: Float64Array;
    declare hpState: Float64Array;
    /** Stands in for a missing input (nothing upstream playing). */
    declare silence: Float32Array;

    constructor() {
      super();
      const size = Math.ceil(MAX_BUFFER * sampleRate) + 2;
      this.gain = 0;
      this.least = 0;
      this.blocks = 0;
      this.meanSquare = 0;
      this.dqValue = new Float64Array(size);
      this.dqTime = new Float64Array(size);
      this.dqHead = 0;
      this.dqSize = 0;
      this.now = 0;
      this.delayL = new Float32Array(size);
      this.delayR = new Float32Array(size);
      this.gains = new Float64Array(size);
      this.gainSum = 0;
      this.avgLength = 0;
      this.avgPos = 0;
      this.delayLength = 0;
      this.delayPos = 0;
      this.tpL = new Float64Array(TP_TAPS);
      this.tpR = new Float64Array(TP_TAPS);
      this.tpPos = 0;
      // Kaiser-windowed sinc interpolation at 1/4, 2/4, 3/4 of a sample,
      // between the history's middle two samples; each phase sums to 1.
      const bessel0 = (x: number) => {
        let sum = 1;
        let term = 1;
        for (let k = 1; k < 30; k++) {
          term *= (x / (2 * k)) ** 2;
          sum += term;
        }
        return sum;
      };
      const half = TP_TAPS / 2;
      this.tpCoef = new Float64Array(3 * TP_TAPS);
      for (let phase = 1; phase <= 3; phase++) {
        let sum = 0;
        for (let j = 0; j < TP_TAPS; j++) {
          // Tap j weights the sample j steps back; the point sits
          // TP_TAPS / 2 - phase / 4 samples back.
          const u = j - half + phase / 4;
          const sinc = u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
          const r = u / (half + 1);
          const w =
            Math.abs(r) < 1
              ? bessel0(TP_KAISER_BETA * Math.sqrt(1 - r * r)) /
                bessel0(TP_KAISER_BETA)
              : 0;
          this.tpCoef[(phase - 1) * TP_TAPS + j] = sinc * w;
          sum += sinc * w;
        }
        for (let j = 0; j < TP_TAPS; j++)
          this.tpCoef[(phase - 1) * TP_TAPS + j] /= sum;
      }
      this.hpFreq = 0;
      this.hp = new Float64Array(5);
      this.hpState = new Float64Array(4);
      this.silence = new Float32Array(128);
    }

    /** Butterworth high-pass coefficients (Audio EQ Cookbook), normalised. */
    setHighpass(freq: number) {
      this.hpFreq = freq;
      if (freq <= 0) return;
      const w = (2 * Math.PI * Math.min(freq, sampleRate * 0.45)) / sampleRate;
      const cos = Math.cos(w);
      const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
      const a0 = 1 + alpha;
      const h = this.hp;
      h[0] = (1 + cos) / 2 / a0; // b0
      h[1] = -(1 + cos) / a0; // b1
      h[2] = h[0]; // b2
      h[3] = (-2 * cos) / a0; // a1
      h[4] = (1 - alpha) / a0; // a2
    }

    /** Push a level and return the maximum over the last `window` samples. */
    slidingMax(value: number, window: number) {
      const cap = this.dqValue.length;
      const t = this.now++;
      // Drop smaller values from the back: they can never be the maximum again.
      while (this.dqSize > 0) {
        const back = (this.dqHead + this.dqSize - 1) % cap;
        if (this.dqValue[back] > value) break;
        this.dqSize--;
      }
      const at = (this.dqHead + this.dqSize) % cap;
      this.dqValue[at] = value;
      this.dqTime[at] = t;
      this.dqSize++;
      // Drop expired values from the front.
      while (this.dqTime[this.dqHead] <= t - window) {
        this.dqHead = (this.dqHead + 1) % cap;
        this.dqSize--;
      }
      return this.dqValue[this.dqHead];
    }

    /** Largest inter-sample peak (4x oversampled) around TP_TAPS / 2 samples back. */
    interSamplePeak(l: number, r: number) {
      const n = TP_TAPS;
      this.tpL[this.tpPos] = l;
      this.tpR[this.tpPos] = r;
      const c = this.tpCoef;
      let peak = 0;
      for (let phase = 0; phase < 3; phase++) {
        let yl = 0;
        let yr = 0;
        for (let j = 0; j < n; j++) {
          const at = (this.tpPos - j + n) % n;
          yl += c[phase * n + j] * this.tpL[at];
          yr += c[phase * n + j] * this.tpR[at];
        }
        if (yl < 0) yl = -yl;
        if (yr < 0) yr = -yr;
        if (yl > peak) peak = yl;
        if (yr > peak) peak = yr;
      }
      this.tpPos = (this.tpPos + 1) % n;
      return peak;
    }

    process(inputs: Inputs, outputs: Float32Array[][], p: Params) {
      const out = outputs[0];
      const outL = out[0];
      const outR = out[1] ?? out[0];
      // With nothing upstream playing the input is empty. Keep running on
      // silence anyway, so the lookahead delay empties and the detector releases.
      const input = inputs[0];
      if (this.silence.length !== outL.length)
        this.silence = new Float32Array(outL.length);
      const inL = input && input.length > 0 ? input[0] : this.silence;
      const inR = input && input.length > 1 ? input[1] : inL;
      const side = inputs[1];
      const external = p.external[0] >= 0.5 && side && side.length > 0;
      const detL = external ? side[0] : inL;
      const detR = external ? (side[1] ?? side[0]) : inR;
      // The sidechain is heard at its own level; the input through inputGain.
      const inGain = p.inputGain[0];
      const detGain = external ? 1 : inGain;
      const outGain = p.outputGain[0];

      const T = p.threshold[0];
      const ratio = p.ratio[0];
      const slope = ratio >= INFINITE_RATIO ? -1 : 1 / ratio - 1;
      const W = p.knee[0];
      const Tb = Math.min(p.belowThreshold[0], T);
      const lift = 1 - 1 / p.belowRatio[0];
      const attack = p.attack[0];
      const release = p.release[0];
      const aA = attack > 0 ? Math.exp(-1 / (attack * sampleRate)) : 0;
      const aR = Math.exp(-1 / (release * sampleRate));
      const rms = p.rms[0] >= 0.5;
      const aRms = Math.exp(-1 / (RMS_TIME * sampleRate));

      // Lookahead: gain averaged over `la` samples, audio delayed `delay`.
      const la = Math.round(p.lookahead[0] * sampleRate);
      const truePeak = p.truePeak[0] >= 0.5 && la > 0;
      const delay = la > 0 ? la + (truePeak ? TP_DELAY : 0) : 0;
      if (la !== this.avgLength || delay !== this.delayLength) {
        // Changing the lookahead restarts the delay line (a setting change, not automation).
        this.avgLength = la;
        this.delayLength = delay;
        this.avgPos = 0;
        this.delayPos = 0;
        this.gainSum = 0;
        this.delayL.fill(0);
        this.delayR.fill(0);
        this.gains.fill(0);
      }
      // The hold must reach back to every sample the averaged gains cover.
      const hold = Math.max(
        1,
        Math.round(Math.min(MAX_HOLD, release) * sampleRate),
        delay + 1,
      );

      const lowCut = p.scLowCut[0] > 20 ? p.scLowCut[0] : 0;
      if (lowCut !== this.hpFreq) this.setHighpass(lowCut);
      const h = this.hp;
      const s = this.hpState;

      let g = this.gain;
      let least = this.least;
      let ms = this.meanSquare;
      for (let i = 0; i < inL.length; i++) {
        // 1. Detector.
        let dl = detL[i] * detGain;
        let dr = detR[i] * detGain;
        if (lowCut > 0) {
          const yl = h[0] * dl + s[0];
          s[0] = h[1] * dl - h[3] * yl + s[1];
          s[1] = h[2] * dl - h[4] * yl;
          const yr = h[0] * dr + s[2];
          s[2] = h[1] * dr - h[3] * yr + s[3];
          s[3] = h[2] * dr - h[4] * yr;
          dl = yl;
          dr = yr;
        }
        let level: number;
        if (rms) {
          ms = aRms * ms + (1 - aRms) * 0.5 * (dl * dl + dr * dr);
          // The average still ripples at twice a bass note's frequency; the hold flattens it.
          level = this.slidingMax(Math.sqrt(ms), hold);
        } else {
          const al = dl < 0 ? -dl : dl;
          const ar = dr < 0 ? -dr : dr;
          level = al > ar ? al : ar;
          if (truePeak) {
            const tp = this.interSamplePeak(dl, dr);
            if (tp > level) level = tp;
          }
          // 2. Hold.
          level = this.slidingMax(level, hold);
        }

        // 3. Gain computer (dB).
        const x = level > 1e-6 ? DB_PER_NEPER * Math.log(level) : FLOOR_DB;
        let target = 0;
        const d = x - T;
        if (2 * d > W) target = slope * d;
        else if (W > 0 && 2 * d > -W) {
          const k = d + W / 2;
          target = (slope * k * k) / (2 * W);
        }
        if (lift > 0) {
          const u = x - Tb;
          let up = 0;
          if (2 * u < -W) up = -u * lift;
          else if (W > 0 && 2 * u < W) {
            const k = u - W / 2;
            up = (lift * k * k) / (2 * W);
          }
          target += up < MAX_LIFT_DB ? up : MAX_LIFT_DB;
        }

        // 4. Smoothing (dB): attack when the gain falls, release when it rises.
        g =
          target < g ? aA * g + (1 - aA) * target : aR * g + (1 - aR) * target;

        // 5. Lookahead: average the gain over the window, delay the audio.
        let applied = g;
        let sl = inL[i];
        let sr = inR[i];
        if (la > 0) {
          const gp = this.avgPos;
          this.gainSum += g - this.gains[gp];
          this.gains[gp] = g;
          applied = this.gainSum / la;
          this.avgPos = gp + 1 === la ? 0 : gp + 1;
          const dp = this.delayPos;
          sl = this.delayL[dp];
          sr = this.delayR[dp];
          this.delayL[dp] = inL[i];
          this.delayR[dp] = inR[i];
          this.delayPos = dp + 1 === delay ? 0 : dp + 1;
        }

        if (applied < least) least = applied;
        const k =
          (applied === 0 ? 1 : Math.exp(applied / DB_PER_NEPER)) *
          inGain *
          outGain;
        outL[i] = sl * k;
        outR[i] = sr * k;
      }
      // The running sum drifts by rounding over time; resync it each block.
      if (la > 0) {
        let sum = 0;
        for (let j = 0; j < la; j++) sum += this.gains[j];
        this.gainSum = sum;
      }
      this.gain = g;
      this.least = least;
      this.meanSquare = ms;
      if (++this.blocks >= REPORT_BLOCKS) {
        this.port.postMessage(this.least);
        this.least = 0;
        this.blocks = 0;
      }
      return true;
    }
  }

  registerProcessor("daw-dynamics", Dynamics);
}

/** The processors as module source for audioWorklet.addModule. */
export const PROCESSORS_SOURCE = `(${processors.toString()})();`;
