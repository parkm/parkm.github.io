// Small synthesized sound set. The context is created on the first user gesture.

import { CUP, type Material, SAND } from "./physics";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;
let lastBounceAt = 0;

export function setMuted(value: boolean) {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.5;
}

/** Call from a pointer or key handler. */
export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      return;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function envelope(gain: number, duration: number, delay: number) {
  const t = ctx!.currentTime + delay;
  const env = ctx!.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  env.connect(master!);
  return { env, t };
}

/** A tone that glides from `freq` to `endFreq`. */
function tone(
  freq: number,
  endFreq: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  delay = 0,
) {
  if (!ctx || !master || muted) return;
  const { env, t } = envelope(gain, duration, delay);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  osc.connect(env);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function noise(
  filter: BiquadFilterType,
  freq: number,
  duration: number,
  gain: number,
  delay = 0,
) {
  if (!ctx || !master || !noiseBuffer || muted) return;
  const { env, t } = envelope(gain, duration, delay);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.value = freq;
  src.connect(biquad).connect(env);
  src.start(t, Math.random() * 0.2);
  src.stop(t + duration + 0.02);
}

export function playSwing(power: number) {
  noise("bandpass", 900 + power * 1400, 0.09, 0.1 + power * 0.25);
  tone(170 + power * 90, 90, 0.08, "triangle", 0.12 + power * 0.2);
}

/** `speed` is how fast the ball met the ground. */
export function playBounce(speed: number, mat: Material) {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (now - lastBounceAt < 0.04) return;
  lastBounceAt = now;
  const hard = Math.min(1, speed / 500);
  if (mat === SAND) noise("lowpass", 1200, 0.12, 0.12 + hard * 0.3);
  else if (mat === CUP) tone(1100, 700, 0.04, "triangle", 0.08 + hard * 0.2);
  else {
    tone(150 + hard * 60, 70, 0.09, "sine", 0.1 + hard * 0.4);
    noise("lowpass", 500, 0.05, hard * 0.12);
  }
}

export function playSplash() {
  noise("bandpass", 1400, 0.35, 0.3);
  noise("lowpass", 600, 0.5, 0.2, 0.05);
  tone(260, 80, 0.25, "sine", 0.2);
}

export const playOut = () => tone(220, 130, 0.3, "sine", 0.15);

export function playSink(strokes: number) {
  tone(660, 660, 0.25, "triangle", 0.22);
  tone(990, 990, 0.4, "triangle", 0.22, 0.1);
  if (strokes === 1) tone(1320, 1320, 0.6, "triangle", 0.22, 0.2);
}
