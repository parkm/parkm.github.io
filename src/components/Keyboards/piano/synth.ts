// Piano Synthesizer using Web Audio API
// This module implements a simplified but realistic piano synthesis model

// AudioContext singleton
let audioContext: AudioContext | null = null;

// Main gain node for volume control
let mainGainNode: GainNode | null = null;

// Output limiter to prevent distortion
let limiter: DynamicsCompressorNode | null = null;

// Simple reverb
let reverbNode: ConvolverNode | null = null;

// Track active notes with their associated nodes
interface ActiveNote {
  id: string;
  oscillators: OscillatorNode[];
  gainNodes: GainNode[];
  scheduledEndTime: number;
  stop: () => void;
}

// Track active notes
const activeNotes = new Map<string, ActiveNote>();

// Initialize the audio context and set up the audio graph
export function initAudio(): { context: AudioContext; mainGain: GainNode } {
  // Create audio context if it doesn't exist
  if (!audioContext) {
    audioContext = new AudioContext();

    // Create output limiter to prevent distortion
    limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -3.0;
    limiter.knee.value = 0.0;
    limiter.ratio.value = 20.0;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    limiter.connect(audioContext.destination);

    // Create main gain node
    mainGainNode = audioContext.createGain();
    mainGainNode.gain.value = 0.3;
    mainGainNode.connect(limiter);

    // Create simple reverb that won't cause filter instability
    createSimpleReverb().then((reverb) => {
      if (!audioContext || !mainGainNode || !limiter) return;

      reverbNode = reverb;

      // Simple dry/wet mix with conservative levels
      const dryGain = audioContext.createGain();
      dryGain.gain.value = 0.9;

      const wetGain = audioContext.createGain();
      wetGain.gain.value = 0.1; // Very subtle reverb for stability

      // Set up dry and wet paths
      mainGainNode.disconnect();
      mainGainNode.connect(dryGain);
      dryGain.connect(limiter);
      mainGainNode.connect(wetGain);
      wetGain.connect(reverbNode);
      reverbNode.connect(limiter);
    });
  } else {
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  }

  // If audio context exists but main gain doesn't, create it
  if (audioContext && !mainGainNode) {
    mainGainNode = audioContext.createGain();
    mainGainNode.gain.value = 0.3;
    if (limiter) {
      mainGainNode.connect(limiter);
    } else {
      mainGainNode.connect(audioContext.destination);
    }
  }

  return {
    context: audioContext,
    mainGain: mainGainNode || audioContext.createGain(),
  };
}

// Create a simple reverb that won't trigger filter instability
async function createSimpleReverb(): Promise<ConvolverNode> {
  if (!audioContext) {
    throw new Error("AudioContext not initialized");
  }

  const convolver = audioContext.createConvolver();
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * 1.5; // 1.5 seconds reverb tail
  const impulseBuffer = audioContext.createBuffer(2, length, sampleRate);

  // Create impulse response with simple exponential decay
  for (let channel = 0; channel < 2; channel++) {
    const impulseData = impulseBuffer.getChannelData(channel);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Simple exponential decay with very minimal noise
      const decay = Math.exp(-t * 4);
      impulseData[i] = (Math.random() * 2 - 1) * decay * 0.1;
    }

    // Apply very mild smoothing
    let lastSample = 0;
    for (let i = 0; i < length; i++) {
      impulseData[i] = impulseData[i] * 0.9 + lastSample * 0.1;
      lastSample = impulseData[i];
    }
  }

  convolver.buffer = impulseBuffer;
  return convolver;
}

