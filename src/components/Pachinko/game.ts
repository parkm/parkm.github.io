import * as audio from "./audio";
import { BOARDS } from "./boards";
import {
  BONUS,
  type Board,
  CHARGE,
  FILLER,
  H,
  LAUNCH_X,
  LAUNCH_Y,
  LIVE,
  MAX_AIM,
  STEP,
  type Sim,
  type SimEvent,
  TARGET,
  type Trace,
  W,
  buildBoard,
  createSim,
  launch,
  simulateShot,
  stepSim,
  traceShot,
} from "./physics";
import {
  type Progress,
  freshProgress,
  levelInfo,
  loadProgress,
  pointsFree,
  saveProgress,
} from "./progress";
import { PEG_COLORS, type View, draw } from "./render";
import { type Found, Scan } from "./solver";
import {
  type Mods,
  type TalentId,
  canUnlearn,
  lockReason,
  modsFor,
  rankOf,
} from "./talents";
import { Overlay, boardPanel, resultsPanel, talentPanel } from "./ui";

type Phase = "aim" | "scan" | "shot" | "sweep" | "over";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
};

type Popup = {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  size: number;
};

export type Game = {
  mods: Mods;
  boardIndex: number;
  board: Board;
  sim: Sim;
  phase: Phase;
  score: number;
  balls: number;
  charges: number;
  targetsTotal: number;
  targetsLeft: number;
  /** Radians from straight down; positive aims right. */
  angle: number;
  guide: Trace | null;
  guideCatches: boolean;
  /**
   * The Foresight shot the player is committed to: the aim is fixed on it until
   * it is fired. Retraced every frame, since the bucket keeps moving.
   */
  locked: Trace | null;
  scan: Scan | null;
  /** How many entries of `sim.order` have been scored. */
  scored: number;
  flash: Float32Array;
  trails: number[][];
  particles: Particle[];
  popups: Popup[];
  sweepQueue: number[];
  sweepTimer: number;
  time: number;
  hint: string;
};

const BASE_POINTS = [10, 100, 500, 50];
const TARGET_COUNT = 25;
const SWEEP_INTERVAL = 0.035;
const BALL_BONUS = 2000;

function multiplier(g: Game) {
  const cleared = 1 - g.targetsLeft / g.targetsTotal;
  if (cleared >= 0.92) return 10;
  if (cleared >= 0.8) return 5;
  if (cleared >= 0.6) return 3;
  if (cleared >= 0.4) return 2;
  return 1;
}

