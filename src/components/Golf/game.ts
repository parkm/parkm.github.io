import * as audio from "./audio";
import { type Hole, ROUND, buildHole } from "./course";
import { type Palette, mixPalettes, paletteFor } from "./palette";
import {
  BALL_R,
  type Ball,
  type BallEvent,
  HOLED,
  MOVING,
  RESTING,
  SAND,
  STEP,
  launch,
  restingBall,
  stepBall,
  traceFlight,
} from "./physics";
import { type View, draw, frameShot, pointView } from "./render";

/**
 * aim: the ball is at rest, waiting for a shot. lost: the ball went in the
 * water or out of bounds. sunk, rise: the cup fills in and becomes the next tee.
 */
type Phase = "aim" | "flight" | "lost" | "sunk" | "rise";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};

type Popup = { x: number; y: number; text: string; life: number };

/** A unit direction and a power from 0 to 1. */
type Aim = { dx: number; dy: number; power: number };

export type Game = {
  hole: Hole;
  ball: Ball;
  phase: Phase;
  camX: number;
  palette: Palette;
  /** 0 while a shot can be played, 1 while it can't; eases between the two. */
  dim: number;
  /** 0 while the cup is open, 1 once it has filled in. */
  cupFill: number;
  aim: Aim | null;
  preview: number[];
  trail: number[];
  trailAlpha: number;
  particles: Particle[];
  popups: Popup[];
  hint: string;
  strokes: number;
  holeStrokes: number;
};

type Save = {
  hole: number;
  strokes: number;
  holeStrokes: number;
  muted: boolean;
};

const KEY = "golf:v1";
const PREVIEW_TICKS = 100;
const MIN_POWER = 0.03;
const LOST_TIME = 0.35;
const SUNK_TIME = 0.2;
const RISE_TIME = 0.25;
/** Seconds the scenery takes to change between rounds. */
const BLEND_TIME = 1.1;
/** Seconds the ball takes to brighten when control comes back. */
const UNDIM_TIME = 0.08;
/** How quickly the camera closes on its target, per second. */
const CAMERA_RATE = 7;

function loadSave(): Save {
  const fresh = { hole: 1, strokes: 0, holeStrokes: 0, muted: false };
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Save>;
    const count = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    return {
      hole: Math.max(1, count(data.hole)),
      strokes: count(data.strokes),
      holeStrokes: count(data.holeStrokes),
      muted: !!data.muted,
    };
  } catch {
    return fresh;
  }
}

const ease = (t: number) => t * t * (3 - 2 * t);