// Piano note frequencies in Hz
const NOTE_FREQUENCIES: { [key: string]: number } = {
  // Octave 0 (lowest)
  C0: 16.35,
  "C#0": 17.32,
  D0: 18.35,
  "D#0": 19.45,
  E0: 20.6,
  F0: 21.83,
  "F#0": 23.12,
  G0: 24.5,
  "G#0": 25.96,
  A0: 27.5,
  "A#0": 29.14,
  B0: 30.87,
  // Octave 1
  C1: 32.7,
  "C#1": 34.65,
  D1: 36.71,
  "D#1": 38.89,
  E1: 41.2,
  F1: 43.65,
  "F#1": 46.25,
  G1: 49.0,
  "G#1": 51.91,
  A1: 55.0,
  "A#1": 58.27,
  B1: 61.74,
  // Octave 2
  C2: 65.41,
  "C#2": 69.3,
  D2: 73.42,
  "D#2": 77.78,
  E2: 82.41,
  F2: 87.31,
  "F#2": 92.5,
  G2: 98.0,
  "G#2": 103.83,
  A2: 110.0,
  "A#2": 116.54,
  B2: 123.47,
  // Octave 3
  C3: 130.81,
  "C#3": 138.59,
  D3: 146.83,
  "D#3": 155.56,
  E3: 164.81,
  F3: 174.61,
  "F#3": 185.0,
  G3: 196.0,
  "G#3": 207.65,
  A3: 220.0,
  "A#3": 233.08,
  B3: 246.94,
  // Octave 4 (middle C is C4)
  C4: 261.63,
  "C#4": 277.18,
  D4: 293.66,
  "D#4": 311.13,
  E4: 329.63,
  F4: 349.23,
  "F#4": 369.99,
  G4: 392.0,
  "G#4": 415.3,
  A4: 440.0,
  "A#4": 466.16,
  B4: 493.88,
  // Octave 5
  C5: 523.25,
  "C#5": 554.37,
  D5: 587.33,
  "D#5": 622.25,
  E5: 659.26,
  F5: 698.46,
  "F#5": 739.99,
  G5: 783.99,
  "G#5": 830.61,
  A5: 880.0,
  "A#5": 932.33,
  B5: 987.77,
  // Octave 6
  C6: 1046.5,
  "C#6": 1108.73,
  D6: 1174.66,
  "D#6": 1244.51,
  E6: 1318.51,
  F6: 1396.91,
  "F#6": 1479.98,
  G6: 1567.98,
  "G#6": 1661.22,
  A6: 1760.0,
  "A#6": 1864.66,
  B6: 1975.53,
  // Octave 7
  C7: 2093.0,
  "C#7": 2217.46,
  D7: 2349.32,
  "D#7": 2489.02,
  E7: 2637.02,
  F7: 2793.83,
  "F#7": 2959.96,
  G7: 3135.96,
  "G#7": 3322.44,
  A7: 3520.0,
  "A#7": 3729.31,
  B7: 3951.07,
  // Octave 8 (highest)
  C8: 4186.01,
  "C#8": 4434.92,
  D8: 4698.64,
  "D#8": 4978.03,
  E8: 5274.04,
  F8: 5587.65,
  "F#8": 5919.91,
  G8: 6271.93,
  "G#8": 6644.88,
  A8: 7040.0,
  "A#8": 7458.62,
  B8: 7902.13,
};

/**
 * Calculate slightly stretched harmonics due to string stiffness
 * Uses a simplified model to avoid filter instability
 */
function getHarmonicFrequency(
  fundamental: number,
  harmonicNumber: number,
): number {
  // Very simple inharmonicity model - higher notes have less inharmonicity
  let stretchFactor = 1.0;

  if (fundamental < 100) {
    // More inharmonicity in bass range
    stretchFactor = 1.0 + (harmonicNumber * harmonicNumber - 1) * 0.0006;
  } else if (fundamental < 400) {
    // Less inharmonicity in mid range
    stretchFactor = 1.0 + (harmonicNumber * harmonicNumber - 1) * 0.0003;
  } else {
    // Minimal inharmonicity in high range
    stretchFactor = 1.0 + (harmonicNumber * harmonicNumber - 1) * 0.0001;
  }

  return fundamental * harmonicNumber * stretchFactor;
}

/**
 * Safely stop and release a note's resources
 */
function releaseNote(noteId: string): void {
  const note = activeNotes.get(noteId);
  if (!note) return;

  note.stop();
  activeNotes.delete(noteId);
}

/**
 * Stop all currently playing notes
 */
export function stopAllNotes(): void {
  if (!audioContext) return;

  activeNotes.forEach((_note, id) => {
    releaseNote(id);
  });
}

/**
 * Play a piano note using additive synthesis with harmonic damping
 * This approach avoids BiquadFilterNode issues entirely by using simpler nodes
 */
