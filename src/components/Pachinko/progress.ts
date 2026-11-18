import { type Ranks, TALENT_BY_ID, type TalentId, spentTotal } from "./talents";

const KEY = "pachinko:v1";
export const MAX_LEVEL = 25;

export type Progress = {
  xp: number;
  ranks: Ranks;
  /** Number of boards unlocked. */
  unlocked: number;
  best: number[];
  muted: boolean;
};

export const freshProgress = (): Progress => ({
  xp: 0,
  ranks: {},
  unlocked: 1,
  best: [],
  muted: false,
});

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshProgress();
    const data = JSON.parse(raw) as Partial<Progress>;
    const ranks: Ranks = {};
    for (const [id, rank] of Object.entries(data.ranks ?? {})) {
      const talent = TALENT_BY_ID[id as TalentId];
      if (talent && typeof rank === "number")
        ranks[talent.id] = Math.max(0, Math.min(talent.max, Math.floor(rank)));
    }
    const xp = Number(data.xp) || 0;
    // A save that spends more points than its level allows starts the tree over.
    const legal = spentTotal(ranks) <= levelInfo(xp).level - 1;
    return {
      xp,
      ranks: legal ? ranks : {},
      unlocked: Math.max(1, Number(data.unlocked) || 1),
      best: Array.isArray(data.best)
        ? data.best.map((n) => Number(n) || 0)
        : [],
      muted: !!data.muted,
    };
  } catch {
    return freshProgress();
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable (private mode); progress lasts for this visit only.
  }
}

/** XP needed to go from `level` to the next. */
const xpToNext = (level: number) => 4000 + 1500 * level;

export function levelInfo(xp: number) {
  let level = 1;
  let left = xp;
  while (level < MAX_LEVEL && left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  const need = xpToNext(level);
  return {
    level,
    into: level >= MAX_LEVEL ? need : left,
    need,
  };
}

/** One talent point per level after the first. */
export const pointsFree = (p: Progress) =>
  levelInfo(p.xp).level - 1 - spentTotal(p.ranks);
