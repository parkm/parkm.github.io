import { useCallback, useRef } from "react";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function getNoteFrequency(
  note: string,
  octave: number,
  baseFreq: number,
): number | null {
  const noteIndex = NOTES.indexOf(note);
  if (noteIndex === -1) return null;

  const midiNumber = (octave + 1) * 12 + noteIndex;

  return baseFreq * Math.pow(2, (midiNumber - 69) / 12);
}

export function usePianoAudio(baseFrequency = 440) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeNoteRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(
    null,
  );

  const initAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtxRef.current = new AudioContextCtor();
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
  }, []);

  const playNote = useCallback(
    (note: string, octave: number, continuous = false) => {
      initAudioContext();
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      if (activeNoteRef.current) {
        const { osc, gain } = activeNoteRef.current;
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.stop(now + 0.05);
        activeNoteRef.current = null;
      }

      const frequency = getNoteFrequency(note, octave, baseFrequency);
      if (!frequency) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.value = frequency;

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.01);

      if (continuous) {
        gain.gain.setValueAtTime(0.3, now + 0.01);
      } else {
        gain.gain.setTargetAtTime(0.15, now + 0.01, 0.3);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);

      activeNoteRef.current = { osc, gain };
    },
    [initAudioContext, baseFrequency],
  );

  const stopNote = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !activeNoteRef.current) return;

    const { osc, gain } = activeNoteRef.current;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);
    osc.stop(now + 0.1);
    activeNoteRef.current = null;
  }, []);

  return { playNote, stopNote };
}
