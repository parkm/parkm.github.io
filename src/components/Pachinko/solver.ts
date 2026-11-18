import {
  BONUS,
  type Board,
  CHARGE,
  MAX_AIM,
  type Sim,
  TARGET,
  type Tuning,
  simulateShot,
} from "./physics";

export type Found = {
  angle: number;
  value: number;
  pegs: number;
  targets: number;
  tested: number;
};

const REFINE_TOP = 6;
const REFINE_SAMPLES = 20;

/**
 * Searches launch angles for the most valuable shot by playing each one out.
 * Runs in slices so the page stays responsive: call `step` once per frame.
 */
export class Scan {
  best: Found = {
    angle: 0,
    value: -1,
    pegs: 0,
    targets: 0,
    tested: 0,
  };
  /** The angle most recently tested, for drawing the sweep. */
  cursor = -MAX_AIM;
  private index = 0;
  private values: Float32Array;
  private refine: number[] | null = null;
  private total: number;

  constructor(
    private sim: Sim,
    private board: Board,
    private tune: Tuning,
    private samples: number,
    private targetsLeft: number,
  ) {
    this.values = new Float32Array(samples);
    this.total = samples + REFINE_TOP * REFINE_SAMPLES;
  }

  get progress() {
    return Math.min(1, this.best.tested / this.total);
  }

  private get spacing() {
    return (2 * MAX_AIM) / (this.samples - 1);
  }

  private test(angle: number): number {
    const shot = simulateShot(this.sim, this.board, this.tune, angle);
    // Bucket catches aren't counted: the player picks the moment to fire, so
    // where the bucket is now says nothing about where it will be.
    let value = 0;
    let targets = 0;
    for (const i of shot.order) {
      const kind = this.board.pegs[i].kind;
      if (kind === TARGET) {
        targets++;
        value += 100;
      } else if (kind === BONUS) value += 60;
      else if (kind === CHARGE) value += 40;
      else value += 10;
    }
    if (targets >= this.targetsLeft) value += 5000;

    this.best.tested++;
    this.cursor = angle;
    if (value > this.best.value) {
      this.best = {
        angle,
        value,
        pegs: shot.order.length,
        targets,
        tested: this.best.tested,
      };
    }
    return value;
  }

  /** Work for about `ms` milliseconds. Returns true when the search is done. */
  step(ms: number): boolean {
    const deadline = performance.now() + ms;
    while (performance.now() < deadline) {
      if (this.index < this.samples) {
        const i = this.index++;
        this.values[i] = this.test(-MAX_AIM + i * this.spacing);
        continue;
      }

      // Second pass: look more closely around the best coarse angles. A shot's
      // outcome changes sharply with angle, so the best one is often between
      // two coarse samples.
      if (!this.refine) {
        const ranked = Array.from(this.values.keys()).sort(
          (a, b) => this.values[b] - this.values[a],
        );
        this.refine = [];
        for (const i of ranked.slice(0, REFINE_TOP)) {
          const center = -MAX_AIM + i * this.spacing;
          for (let k = 0; k < REFINE_SAMPLES; k++)
            this.refine.push(
              center + ((k + 0.5) / REFINE_SAMPLES - 0.5) * 2 * this.spacing,
            );
        }
      }
      const angle = this.refine.pop();
      if (angle === undefined) return true;
      if (Math.abs(angle) <= MAX_AIM) this.test(angle);
      else this.best.tested++;
    }
    return false;
  }
}
