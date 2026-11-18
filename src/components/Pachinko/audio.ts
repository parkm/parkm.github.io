// Small synthesized sound set. The context is created on the first user gesture.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let lastHitAt = 0;

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
    } catch {
      return;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  delay = 0,
) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

const SCALE = [0, 2, 4, 7, 9];
const noteFreq = (n: number) =>
  523.25 * 2 ** ((SCALE[n % 5] + 12 * Math.floor(n / 5)) / 12);

/** `n` is how many pegs have been lit this shot; the pitch climbs with it. */
export function playPeg(n: number, fresh: boolean) {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (!fresh && now - lastHitAt < 0.05) return;
  lastHitAt = now;
  if (fresh) tone(noteFreq(Math.min(n, 19)), 0.22, "triangle", 0.28);
  else tone(220, 0.05, "sine", 0.1);
}

export const playWall = () => tone(140, 0.06, "sine", 0.12);
export const playLaunch = () => tone(180, 0.12, "square", 0.08);
export const playPop = (n: number) =>
  tone(noteFreq(Math.min(n, 19)) / 2, 0.08, "sine", 0.1);

export function playCatch() {
  [0, 2, 4].forEach((n, i) =>
    tone(noteFreq(n + 5), 0.25, "triangle", 0.25, i * 0.07),
  );
}

export function playFound() {
  tone(noteFreq(7), 0.3, "sine", 0.2);
  tone(noteFreq(9), 0.4, "sine", 0.2, 0.1);
}

export function playWin() {
  [0, 2, 4, 5, 7, 9, 10].forEach((n, i) =>
    tone(noteFreq(n), 0.4, "triangle", 0.22, i * 0.09),
  );
}

export function playLose() {
  [4, 2, 0].forEach((n, i) =>
    tone(noteFreq(n) / 2, 0.4, "sine", 0.2, i * 0.16),
  );
}
