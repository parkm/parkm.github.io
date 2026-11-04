/**
 * Metronome click: a short sine blip, higher on the downbeat. Goes straight
 * to the speakers, past the master volume and limiter, so it's never in a
 * render or affected by the mix.
 */
export function createMetronome(ctx: BaseAudioContext) {
  const output = ctx.createGain();
  output.gain.value = 0.35;
  output.connect(ctx.destination);

  return {
    click(time: number, accent: boolean) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.value = accent ? 1760 : 1320;
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(accent ? 1 : 0.6, time + 0.001);
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
      osc.connect(env).connect(output);
      osc.start(time);
      osc.stop(time + 0.07);
      osc.onended = () => env.disconnect();
    },
    dispose() {
      output.disconnect();
    },
  };
}

export type Metronome = ReturnType<typeof createMetronome>;