export function playNote(
  note: string,
  octave: number,
  velocity: number = 0.7,
): string {
  if (!audioContext) {
    initAudio();
  }

  // Make sure we have an audio context and main gain
  if (!audioContext || !mainGainNode) {
    console.error("Could not initialize audio context");
    return "";
  }

  // Always resume the audio context (in case it was suspended)
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const noteId = `${note}${octave}`;
  const frequency = NOTE_FREQUENCIES[noteId];

  if (!frequency) {
    console.error(`Invalid note: ${noteId}`);
    return "";
  }

  // Limit the velocity range for safety
  const safeVelocity = Math.max(0.1, Math.min(0.9, velocity));

  try {
    const ctx = audioContext;
    const now = ctx.currentTime;

    // Determine the character of the note based on frequency range
    const isLowNote = frequency < 130;
    const isMidNote = frequency >= 130 && frequency <= 1000;
    const isHighNote = frequency > 1000;

    // Stop any existing note with the same ID
    if (activeNotes.has(noteId)) {
      releaseNote(noteId);
    }

    // How many harmonics to generate based on register
    const harmonicCount = isLowNote ? 8 : isMidNote ? 6 : 4;

    // Track all oscillators and gain nodes for this note
    const oscillators: OscillatorNode[] = [];
    const gainNodes: GainNode[] = [];

    // Create master envelope for this note
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(mainGainNode);
    gainNodes.push(masterGain);

    // Create amplitude and decay envelopes
    // Use very safe and small changes to prevent instability

    // Attack phase
    const attackTime = isLowNote ? 0.01 : isMidNote ? 0.008 : 0.005;
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(
      safeVelocity * 0.8,
      now + attackTime,
    );

    // Soft decay to sustain level
    const decayTime = isLowNote ? 1.5 : isMidNote ? 1.0 : 0.7;
    const sustainLevel = safeVelocity * 0.5;
    masterGain.gain.setTargetAtTime(
      sustainLevel,
      now + attackTime,
      decayTime * 0.3,
    );

    // Generate harmonics for this note
    for (let i = 1; i <= harmonicCount; i++) {
      // Calculate frequency with inharmonicity
      const harmonicFreq = getHarmonicFrequency(frequency, i);

      // Skip if beyond hearing range
      if (harmonicFreq > 18000) continue;

      // Create oscillator
      const osc = ctx.createOscillator();

      // Use simpler waveforms to avoid filter issues
      if (i === 1) {
        // Fundamental - use triangle for lower frequencies, sine for higher
        osc.type = isHighNote ? "sine" : "triangle";
      } else if (i % 2 === 0) {
        // Even harmonics - use sine
        osc.type = "sine";
      } else {
        // Odd harmonics - use sine or triangle
        osc.type = "sine";
      }

      // Set the frequency with slight random detuning for richness
      const detune = Math.random() * 4 - 2; // ±2 cents
      osc.frequency.value = harmonicFreq;
      osc.detune.value = detune;

      // Create harmonic gain node with envelope
      const harmonicGain = ctx.createGain();

      // Calculate harmonic amplitude
      // Harmonics get progressively quieter
      let harmonicAmplitude: number;
      if (i === 1) {
        // Fundamental is loudest
        harmonicAmplitude = 1.0;
      } else {
        // Higher harmonics decrease in volume
        harmonicAmplitude =
          1.0 / (i * (isLowNote ? 1.0 : isMidNote ? 1.2 : 1.5));
      }

      // Set initial gain
      harmonicGain.gain.value = 0;

      // Harmonic envelope - different timing for different harmonics
      const harmonicAttackTime = attackTime * (1 + i * 0.1);
      harmonicGain.gain.setValueAtTime(0, now);
      harmonicGain.gain.linearRampToValueAtTime(
        harmonicAmplitude,
        now + harmonicAttackTime,
      );

      // Decay envelope - higher harmonics decay faster
      const harmonicDecayTime = decayTime / (i * 0.7);
      const harmonicSustainLevel =
        harmonicAmplitude * (i === 1 ? 0.8 : 0.3 / i);
      harmonicGain.gain.setTargetAtTime(
        harmonicSustainLevel,
        now + harmonicAttackTime,
        harmonicDecayTime * 0.5,
      );

      // Connect oscillator to its gain
      osc.connect(harmonicGain);

      // Connect harmonic gain to master gain
      harmonicGain.connect(masterGain);

      // Start oscillator
      osc.start(now);

      // Track oscillator and gain
      oscillators.push(osc);
      gainNodes.push(harmonicGain);
    }

    // Create release function to stop all oscillators
    const stopTime = now + 20; // Maximum note duration
    const stop = () => {
      const releaseTime = isLowNote ? 0.5 : isMidNote ? 0.3 : 0.1;
      const timeNow = ctx.currentTime;

      // Fade out master gain
      masterGain.gain.cancelScheduledValues(timeNow);
      masterGain.gain.setValueAtTime(masterGain.gain.value, timeNow);
      masterGain.gain.linearRampToValueAtTime(0, timeNow + releaseTime);

      // Schedule all oscillators to stop
      oscillators.forEach((osc) => {
        osc.stop(timeNow + releaseTime + 0.01);
      });

      // Schedule cleanup
      setTimeout(
        () => {
          // Disconnect all nodes
          gainNodes.forEach((gain) => gain.disconnect());
        },
        (releaseTime + 0.1) * 1000,
      );
    };

    // Save note info
    activeNotes.set(noteId, {
      id: noteId,
      oscillators,
      gainNodes,
      scheduledEndTime: stopTime,
      stop,
    });

    return noteId;
  } catch (e) {
    console.error("Error playing note:", e);
    return "";
  }
}

/**
 * Stop the currently playing note
 */
export function stopNote(noteId: string): void {
  releaseNote(noteId);
}

/**
 * Set the main volume safely
 */
export function setVolume(volume: number): void {
  if (!mainGainNode || !audioContext) return;

  // Limit volume to safe range
  const safeVolume = Math.max(0, Math.min(0.8, volume));

  // Use linear ramp for stability
  const now = audioContext.currentTime;
  mainGainNode.gain.cancelScheduledValues(now);
  mainGainNode.gain.setValueAtTime(mainGainNode.gain.value, now);
  mainGainNode.gain.linearRampToValueAtTime(safeVolume, now + 0.05);
}

/**
 * Get the current volume setting
 * @returns Current volume from 0.0 to 1.0
 */
export function getVolume(): number {
  if (!mainGainNode) return 0;
  return mainGainNode.gain.value;
}
