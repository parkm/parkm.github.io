/**
 * iOS plays Web Audio on the ringer channel, which the mute switch silences.
 * Asking for the playback session (Safari 16.4+), or playing a media element
 * once from a user gesture, moves the page to the normal playback channel.
 */

// A tiny silent WAV.
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

let unlocked = false;

/** Call from a user gesture, before or as audio starts. Safe to call repeatedly. */
export function unlockPlayback() {
  if (unlocked || typeof document === "undefined") return;
  unlocked = true;
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) nav.audioSession.type = "playback";
  const silence = new Audio(SILENCE);
  silence.play().catch(() => {
    unlocked = false; // Not a gesture yet; try again on the next one.
  });
}