function shuffled(n: number) {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function startPachinko(root: HTMLElement) {
  const $ = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const canvas = $<HTMLCanvasElement>("pk-canvas");
  const ctx = canvas.getContext("2d")!;
  const dom = {
    board: $("pk-board"),
    score: $("pk-score"),
    targets: $("pk-targets"),
    mult: $("pk-mult"),
    level: $("pk-level"),
    xp: $("pk-xp"),
    note: $("pk-note"),
    points: $("pk-points"),
    charges: $("pk-charges"),
    foresight: $<HTMLButtonElement>("pk-foresight"),
    mute: $<HTMLButtonElement>("pk-mute"),
  };

  const progress: Progress = loadProgress();
  audio.setMuted(progress.muted);

  const view: View = { scale: 1, ox: 0, oy: 0, dpr: 1, width: 0, height: 0 };
  const events: SimEvent[] = [];
  let paused = false;
  let acc = 0;
  let lastTarget = -1;
  let noteTimer = 0;
  let touchAiming = false;

  const g: Game = {
    mods: modsFor(progress.ranks),
    boardIndex: 0,
    board: buildBoard([]),
    sim: createSim(0),
    phase: "aim",
    score: 0,
    balls: 0,
    charges: 0,
    targetsTotal: 1,
    targetsLeft: 1,
    angle: 0,
    guide: null,
    guideCatches: false,
    locked: null,
    scan: null,
    scored: 0,
    flash: new Float32Array(0),
    trails: [],
    particles: [],
    popups: [],
    sweepQueue: [],
    sweepTimer: 0,
    time: 0,
    hint: "",
  };

  const overlay = new Overlay($("pk-overlay"), $("pk-panel"), (open) => {
    paused = open;
  });

  // ---- board setup ----------------------------------------------------------

  function loadBoard(index: number) {
    const pegs = BOARDS[index].build();
    const order = shuffled(pegs.length);
    const targets = Math.min(TARGET_COUNT, Math.floor(pegs.length * 0.45));
    const { chargePegs } = modsFor(progress.ranks);
    order.forEach((peg, n) => {
      pegs[peg].kind =
        n < targets ? TARGET : n < targets + chargePegs ? CHARGE : FILLER;
    });

    g.mods = modsFor(progress.ranks);
    g.boardIndex = index;
    g.board = buildBoard(pegs);
    g.sim = createSim(pegs.length);
    g.phase = "aim";
    g.score = 0;
    g.balls = g.mods.balls;
    g.charges = g.mods.startCharges;
    g.targetsTotal = g.targetsLeft = targets;
    g.locked = g.scan = null;
    g.flash = new Float32Array(pegs.length);
    g.trails = [];
    g.particles = [];
    g.popups = [];
    g.hint = matchMedia("(pointer: coarse)").matches
      ? "Drag to aim, let go to fire"
      : "Move to aim, click to fire";
    lastTarget = -1;
    acc = 0;
    pickBonus();
    say("");
  }

  /** One filler peg is worth extra each shot. */
  function pickBonus() {
    const fillers: number[] = [];
    g.board.pegs.forEach((p, i) => {
      if (p.kind === BONUS) p.kind = FILLER;
      if (p.kind === FILLER && g.sim.alive[i]) fillers.push(i);
    });
    if (fillers.length)
      g.board.pegs[fillers[Math.floor(Math.random() * fillers.length)]].kind =
        BONUS;
  }

  // ---- feedback -------------------------------------------------------------

  function say(text: string, seconds = 0) {
    dom.note.textContent = text;
    noteTimer = seconds;
    if (text) g.hint = "";
  }

  function popup(x: number, y: number, text: string, color: string, size = 15) {
    g.popups.push({
      x: Math.max(40, Math.min(W - 40, x)),
      y,
      text,
      life: 1,
      color,
      size,
    });
  }

  function burst(x: number, y: number, color: string, count = 7) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 140;
      const life = 0.3 + Math.random() * 0.3;
      g.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 40,
        life,
        max: life,
        color,
      });
    }
  }

  // ---- a shot ---------------------------------------------------------------

  function fire() {
    if (g.phase !== "aim" || paused || g.balls <= 0) return;
    g.balls--;
    launch(g.sim, g.mods.tune, g.angle);
    g.phase = "shot";
    g.scored = 0;
    g.locked = g.guide = null;
    g.trails = [];
    g.hint = "";
    acc = 0;
    say("");
    audio.playLaunch();
  }

  /** Score pegs lit since the last call, in the order they lit. */
  function scoreNewPegs() {
    const { order } = g.sim;
    while (g.scored < order.length) {
      const i = order[g.scored++];
      const peg = g.board.pegs[i];
      const combo = 1 + 0.1 * (g.scored - 1);
      const points =
        Math.round((BASE_POINTS[peg.kind] * multiplier(g) * combo) / 5) * 5;
      g.score += points;
      g.flash[i] = 1;
      const color = PEG_COLORS[peg.kind].lit;
      popup(peg.cx, peg.cy - 18, String(points), color);
      audio.playPeg(g.scored - 1, true);

      if (peg.kind === TARGET) {
        g.targetsLeft--;
        if (g.targetsLeft === 1)
          lastTarget = g.board.pegs.findIndex(
            (p, j) => p.kind === TARGET && g.sim.alive[j] && !g.sim.lit[j],
          );
      } else if (peg.kind === CHARGE) {
        g.charges++;
        popup(peg.cx, peg.cy - 38, "+1 Foresight", color);
      }
    }
  }

  function handleEvents() {
    for (const e of events) {
      if (e.type === "hit") {
        g.flash[e.peg] = Math.max(g.flash[e.peg], 0.6);
        audio.playPeg(0, false);
      } else if (e.type === "wall" || e.type === "rim") {
        audio.playWall();
      } else if (e.type === "caught") {
        audio.playCatch();
        popup(e.x, e.y - 30, "Free ball", "#7dffb0", 18);
        burst(e.x, e.y - 10, "#7dffb0", 14);
      } else if (e.type === "freed") {
        const peg = g.board.pegs[e.peg];
        burst(peg.cx, peg.cy, PEG_COLORS[peg.kind].lit);
      } else if (e.type === "shock") {
        burst(e.x, e.y, "#ffffff", 16);
      }
    }
    events.length = 0;
  }

  /** Slow down as a ball closes in on the last target. */
  function timeScale() {
    if (g.targetsLeft !== 1 || lastTarget < 0) return 1;
    const peg = g.board.pegs[lastTarget];
    for (const ball of g.sim.balls)
      if (
        ball.state === LIVE &&
        Math.hypot(ball.x - peg.cx, ball.y - peg.cy) < 110
      )
        return 0.3;
    return 1;
  }

  function endShot() {
    const { sim, mods } = g;
    g.balls += sim.caught;
    if (mods.streakAt && sim.order.length >= mods.streakAt) {
      g.balls++;
      popup(W / 2, H - 120, "Streak: free ball", "#ffd98a", 18);
    }
    if (
      sim.order.length === 0 &&
      sim.caught === 0 &&
      Math.random() < mods.coinFlip
    ) {
      g.balls++;
      popup(W / 2, H - 120, "Coin flip: ball returned", "#ffd98a", 18);
    }
    if (
      mods.ignition &&
      sim.caught > 0 &&
      sim.order.some((i) => g.board.pegs[i].kind === CHARGE)
    ) {
      const blues: number[] = [];
      g.board.pegs.forEach((p, i) => {
        if (p.kind === FILLER && sim.alive[i] && !sim.lit[i]) blues.push(i);
      });
      if (blues.length) {
        const peg =
          g.board.pegs[blues[Math.floor(Math.random() * blues.length)]];
        peg.kind = CHARGE;
        popup(peg.cx, peg.cy - 18, "Ignition", PEG_COLORS[CHARGE].lit, 18);
        burst(peg.cx, peg.cy, PEG_COLORS[CHARGE].lit, 14);
      }
    }
    g.sweepQueue = sim.order.slice();
    g.sweepTimer = 0;
    g.phase = "sweep";
  }

  /** Remove the pegs lit by the last shot, one at a time. */
  function sweep(dt: number) {
    g.sweepTimer -= dt;
    while (g.sweepTimer <= 0 && g.sweepQueue.length) {
      const i = g.sweepQueue.shift()!;
      g.sweepTimer += SWEEP_INTERVAL;
      if (!g.sim.alive[i]) continue;
      g.sim.alive[i] = 0;
      const peg = g.board.pegs[i];
      burst(peg.cx, peg.cy, PEG_COLORS[peg.kind].lit);
      audio.playPop(g.sim.order.length - g.sweepQueue.length);
    }
    if (g.sweepQueue.length) return;

    g.sim.lit.fill(0);
    g.sim.balls = [];
    g.trails = [];
    if (g.targetsLeft === 0) finish(true);
    else if (g.balls === 0) finish(false);
    else {
      pickBonus();
      g.phase = "aim";
    }
  }

  function finish(won: boolean) {
    g.phase = "over";
    const ballBonus = won ? g.balls * BALL_BONUS : 0;
    g.score += ballBonus;

    const before = levelInfo(progress.xp).level;
    progress.xp += g.score;
    const level = levelInfo(progress.xp).level;
    const previousBest = progress.best[g.boardIndex] ?? 0;
    const newBest = won && g.score > previousBest;
    if (newBest) progress.best[g.boardIndex] = g.score;
    if (won)
      progress.unlocked = Math.min(
        BOARDS.length,
        Math.max(progress.unlocked, g.boardIndex + 2),
      );
    saveProgress(progress);
    if (won) audio.playWin();
    else audio.playLose();

    const showResults = () =>
      overlay.show(
        won ? "Board cleared" : "Out of balls",
        resultsPanel(
          {
            won,
            score: g.score,
            ballBonus,
            best: Math.max(previousBest, won ? g.score : 0),
            newBest,
            levelsGained: level - before,
            level,
            hasNext: g.boardIndex + 1 < BOARDS.length,
          },
          {
            retry: () => startBoard(g.boardIndex),
            next: () => startBoard(g.boardIndex + 1),
            talents: () => openTalents(showResults),
          },
        ),
        null,
      );
    showResults();
  }

  function startBoard(index: number) {
    overlay.close();
    loadBoard(index);
  }

  // ---- foresight ------------------------------------------------------------

  /** The whole path of the committed shot if it were fired this instant. */
  function traceLocked() {
    g.locked = traceShot(
      g.sim,
      g.board,
      g.mods.tune,
      g.angle,
      Infinity,
      Infinity,
    );
    g.guideCatches = g.locked.caught > 0;
  }

  function foresight() {
    // Once a shot is found there is no backing out of it.
    if (g.phase !== "aim" || paused || g.locked) return;
    if (g.charges <= 0) {
      say("No Foresight charges. Hit a green peg to earn one.", 3);
      return;
    }
    g.charges--;
    g.scan = new Scan(
      g.sim,
      g.board,
      g.mods.tune,
      g.mods.scanSamples,
      g.targetsLeft,
    );
    g.phase = "scan";
    say("");
  }

  function runScan() {
    if (!g.scan || !g.scan.step(9)) return;
    const found = g.scan.best;
    g.scan = null;
    g.phase = "aim";
    g.angle = found.angle;
    traceLocked();
    audio.playFound();
    say(foundNote(found));
  }

  function foundNote(found: Found) {
    const parts = [
      `${found.pegs} peg${found.pegs === 1 ? "" : "s"}`,
      `${found.targets} target${found.targets === 1 ? "" : "s"}`,
    ];
    const how = matchMedia("(pointer: coarse)").matches
      ? "Tap to fire. Time the bucket."
      : "Click to fire. Time the bucket.";
    return `Best of ${found.tested.toLocaleString()} shots: ${parts.join(", ")}. ${how}`;
  }

  // ---- frame ----------------------------------------------------------------

  function update(dt: number) {
    g.time += dt;
    for (let i = 0; i < g.flash.length; i++)
      if (g.flash[i] > 0) g.flash[i] = Math.max(0, g.flash[i] - dt * 4);
    for (const p of g.particles) {
      p.life -= dt;
      p.vy += 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
    for (const p of g.popups) {
      p.life -= dt * 0.9;
      p.y -= 30 * dt;
    }
    g.popups = g.popups.filter((p) => p.life > 0);
    if (noteTimer > 0 && (noteTimer -= dt) <= 0) say("");

    if (g.phase === "scan") {
      runScan();
    } else if (g.phase === "aim") {
      g.sim.tick += Math.round(dt / STEP);
      if (g.locked) {
        // The bucket keeps moving, so the end of the path changes with it. The
        // player chooses the moment; the path drawn is the shot fired right now.
        traceLocked();
      } else {
        const { tune } = g.mods;
        g.guide = traceShot(
          g.sim,
          g.board,
          tune,
          g.angle,
          g.mods.guideBounces,
          g.mods.guideLength,
        );
        g.guideCatches =
          g.mods.omen && simulateShot(g.sim, g.board, tune, g.angle).caught > 0;
      }
    } else if (g.phase === "shot") {
      acc += dt * timeScale();
      let live = true;
      while (acc >= STEP && live) {
        acc -= STEP;
        live = stepSim(g.sim, g.board, g.mods.tune, events);
        scoreNewPegs();
      }
      handleEvents();
      g.sim.balls.forEach((ball, n) => {
        const trail = (g.trails[n] ??= []);
        if (ball.state === LIVE) trail.push(ball.x, ball.y);
        if (trail.length > 24 || (ball.state !== LIVE && trail.length))
          trail.splice(0, 2);
      });
      if (!live) endShot();
    } else if (g.phase === "sweep") {
      sweep(dt);
    }
  }

  let shown = "";
  function updateHud() {
    const { level, into, need } = levelInfo(progress.xp);
    const free = pointsFree(progress);
    const key = [
      g.boardIndex,
      g.score,
      g.targetsLeft,
      g.charges,
      level,
      into,
      free,
      g.phase,
      !!g.locked,
      progress.muted,
    ].join();
    if (key === shown) return;
    shown = key;
    dom.board.textContent = `${g.boardIndex + 1}. ${BOARDS[g.boardIndex].name}`;
    dom.score.textContent = g.score.toLocaleString();
    dom.targets.textContent = `${g.targetsTotal - g.targetsLeft}/${g.targetsTotal}`;
    dom.mult.textContent = `×${multiplier(g)}`;
    dom.level.textContent = `Lv ${level}`;
    dom.xp.style.width = `${(into / need) * 100}%`;
    dom.points.textContent = free > 0 ? String(free) : "";
    dom.points.hidden = free <= 0;
    dom.charges.textContent = String(g.charges);
    dom.foresight.disabled = g.phase !== "aim" || g.charges <= 0 || !!g.locked;
    dom.mute.textContent = progress.muted ? "Sound off" : "Sound on";
    dom.mute.setAttribute("aria-pressed", String(!progress.muted));
  }

  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) update(dt);
    updateHud();
    draw(ctx, g, view);
    requestAnimationFrame(frame);
  }

  // ---- panels ---------------------------------------------------------------

  function applyTalents() {
    g.mods = modsFor(progress.ranks);
    saveProgress(progress);
  }

  function openTalents(onClose: () => void = () => overlay.close()) {
    overlay.show(
      "Talents",
      talentPanel({
        progress: () => progress,
        learn: (id: TalentId) => {
          if (pointsFree(progress) <= 0 || lockReason(progress.ranks, id))
            return;
          progress.ranks[id] = rankOf(progress.ranks, id) + 1;
          applyTalents();
        },
        unlearn: (id: TalentId) => {
          if (!canUnlearn(progress.ranks, id)) return;
          progress.ranks[id] = rankOf(progress.ranks, id) - 1;
          applyTalents();
        },
        reset: () => {
          progress.ranks = {};
          applyTalents();
        },
      }),
      onClose,
    );
  }

  function openBoards() {
    if (g.phase === "over") return;
    overlay.show(
      "Boards",
      boardPanel(progress, g.boardIndex, startBoard, resetProgress),
      () => overlay.close(),
    );
  }

  /** Wipe everything saved except the sound setting, and start over. */
  function resetProgress() {
    Object.assign(progress, freshProgress(), { muted: progress.muted });
    saveProgress(progress);
    startBoard(0);
  }

  function toggleMute() {
    progress.muted = !progress.muted;
    audio.setMuted(progress.muted);
    saveProgress(progress);
  }

  // ---- input ----------------------------------------------------------------

  function toBoard(e: PointerEvent | WheelEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - view.ox) / view.scale,
      y: (e.clientY - rect.top - view.oy) / view.scale,
    };
  }

  function aimAt(p: { x: number; y: number }) {
    // A Foresight shot can't be re-aimed.
    if (g.phase !== "aim" || g.locked) return;
    const angle = Math.atan2(p.x - LAUNCH_X, Math.max(1, p.y - LAUNCH_Y));
    g.angle = Math.max(-MAX_AIM, Math.min(MAX_AIM, angle));
  }

  function nudge(amount: number) {
    if (g.phase !== "aim" || g.locked) return;
    g.angle = Math.max(-MAX_AIM, Math.min(MAX_AIM, g.angle + amount));
  }

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" && !touchAiming) return;
    aimAt(toBoard(e));
  });

  canvas.addEventListener("pointerdown", (e) => {
    audio.unlockAudio();
    if (e.button !== 0) return;
    const p = toBoard(e);
    if (e.pointerType === "touch") {
      touchAiming = true;
      canvas.setPointerCapture(e.pointerId);
      aimAt(p);
    } else {
      aimAt(p);
      fire();
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch" || !touchAiming) return;
    touchAiming = false;
    // Letting go above the launcher cancels the shot.
    if (toBoard(e).y > LAUNCH_Y + 20) fire();
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("pointercancel", () => {
    touchAiming = false;
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      nudge(Math.sign(e.deltaY) * 0.004);
    },
    { passive: false },
  );

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") {
      overlay.escape();
      return;
    }
    if (overlay.open) return;
    const onButton = e.target instanceof HTMLButtonElement;
    const step = e.shiftKey ? 0.002 : 0.012;
    if (e.key === "ArrowLeft") nudge(-step);
    else if (e.key === "ArrowRight") nudge(step);
    else if ((e.key === " " || e.key === "Enter") && !onButton) {
      audio.unlockAudio();
      fire();
    } else if (e.key === "f" || e.key === "F") foresight();
    else if (e.key === "t" || e.key === "T") openTalents();
    else if (e.key === "m" || e.key === "M") toggleMute();
    else return;
    if (!onButton) e.preventDefault();
  });

  dom.foresight.addEventListener("click", () => {
    audio.unlockAudio();
    foresight();
  });
  $("pk-talents").addEventListener("click", () => openTalents());
  $("pk-boards").addEventListener("click", openBoards);
  dom.mute.addEventListener("click", toggleMute);

  // ---- sizing ---------------------------------------------------------------

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    view.dpr = dpr;
    view.width = canvas.width = Math.max(1, Math.round(rect.width * dpr));
    view.height = canvas.height = Math.max(1, Math.round(rect.height * dpr));
    view.scale = Math.min(rect.width / W, rect.height / H);
    view.ox = (rect.width - W * view.scale) / 2;
    view.oy = (rect.height - H * view.scale) / 2;
    // Messages sit in the clear band between the launcher and the pegs.
    dom.note.style.top = `${view.oy + 112 * view.scale}px`;
    dom.note.style.width = `${W * view.scale}px`;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  document.addEventListener("visibilitychange", () => {
    last = performance.now();
  });

  loadBoard(Math.min(progress.unlocked, BOARDS.length) - 1);
  requestAnimationFrame(frame);

  return g;
}