export function startGolf(root: HTMLElement) {
  const $ = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const canvas = $<HTMLCanvasElement>("gf-canvas");
  const ctx = canvas.getContext("2d")!;
  const dom = {
    hole: $("gf-hole"),
    strokes: $("gf-strokes"),
    mute: $<HTMLButtonElement>("gf-mute"),
    restart: $<HTMLButtonElement>("gf-restart"),
  };
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const save = loadSave();
  audio.setMuted(save.muted);

  const view: View = { w: 1, h: 1, dpr: 1, scale: 1, oy: 0 };
  const events: BallEvent[] = [];
  const firstHole = buildHole(save.hole);

  const g: Game = {
    hole: firstHole,
    ball: restingBall(firstHole.tee.x, firstHole.tee.y - BALL_R),
    phase: "aim",
    camX: firstHole.camX,
    palette: paletteFor(save.hole),
    dim: 0,
    cupFill: 0,
    aim: null,
    preview: [],
    trail: [],
    trailAlpha: 0,
    particles: [],
    popups: [],
    hint: save.strokes === 0 ? "Drag back from anywhere, then let go" : "",
    strokes: save.strokes,
    holeStrokes: save.holeStrokes,
  };

  /** Seconds spent in the current phase. */
  let phaseTime = 0;
  let acc = 0;
  /** Where the current shot was played from. */
  let origin = { x: g.ball.x, y: g.ball.y };
  let sunkAt = { x: 0, y: 0 };
  /** Jump the camera to its target instead of gliding there. */
  let snapCamera = true;
  const camera = { x: 0, y: 0, scale: 1 };
  let paletteFrom = g.palette;
  let blendTime = BLEND_TIME;
  /** A pull in progress: where it started and where the pointer is now. */
  let drag: {
    id: number;
    x: number;
    y: number;
    toX: number;
    toY: number;
  } | null = null;
  /** The last aim set from the keyboard: angle above the horizon, and power. */
  const keys = { angle: Math.PI / 4, power: 0.5 };
  let confirmTimer = 0;

  function setPhase(phase: Phase) {
    g.phase = phase;
    phaseTime = 0;
  }

  function persist() {
    save.hole = g.hole.n;
    save.strokes = g.strokes;
    save.holeStrokes = g.holeStrokes;
    try {
      localStorage.setItem(KEY, JSON.stringify(save));
    } catch {
      // Storage unavailable (private mode); the round lasts for this visit only.
    }
  }

  let shownPalette: Palette | null = null;
  function applyPalette() {
    if (g.palette === shownPalette) return;
    shownPalette = g.palette;
    root.style.setProperty("--gf-ink", g.palette.ink);
    themeMeta?.setAttribute("content", g.palette.skyTop);
  }

  // ---- shots ----------------------------------------------------------------

  function setAim(dx: number, dy: number, power: number) {
    g.aim = { dx, dy, power };
    g.preview = traceFlight(
      g.ball,
      g.hole.terrain,
      dx,
      dy,
      power,
      PREVIEW_TICKS,
    );
  }

  function clearAim() {
    g.aim = null;
    drag = null;
  }

  function fire() {
    const { aim } = g;
    if (g.phase !== "aim" || !aim) return;
    origin = { x: g.ball.x, y: g.ball.y };
    launch(g.ball, aim.dx, aim.dy, aim.power);
    g.strokes++;
    g.holeStrokes++;
    g.hint = "";
    g.trail = [g.ball.x, g.ball.y];
    g.trailAlpha = 1;
    acc = 0;
    clearAim();
    setPhase("flight");
    persist();
    audio.playSwing(aim.power);
  }

  function spray(
    x: number,
    y: number,
    count: number,
    color: string,
    speed: number,
  ) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI * (0.15 + Math.random() * 0.7);
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.25 + Math.random() * 0.35;
      g.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life,
        max: life,
        size: 1 + Math.random() * 1.4,
        color,
      });
    }
  }

  function handleEvents() {
    for (const e of events) {
      if (e.type === "bounce") {
        audio.playBounce(e.speed, e.mat);
        const sand = e.mat === SAND;
        if (e.speed > (sand ? 40 : 110))
          spray(
            e.x,
            e.y + BALL_R,
            sand ? 9 : 3,
            sand ? g.palette.sand : g.palette.edge,
            Math.min(160, e.speed * 0.4),
          );
      } else if (e.type === "splash") {
        audio.playSplash();
        spray(e.x, e.y, 14, g.palette.water, 190);
      } else if (e.type === "out") {
        audio.playOut();
      } else if (e.type === "holed") {
        audio.playSink(g.holeStrokes);
        g.popups.push({
          x: g.hole.cup.x,
          y: g.hole.cup.y - 76,
          text: g.holeStrokes === 1 ? "Hole in one" : String(g.holeStrokes),
          life: 1.6,
        });
      }
    }
    events.length = 0;
  }

  function nextHole() {
    const n = g.hole.n + 1;
    g.hole = buildHole(n);
    g.ball = restingBall(g.hole.tee.x, g.hole.tee.y - BALL_R);
    g.cupFill = 0;
    g.holeStrokes = 0;
    g.trail = [];
    paletteFrom = g.palette;
    blendTime = 0;
    if ((n - 1) % ROUND === 0)
      g.popups.push({
        x: g.hole.camX,
        y: 110,
        text: `Round ${(n - 1) / ROUND + 1}`,
        life: 2.6,
      });
    // The camera is still travelling, but the next shot can be played already.
    setPhase("aim");
    persist();
  }

  function restart() {
    g.hole = buildHole(1);
    g.ball = restingBall(g.hole.tee.x, g.hole.tee.y - BALL_R);
    snapCamera = true;
    g.palette = paletteFor(1);
    g.cupFill = 0;
    g.strokes = g.holeStrokes = 0;
    g.trail = [];
    g.particles = [];
    g.popups = [];
    g.hint = "Drag back from anywhere, then let go";
    clearAim();
    setPhase("aim");
    persist();
  }

  // ---- frame ----------------------------------------------------------------

  function update(dt: number) {
    phaseTime += dt;
    for (const p of g.particles) {
      p.life -= dt;
      p.vy += 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
    for (const p of g.popups) {
      p.life -= dt;
      p.y -= 12 * dt;
    }
    g.popups = g.popups.filter((p) => p.life > 0);
    if (g.phase !== "flight")
      g.trailAlpha = Math.max(0, g.trailAlpha - dt * 1.2);

    if (blendTime < BLEND_TIME) {
      blendTime += dt;
      g.palette = mixPalettes(
        paletteFrom,
        paletteFor(g.hole.n),
        Math.min(1, blendTime / BLEND_TIME),
      );
    }

    const { ball } = g;
    if (g.phase === "flight") {
      acc += dt;
      while (acc >= STEP && ball.state === MOVING) {
        acc -= STEP;
        stepBall(ball, g.hole.terrain, events);
      }
      handleEvents();
      if (g.trail.length < 1600) g.trail.push(ball.x, ball.y);
      if (ball.state === RESTING) setPhase("aim");
      else if (ball.state === HOLED) {
        sunkAt = { x: ball.x, y: ball.y };
        setPhase("sunk");
      } else if (ball.state !== MOVING) setPhase("lost");
    } else if (g.phase === "lost") {
      // The stroke counts, and the ball goes back to where it was hit from.
      if (phaseTime >= LOST_TIME) {
        g.ball = restingBall(origin.x, origin.y);
        setPhase("aim");
      }
    } else if (g.phase === "sunk") {
      if (phaseTime >= SUNK_TIME) setPhase("rise");
    } else if (g.phase === "rise") {
      // The cup fills in and lifts the ball to the surface: the next tee.
      const k = Math.min(1, phaseTime / RISE_TIME);
      const { cup } = g.hole;
      g.cupFill = k;
      ball.x = sunkAt.x + (cup.x - sunkAt.x) * ease(k);
      ball.y = sunkAt.y + (cup.y - BALL_R - sunkAt.y) * ease(k);
      if (k >= 1) nextHole();
    }
    if (g.phase === "aim" && drag) pullAim();
    // Dims the instant a shot is played, then fades back once it's over.
    g.dim = g.phase === "aim" ? Math.max(0, g.dim - dt / UNDIM_TIME) : 1;
  }

  function moveCamera(dt: number) {
    // Hold still while the ball is out of play or the cup is filling in.
    const held = g.phase === "lost" || g.phase === "sunk" || g.phase === "rise";
    if (!held || snapCamera) {
      const to = frameShot(g, view);
      const k = snapCamera ? 1 : 1 - Math.exp(-dt * CAMERA_RATE);
      camera.x += (to.x - camera.x) * k;
      camera.y += (to.y - camera.y) * k;
      camera.scale += (to.scale - camera.scale) * k;
      snapCamera = false;
    }
    g.camX = camera.x;
    pointView(view, camera);
  }

  let shown = "";
  function updateHud() {
    const key = [g.hole.n, g.strokes, save.muted].join();
    if (key === shown) return;
    shown = key;
    dom.hole.textContent = `Hole ${g.hole.n.toLocaleString()}`;
    dom.strokes.textContent =
      g.strokes === 1 ? "1 stroke" : `${g.strokes.toLocaleString()} strokes`;
    dom.mute.textContent = save.muted ? "Sound off" : "Sound on";
    dom.mute.setAttribute("aria-pressed", String(!save.muted));
  }

  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    moveCamera(dt);
    updateHud();
    applyPalette();
    draw(ctx, g, view);
    requestAnimationFrame(frame);
  }

  // ---- input ----------------------------------------------------------------

  /** Pulling this far, in CSS pixels, is full power. */
  const fullPull = () =>
    Math.max(90, Math.min(180, Math.min(view.w, view.h) * 0.35));

  /**
   * Aim from the pull. A pull can start while the ball is still moving; it
   * only becomes an aim once the ball is at rest.
   */
  function pullAim() {
    if (!drag) return;
    // The shot goes the opposite way to the pull.
    const px = drag.x - drag.toX;
    const py = drag.y - drag.toY;
    const pull = Math.hypot(px, py);
    if (g.phase !== "aim" || pull < 8) {
      g.aim = null;
      return;
    }
    const power = Math.max(MIN_POWER, Math.min(1, pull / fullPull()));
    setAim(px / pull, py / pull, power);
  }

  canvas.addEventListener("pointerdown", (e) => {
    audio.unlockAudio();
    if (e.button !== 0 || drag) return;
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      toX: e.clientX,
      toY: e.clientY,
    };
    g.aim = null;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (drag?.id !== e.pointerId) return;
    drag.toX = e.clientX;
    drag.toY = e.clientY;
    pullAim();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (drag?.id !== e.pointerId) return;
    drag.toX = e.clientX;
    drag.toY = e.clientY;
    pullAim();
    // Letting go without pulling cancels.
    if (g.aim) fire();
    else clearAim();
  });

  canvas.addEventListener("pointercancel", (e) => {
    if (drag?.id === e.pointerId) clearAim();
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  function keyAim(turn: number, power: number) {
    if (g.phase !== "aim" || drag) return;
    keys.angle = Math.max(0, Math.min(Math.PI, keys.angle + turn));
    keys.power = Math.max(MIN_POWER, Math.min(1, keys.power + power));
    setAim(Math.cos(keys.angle), -Math.sin(keys.angle), keys.power);
  }

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const onButton = e.target instanceof HTMLButtonElement;
    const fine = e.shiftKey ? 0.25 : 1;
    if (e.key === "ArrowLeft") keyAim(0.03 * fine, 0);
    else if (e.key === "ArrowRight") keyAim(-0.03 * fine, 0);
    else if (e.key === "ArrowUp") keyAim(0, 0.02 * fine);
    else if (e.key === "ArrowDown") keyAim(0, -0.02 * fine);
    else if ((e.key === " " || e.key === "Enter") && !onButton) {
      audio.unlockAudio();
      if (g.aim && !drag) fire();
      else keyAim(0, 0);
    } else if (e.key === "Escape") clearAim();
    else if (e.key === "m" || e.key === "M") toggleMute();
    else return;
    if (!onButton) e.preventDefault();
  });

  function toggleMute() {
    save.muted = !save.muted;
    audio.setMuted(save.muted);
    persist();
  }

  dom.mute.addEventListener("click", () => {
    audio.unlockAudio();
    toggleMute();
  });

  // Restart asks once before throwing the round away.
  function disarmRestart() {
    window.clearTimeout(confirmTimer);
    confirmTimer = 0;
    dom.restart.textContent = "Restart";
  }
  dom.restart.addEventListener("click", () => {
    if (confirmTimer) {
      disarmRestart();
      restart();
    } else {
      dom.restart.textContent = "Restart from hole 1?";
      confirmTimer = window.setTimeout(disarmRestart, 3000);
    }
  });

  // ---- sizing ---------------------------------------------------------------

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    view.w = Math.max(1, rect.width);
    view.h = Math.max(1, rect.height);
    view.dpr = dpr;
    snapCamera = true;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  document.addEventListener("visibilitychange", () => {
    last = performance.now();
  });

  applyPalette();
  requestAnimationFrame(frame);

  return g;
}
