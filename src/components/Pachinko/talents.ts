import type { Tuning } from "./physics";

export const TREES = ["Sight", "Force", "Fortune"] as const;
/** Points needed in a tree's lower tiers to open each further tier. */
export const TIER_COST = 3;
export const TIERS = 4;

export type TalentId =
  | "longSight"
  | "ricochet"
  | "reserve"
  | "deepScan"
  | "omen"
  | "wideBucket"
  | "lively"
  | "shockwave"
  | "slowBucket"
  | "split"
  | "spare"
  | "coinFlip"
  | "richVein"
  | "chain"
  | "streak"
  | "ignition";

export type Ranks = Partial<Record<TalentId, number>>;

export type Talent = {
  id: TalentId;
  tree: 0 | 1 | 2;
  tier: number;
  /** Column within the tree: 0, 0.5 (centered) or 1. */
  col: number;
  max: number;
  name: string;
  /** Inner SVG markup for a 24x24 stroked icon. */
  icon: string;
  /** Must be at max rank first. */
  requires?: TalentId;
  describe: (rank: number) => string;
};

const pick = <T>(values: T[], rank: number) => values[rank - 1];

export const TALENTS: Talent[] = [
  {
    id: "longSight",
    tree: 0,
    tier: 0,
    col: 0.5,
    max: 3,
    name: "Long Sight",
    icon: '<path d="M4 20 20 4"/><path d="M13 4h7v7"/>',
    describe: (r) => `The aim guide reaches ${r * 25}% further.`,
  },
  {
    id: "ricochet",
    tree: 0,
    tier: 1,
    col: 0,
    max: 3,
    name: "Ricochet Sight",
    icon: '<path d="M3 5l6 13 6-11 6 11"/>',
    describe: (r) =>
      `The aim guide follows the ball through ${r} bounce${r > 1 ? "s" : ""}.`,
  },
  {
    id: "reserve",
    tree: 0,
    tier: 1,
    col: 1,
    max: 2,
    name: "Reserve",
    icon: '<path d="M12 3l7 9-7 9-7-9z"/><path d="M12 9v6M9 12h6"/>',
    describe: (r) =>
      `Start each board with ${r} extra Foresight charge${r > 1 ? "s" : ""}.`,
  },
  {
    id: "deepScan",
    tree: 0,
    tier: 2,
    col: 1,
    max: 2,
    name: "Deep Scan",
    icon: '<path d="M12 4 4 20M12 4 9 20M12 4l3 16M12 4l8 16"/>',
    requires: "reserve",
    describe: (r) => `Foresight tests ${pick([2, 4], r)}x as many angles.`,
  },
  {
    id: "omen",
    tree: 0,
    tier: 3,
    col: 0,
    max: 1,
    name: "Omen",
    icon: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    requires: "ricochet",
    describe: () =>
      "The aim guide turns green when the shot will land in the bucket.",
  },
  {
    id: "wideBucket",
    tree: 1,
    tier: 0,
    col: 0,
    max: 3,
    name: "Wide Bucket",
    icon: '<path d="M3 8l3 11h12l3-11"/><path d="M1 8h4M19 8h4"/>',
    describe: (r) => `The bucket is ${r * 12}% wider.`,
  },
  {
    id: "lively",
    tree: 1,
    tier: 0,
    col: 1,
    max: 2,
    name: "Lively Ball",
    icon: '<circle cx="7" cy="6" r="3"/><path d="M3 20c3-9 6-9 8 0 2-5 5-5 9 0"/>',
    describe: (r) => `The ball keeps ${r * 4}% more speed when it hits a peg.`,
  },
  {
    id: "shockwave",
    tree: 1,
    tier: 1,
    col: 0,
    max: 3,
    name: "Shockwave",
    icon: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10"/>',
    describe: (r) =>
      `Every ${pick(["9th", "7th", "5th"], r)} peg the ball hits in a shot also lights the pegs around it.`,
  },
  {
    id: "slowBucket",
    tree: 1,
    tier: 2,
    col: 1,
    max: 2,
    name: "Slow Bucket",
    icon: '<path d="M6 3h12M6 21h12M7 3c0 6 10 6 10 18M17 3c0 6-10 6-10 18"/>',
    describe: (r) => `The bucket moves ${r * 20}% slower.`,
  },
  {
    id: "split",
    tree: 1,
    tier: 3,
    col: 0,
    max: 1,
    name: "Split",
    icon: '<path d="M12 3v7M12 10 5 21M12 10l7 11"/>',
    requires: "shockwave",
    describe: () => "Hitting a charge peg splits the ball in two.",
  },
  {
    id: "spare",
    tree: 2,
    tier: 0,
    col: 0,
    max: 3,
    name: "Spare Balls",
    icon: '<circle cx="6.5" cy="16" r="3.5"/><circle cx="17.5" cy="16" r="3.5"/><circle cx="12" cy="7" r="3.5"/>',
    describe: (r) => `Start each board with ${r} more ball${r > 1 ? "s" : ""}.`,
  },
  {
    id: "coinFlip",
    tree: 2,
    tier: 0,
    col: 1,
    max: 3,
    name: "Coin Flip",
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M15 9.5c-1-1.6-6-1.6-6 .8s6 1.6 6 4.2-5 2.4-6 .8"/>',
    describe: (r) =>
      `A shot that hits nothing has a ${r * 25}% chance to give the ball back.`,
  },
  {
    id: "richVein",
    tree: 2,
    tier: 1,
    col: 0,
    max: 2,
    name: "Rich Vein",
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    describe: (r) =>
      `Each board has ${r} more green peg${r > 1 ? "s" : ""}, each worth a Foresight charge.`,
  },
  {
    id: "chain",
    tree: 2,
    tier: 1,
    col: 1,
    max: 2,
    name: "Chain Reaction",
    icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
    describe: (r) =>
      `Hitting the purple peg also lights the pegs ${pick(["next to it", "in a wide area around it"], r)}.`,
  },
  {
    id: "streak",
    tree: 2,
    tier: 2,
    col: 1,
    max: 2,
    name: "Streak",
    icon: '<path d="M5 19l7-6 7 6M5 12l7-6 7 6"/>',
    describe: (r) =>
      `Lighting ${pick([14, 10], r)} pegs in one shot earns a free ball.`,
  },
  {
    id: "ignition",
    tree: 2,
    tier: 3,
    col: 0,
    max: 1,
    name: "Ignition",
    icon: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
    requires: "richVein",
    describe: () =>
      "Hitting a green peg and landing in the bucket in the same shot turns a blue peg green.",
  },
];

