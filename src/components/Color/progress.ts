// Persistent game progress via localStorage.

const KEY = "color-game-progress-v2";

export interface Progress {
  tutorialDone: boolean;
  wave: number;
  score: number;
  best: number;
}

export function loadProgress(): Progress | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Progress;
    if (typeof p.score !== "number" || typeof p.wave !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage full or disabled — progress just won't persist
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// True when there's a resumable run (tutorial already finished).
export function hasProgress(): boolean {
  const p = loadProgress();
  return !!(p && p.tutorialDone);
}