export const TALENT_BY_ID = Object.fromEntries(
  TALENTS.map((t) => [t.id, t]),
) as Record<TalentId, Talent>;

export const rankOf = (ranks: Ranks, id: TalentId) => ranks[id] ?? 0;

export const spentIn = (ranks: Ranks, tree: number) =>
  TALENTS.reduce((n, t) => (t.tree === tree ? n + rankOf(ranks, t.id) : n), 0);

export const spentTotal = (ranks: Ranks) =>
  TALENTS.reduce((n, t) => n + rankOf(ranks, t.id), 0);

const spentBelow = (ranks: Ranks, tree: number, tier: number) =>
  TALENTS.reduce(
    (n, t) => (t.tree === tree && t.tier < tier ? n + rankOf(ranks, t.id) : n),
    0,
  );

/** Why the next rank can't be bought, or null if it can (ignoring points). */
export function lockReason(ranks: Ranks, id: TalentId): string | null {
  const t = TALENT_BY_ID[id];
  if (rankOf(ranks, id) >= t.max) return "Max rank";
  const need = t.tier * TIER_COST;
  if (spentBelow(ranks, t.tree, t.tier) < need)
    return `Requires ${need} points in ${TREES[t.tree]} above this tier`;
  if (t.requires) {
    const req = TALENT_BY_ID[t.requires];
    if (rankOf(ranks, req.id) < req.max)
      return `Requires ${req.max} point${req.max > 1 ? "s" : ""} in ${req.name}`;
  }
  return null;
}

/** A rank can be refunded only if everything still learned stays legal. */
export function canUnlearn(ranks: Ranks, id: TalentId): boolean {
  const rank = rankOf(ranks, id);
  if (rank <= 0) return false;
  const next = { ...ranks, [id]: rank - 1 };
  return TALENTS.every((t) => {
    if (rankOf(next, t.id) === 0) return true;
    if (spentBelow(next, t.tree, t.tier) < t.tier * TIER_COST) return false;
    if (!t.requires) return true;
    return rankOf(next, t.requires) >= TALENT_BY_ID[t.requires].max;
  });
}

export type Mods = {
  tune: Tuning;
  guideLength: number;
  guideBounces: number;
  startCharges: number;
  scanSamples: number;
  omen: boolean;
  balls: number;
  /** Green pegs placed on each board. */
  chargePegs: number;
  /** Chance that a shot hitting nothing returns the ball. */
  coinFlip: number;
  /** Pegs in one shot for a free ball. 0 = off. */
  streakAt: number;
  /** Green peg plus a bucket catch in one shot turns a blue peg green. */
  ignition: boolean;
};

export function modsFor(ranks: Ranks): Mods {
  const r = (id: TalentId) => rankOf(ranks, id);
  return {
    tune: {
      gravity: 1000,
      launchSpeed: 640,
      restitution: 0.7 + r("lively") * 0.04,
      bucketW: 104 * (1 + r("wideBucket") * 0.12),
      bucketRate: 0.9 * (1 - r("slowBucket") * 0.2),
      shockEvery: [0, 9, 7, 5][r("shockwave")],
      shockRadius: 62,
      chainRadius: [0, 66, 100][r("chain")],
      split: r("split") > 0,
    },
    guideLength: 300 * (1 + r("longSight") * 0.25),
    guideBounces: r("ricochet"),
    startCharges: 1 + r("reserve"),
    scanSamples: 1800 * [1, 2, 4][r("deepScan")],
    omen: r("omen") > 0,
    balls: 10 + r("spare"),
    chargePegs: 2 + r("richVein"),
    coinFlip: r("coinFlip") * 0.25,
    streakAt: [0, 14, 10][r("streak")],
    ignition: r("ignition") > 0,
  };
}
