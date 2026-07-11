// The gem-matching game. The core loop is: steer your color, matching gems
// ignite, swipe to collect. Collecting builds a COMBO whose multiplier drives
// score, a growing collection radius, milestone shockwaves, and the background
// energy — so all the "cool effects" are earned by collecting, not managed.

import { engine, addRipple, onFrame, lockHue } from "./waves";
import { hueDiff, signedHueDelta, hslCss, hslCssA } from "./utils";
import { loadProgress } from "./progress";

const MATCH_TOLERANCE = 40; // degrees — generous so matching is forgiving
const RESONANCE_RANGE = 45; // degrees beyond match where gems start to stir

// Tutorial: single-color guided rounds that teach steer + swipe.
const TUTORIAL_ROUNDS = 3;
const TUTORIAL_GEMS = 6;

// Real game: lots of mixed-color gems on screen at once.
const GAME_COLORS = 6; // distinct hues mixed together
const GAME_GEM_COUNT = 70; // starting gem count — grows each wave
const GAME_GEM_MAX = 150;

// Combo / flow tuning.
const COMBO_WINDOW = 2.0; // seconds of idle before the combo drops
const COMBO_PER_TIER = 8; // gems per multiplier tier
const MAX_TIER = 7; // multiplier caps at ×8
const POINTS_PER_GEM = 10;
const SHOCK_EVERY = 15; // every N combo fires a shockwave
const SHOCK_RADIUS = 220; // px auto-collect radius of a shockwave

// When you steer a cluster this big into match, briefly hold the hue so the
// BOOM lands and the weight registers before the color can switch away.
const MATCH_LOCK_MIN_GEMS = 5;
const MATCH_LOCK_TIME = 0.3; // seconds — a brief beat, ~the length of the flash

interface Gem {
  x: number;
  y: number;
  hue: number;
  size: number;
  phase: number;
  collected: boolean;
  collectedAt: number;
  wasMatched: boolean; // was it in match range last frame (for the BOOM flash)
  matchedAt: number; // engine.time it last snapped into match
}

interface Shockwave {
  x: number;
  y: number;
  start: number;
}

let gemCanvas: HTMLCanvasElement;
let gemCtx: CanvasRenderingContext2D;
let phaseLabel: HTMLElement;
let scoreValue: HTMLElement;
let bestValue: HTMLElement;
let comboWrap: HTMLElement;
let comboMult: HTMLElement;
let comboCount: HTMLElement;
let comboBar: HTMLElement;
let targetSwatch: HTMLElement;
let matchBar: HTMLElement;
let gameStatus: HTMLElement;

let gamePhase: "tutorial" | "game" = "tutorial";
let roundsDone = 0;
let waveNumber = 0;
let targetHue = 0; // the current tutorial round's color
let tutorialDone = false;
let gems: Gem[] = [];
let roundClearing = false;
let matchedLast = 0; // uncollected gems in match range last frame (for the lock's rising edge)

let score = 0;
let best = 0;
let combo = 0;
let comboExpire = 0;
let shockwaves: Shockwave[] = [];

let pointerX = -1; // last finger/cursor position (for the collection ring)
let pointerY = -1;

// ---- combo helpers ----

function currentTier(): number {
  return Math.min(MAX_TIER, Math.floor(combo / COMBO_PER_TIER));
}
function multiplier(): number {
  return currentTier() + 1;
}
// Collection radius grows with the combo tier — 0 means single-nearest mode.
function collectRadius(): number {
  const tier = currentTier();
  return tier <= 0 ? 0 : 46 + tier * 22;
}
function tierHue(tier: number): number {
  return (48 - tier * 10 + 360) % 360; // gold -> orange -> pink as it climbs
}

function updateScore(): void {
  scoreValue.textContent = `${score}`;
  if (score > best) {
    best = score;
    bestValue.textContent = `Best ${best}`;
  }
}

// ---- setup helpers ----

function sizeGemCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  gemCanvas.width = window.innerWidth * dpr;
  gemCanvas.height = window.innerHeight * dpr;
  gemCanvas.style.width = `${window.innerWidth}px`;
  gemCanvas.style.height = `${window.innerHeight}px`;
}

function spawnGem(hue: number, minSize: number, maxSize: number): Gem {
  const margin = 55;
  const topSafe = 210;
  const x = margin + Math.random() * (window.innerWidth - margin * 2);
  const y = topSafe + Math.random() * (window.innerHeight - topSafe - 70);
  return {
    x,
    y,
    hue,
    size: minSize + Math.random() * (maxSize - minSize),
    phase: Math.random() * 10,
    collected: false,
    collectedAt: 0,
    wasMatched: false,
    matchedAt: -1,
  };
}

// ---- collection ----

function removeGem(g: Gem): void {
  g.collected = true;
  g.collectedAt = engine.time;
  addRipple(g.x, g.y);
}

// A gem collected by the player's swipe: extends the combo and may fire a
// milestone shockwave.
function grabManual(g: Gem): void {
  removeGem(g);
  combo++;
  comboExpire = engine.time + COMBO_WINDOW;
  score += POINTS_PER_GEM * multiplier();
  updateScore();
  if (combo % SHOCK_EVERY === 0) fireShockwave(g.x, g.y);
}

// A gem swept up by a shockwave: scores at the current multiplier but does not
// extend the combo (so shockwaves can't chain into themselves).
function grabBonus(g: Gem): void {
  removeGem(g);
  score += POINTS_PER_GEM * multiplier();
  updateScore();
}

function fireShockwave(x: number, y: number): void {
  shockwaves.push({ x, y, start: engine.time });
  for (const g of gems) {
    if (g.collected) continue;
    if (hueDiff(engine.baseHue, g.hue) > MATCH_TOLERANCE) continue;
    if (Math.hypot(x - g.x, y - g.y) < SHOCK_RADIUS) grabBonus(g);
  }
  addRipple(x, y);
}

// ---- rounds / waves ----

function startTutorialRound(): void {
  gamePhase = "tutorial";
  let h = 0;
  do {
    h = Math.floor(Math.random() * 360);
  } while (hueDiff(h, engine.baseHue) < 70);
  targetHue = h;
  gems = [];
  for (let i = 0; i < TUTORIAL_GEMS; i++) gems.push(spawnGem(h, 30, 40));
}

function startGameWave(): void {
  gamePhase = "game";
  waveNumber++;
  gems = [];
  const count = Math.min(GAME_GEM_COUNT + (waveNumber - 1) * 20, GAME_GEM_MAX);
  const offset = Math.random() * 360;
  const hues: number[] = [];
  for (let i = 0; i < GAME_COLORS; i++) {
    hues.push((offset + (360 / GAME_COLORS) * i) % 360);
  }
  for (let i = 0; i < count; i++) {
    const h = hues[Math.floor(Math.random() * hues.length)];
    gems.push(spawnGem(h, 16, 26));
  }
  game.onChange?.();
}

// Boards refill seamlessly so flow (and combo) carries across waves.
function finishRound(): void {
  if (gamePhase === "tutorial") {
    roundsDone++;
    if (roundsDone < TUTORIAL_ROUNDS) {
      startTutorialRound();
    } else {
      tutorialDone = true;
      startGameWave();
    }
  } else {
    startGameWave();
  }
}

function checkCleared(): void {
  if (!roundClearing && gems.length > 0 && gems.every((g) => g.collected)) {
    roundClearing = true;
    setTimeout(() => {
      roundClearing = false;
      finishRound();
    }, 250);
  }
}

// Which hue the guidance should point at: the tutorial color, or in the real
// game the uncollected color closest to your current hue.
function activeTargetHue(): number | null {
  if (gamePhase === "tutorial") return targetHue;
  let bestHue: number | null = null;
  let bestD = Infinity;
  for (const g of gems) {
    if (g.collected) continue;
    const d = hueDiff(engine.baseHue, g.hue);
    if (d < bestD) {
      bestD = d;
      bestHue = g.hue;
    }
  }
  return bestHue;
}

// ---- rendering ----

// Twinkling 4-point star glint.
function sparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  const inner = r * 0.3;
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : inner;
    const px = Math.cos(ang) * rad;
    const py = Math.sin(ang) * rad;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  hue: number,
  matched: boolean,
  resonance: number,
  flash: number,
  t: number,
  collectProgress: number,
): void {
  // Activation blends the dormant look up to full matched brilliance. Resonance
  // tops out below 1 so actually crossing into a match still visibly POPs.
  const e = matched ? 1 : resonance * 0.75;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

  const pts: [number, number][] = [
    [0, -s],
    [s * 0.72, -s * 0.32],
    [s * 0.5, s * 0.35],
    [0, s],
    [-s * 0.5, s * 0.35],
    [-s * 0.72, -s * 0.32],
  ];
  const tracePath = () => {
    ctx.beginPath();
    pts.forEach((p, i) =>
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
    );
    ctx.closePath();
  };

  // Matched gems bob gently; resonating ones tremble faster the closer you get.
  let dx = 0;
  let dy = 0;
  if (matched) {
    dy = Math.sin(t * 2) * 3;
  } else if (resonance > 0) {
    const amp = resonance * 1.2;
    dx = Math.sin(t * 22) * amp * 0.6;
    dy = Math.cos(t * 19) * amp;
  }

  ctx.save();
  ctx.translate(cx + dx, cy + dy);
  const pulse = matched
    ? 1 + Math.sin(t * 4) * 0.07
    : 1 + resonance * 0.05 * Math.sin(t * 11);
  const scale = pulse * (1 + collectProgress * 0.9) * (1 + flash * 0.28);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 1 - collectProgress;

  // radiant aura, scaling from nothing (dormant) up to full (matched)
  if (e > 0.02) {
    const glow = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 2.4);
    glow.addColorStop(0, hslCssA(hue, 95, 62, 0.55 * e));
    glow.addColorStop(0.5, hslCssA(hue, 90, 58, 0.22 * e));
    glow.addColorStop(1, hslCssA(hue, 90, 58, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(-s * 2.4, -s * 2.4, s * 4.8, s * 4.8);
  }

  // body
  if (e > 0.02) {
    ctx.shadowColor = hslCss(hue, 95, 62);
    ctx.shadowBlur = (26 + Math.sin(t * 4) * 10) * e;
  }
  tracePath();
  ctx.fillStyle = hslCss(hue, lerp(26, 85, e), lerp(34, 52, e));
  ctx.fill();
  ctx.shadowBlur = 0;

  // facets radiating from an off-center culet
  const center: [number, number] = [0, -s * 0.05];
  const shades = [70, 52, 40, 48, 34, 60];
  const facetSat = lerp(30, 88, e);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    ctx.beginPath();
    ctx.moveTo(center[0], center[1]);
    ctx.lineTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.closePath();
    const shimmer = Math.sin(t * 3 + i * 1.1) * 9 * e;
    const light = lerp(shades[i] - 16, shades[i], e) + shimmer;
    ctx.fillStyle = hslCss(hue, facetSat, Math.max(16, Math.min(85, light)));
    ctx.fill();
  }

  // bright top table facet
  ctx.beginPath();
  ctx.moveTo(-s * 0.72, -s * 0.32);
  ctx.lineTo(0, -s);
  ctx.lineTo(s * 0.72, -s * 0.32);
  ctx.lineTo(center[0], center[1]);
  ctx.closePath();
  ctx.fillStyle = hslCss(hue, lerp(32, 92, e), lerp(50, 78, e));
  ctx.fill();

  // travelling specular glint — matched only, the signature "on" look
  if (matched) {
    ctx.save();
    tracePath();
    ctx.clip();
    const sweep = (t * 0.5) % 1.6;
    const gx = -s * 1.3 + sweep * s * 1.6;
    const g = ctx.createLinearGradient(gx - s * 0.5, -s, gx + s * 0.5, s);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-s * 1.3, -s * 1.3, s * 2.6, s * 2.6);
    ctx.restore();
  }

  // rim
  tracePath();
  const rimA = lerp(0.18, 0.6, e) + (matched ? Math.sin(t * 4) * 0.15 : 0);
  ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, rimA)})`;
  ctx.lineWidth = lerp(1.5, 2, e);
  ctx.stroke();

  // sparkles fade in as a gem nears/reaches match; a plain dot otherwise
  if (e > 0.35) {
    const sa = (e - 0.35) / 0.65;
    const tw = 0.6 + 0.4 * Math.sin(t * 5);
    sparkle(ctx, -s * 0.24, -s * 0.5, s * 0.34 * tw, 0.95 * sa);
    sparkle(
      ctx,
      s * 0.32,
      -s * 0.1,
      s * 0.18 * (0.6 + 0.4 * Math.sin(t * 5 + 2)),
      0.8 * sa,
    );
    sparkle(
      ctx,
      s * 0.05,
      s * 0.4,
      s * 0.14 * (0.6 + 0.4 * Math.sin(t * 6 + 1)),
      0.7 * sa,
    );
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.arc(-s * 0.22, -s * 0.48, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  // the BOOM — a bright burst the instant a gem locks into match
  if (flash > 0) {
    tracePath();
    ctx.fillStyle = `rgba(255,255,255,${0.55 * flash})`;
    ctx.fill();
    ctx.strokeStyle = hslCssA(hue, 95, 82, flash * 0.85);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, s * (1 + (1 - flash) * 1.9), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// Glowing edge + chevrons in the target color, pointing the way to steer.
function drawDirectionHint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const tgt = activeTargetHue();
  if (tgt === null) return;
  const signed = signedHueDelta(engine.baseHue, tgt);
  const diff = Math.abs(signed);
  if (diff <= MATCH_TOLERANCE) return;

  const dir = signed > 0 ? 1 : -1;
  const intensity = Math.min(1, (diff - MATCH_TOLERANCE) / 140);
  const bandW = w * 0.3;

  const grad =
    dir > 0
      ? ctx.createLinearGradient(w - bandW, 0, w, 0)
      : ctx.createLinearGradient(bandW, 0, 0, 0);
  grad.addColorStop(0, hslCssA(tgt, 85, 55, 0));
  grad.addColorStop(1, hslCssA(tgt, 85, 55, 0.18 + intensity * 0.32));
  ctx.fillStyle = grad;
  ctx.fillRect(dir > 0 ? w - bandW : 0, 0, bandW, h);

  const cy = h / 2;
  const edgeX = dir > 0 ? w - 44 : 44;
  const size = 26;
  for (let i = 0; i < 3; i++) {
    const t = (engine.time * 0.8 + i * 0.34) % 1;
    const x = edgeX + dir * (t * 44 - 22);
    const a = (0.35 + intensity * 0.5) * (1 - Math.abs(t - 0.5) * 1.4);
    if (a <= 0) continue;
    ctx.strokeStyle = hslCssA(tgt, 92, 66, a);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x - dir * size * 0.5, cy - size * 0.6);
    ctx.lineTo(x + dir * size * 0.5, cy);
    ctx.lineTo(x - dir * size * 0.5, cy + size * 0.6);
    ctx.stroke();
  }
}

// The current collection reach — a soft ring at the finger, visible once the
// combo has grown the radius past single-gem mode.
function drawCollectRing(ctx: CanvasRenderingContext2D): void {
  const r0 = collectRadius();
  if (r0 <= 0 || pointerX < 0) return;
  const hue = engine.baseHue;
  const r = r0 * (1 + Math.sin(engine.time * 6) * 0.03);

  ctx.save();
  ctx.translate(pointerX, pointerY);

  const grad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
  grad.addColorStop(0, hslCssA(hue, 90, 65, 0.05));
  grad.addColorStop(0.75, hslCssA(hue, 90, 60, 0.12));
  grad.addColorStop(1, hslCssA(hue, 90, 60, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = hslCssA(hue, 95, 72, 0.7);
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 7]);
  ctx.lineDashOffset = -engine.time * 30;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Expanding milestone shockwaves.
function drawShockwaves(ctx: CanvasRenderingContext2D): void {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    const age = engine.time - sw.start;
    if (age > 0.6) {
      shockwaves.splice(i, 1);
      continue;
    }
    const p = age / 0.6;
    const r = SHOCK_RADIUS * p;
    const alpha = (1 - p) * 0.85;
    const hue = engine.baseHue;

    ctx.save();
    ctx.translate(sw.x, sw.y);
    const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r);
    glow.addColorStop(0, hslCssA(hue, 95, 70, 0));
    glow.addColorStop(0.8, hslCssA(hue, 95, 70, alpha * 0.25));
    glow.addColorStop(1, hslCssA(hue, 95, 70, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hslCssA(hue, 95, 75, alpha);
    ctx.lineWidth = 6 * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawGems(): void {
  const dpr = window.devicePixelRatio || 1;
  gemCtx.setTransform(1, 0, 0, 1, 0, 0);
  gemCtx.clearRect(0, 0, gemCanvas.width, gemCanvas.height);
  gemCtx.scale(dpr, dpr);

  drawDirectionHint(gemCtx, window.innerWidth, window.innerHeight);

  let matchedNow = 0;
  for (const g of gems) {
    const diff = hueDiff(engine.baseHue, g.hue);
    const matched = !g.collected && diff <= MATCH_TOLERANCE;
    if (matched) matchedNow++;

    // Stamp the moment it snaps into match (with a little debounce so hovering
    // the boundary doesn't re-trigger the burst every frame).
    if (matched && !g.wasMatched && engine.time - g.matchedAt > 0.5) {
      g.matchedAt = engine.time;
    }
    g.wasMatched = matched;

    // Resonance ramps up as your color approaches the gem's hue.
    const resonance = matched
      ? 0
      : Math.max(
          0,
          Math.min(1, 1 - (diff - MATCH_TOLERANCE) / RESONANCE_RANGE),
        );
    const flash =
      g.matchedAt >= 0
        ? Math.max(0, 1 - (engine.time - g.matchedAt) / 0.35)
        : 0;

    let cp = 0;
    if (g.collected) cp = Math.min(1, (engine.time - g.collectedAt) / 0.45);

    drawGem(
      gemCtx,
      g.x,
      g.y,
      g.size,
      g.hue,
      matched,
      resonance,
      flash,
      engine.time + g.phase,
      cp,
    );
  }

  drawCollectRing(gemCtx);
  drawShockwaves(gemCtx);

  // Only in the real game, and only on the rising edge into a fair-sized cluster
  // (collecting shrinks the count, so it can't re-trigger the lock).
  if (
    gamePhase === "game" &&
    matchedNow >= MATCH_LOCK_MIN_GEMS &&
    matchedLast < MATCH_LOCK_MIN_GEMS
  ) {
    lockHue(MATCH_LOCK_TIME);
  }
  matchedLast = matchedNow;

  gems = gems.filter(
    (g) => !(g.collected && engine.time - g.collectedAt > 0.5),
  );
}

function updateCombo(): void {
  if (!game.paused && combo > 0 && engine.time > comboExpire) combo = 0;

  if (combo > 0) {
    const tier = currentTier();
    const hue = tierHue(tier);
    comboWrap.style.opacity = "1";
    comboMult.textContent = `×${tier + 1}`;
    comboMult.style.color = hslCss(hue, 95, 66);
    comboCount.textContent = `${combo} combo`;
    const frac = Math.max(
      0,
      Math.min(1, (comboExpire - engine.time) / COMBO_WINDOW),
    );
    comboBar.style.width = `${frac * 100}%`;
    comboBar.style.backgroundColor = hslCss(hue, 92, 60);
  } else {
    comboWrap.style.opacity = "0";
  }
}

function updateGameHud(): void {
  phaseLabel.textContent =
    gamePhase === "tutorial"
      ? `Tutorial ${Math.min(roundsDone + 1, TUTORIAL_ROUNDS)}/${TUTORIAL_ROUNDS}`
      : `Wave ${waveNumber}`;

  const tgt = activeTargetHue();
  if (tgt === null) {
    matchBar.style.width = "0%";
    gameStatus.textContent = "";
    return;
  }

  targetSwatch.style.backgroundColor = hslCss(tgt, 80, 55);
  targetSwatch.style.boxShadow = `0 0 16px ${hslCss(tgt, 90, 60)}`;

  const signed = signedHueDelta(engine.baseHue, tgt);
  const diff = Math.abs(signed);
  const matched = diff <= MATCH_TOLERANCE;
  const proximity = Math.max(0, Math.min(1, 1 - diff / 120));
  matchBar.style.width = `${proximity * 100}%`;
  matchBar.style.backgroundColor = matched
    ? hslCss(tgt, 85, 55)
    : "rgba(255,255,255,0.5)";

  if (matched) {
    gameStatus.textContent = "Swipe the glowing gems!";
  } else {
    gameStatus.textContent =
      signed > 0 ? "Two-finger drag  →" : "←  Two-finger drag";
  }
}

// Public game controller.
export const game = {
  active: false,
  paused: false, // true while the Esc menu is open
  onChange: null as null | (() => void),

  getSnapshot(): {
    tutorialDone: boolean;
    wave: number;
    score: number;
    best: number;
  } {
    return {
      tutorialDone,
      wave: waveNumber,
      score,
      best: Math.max(best, score),
    };
  },

  setPointer(x: number, y: number): void {
    pointerX = x;
    pointerY = y;
  },

  init(): void {
    gemCanvas = document.getElementById("gemCanvas") as HTMLCanvasElement;
    gemCtx = gemCanvas.getContext("2d") as CanvasRenderingContext2D;
    phaseLabel = document.getElementById("phaseLabel") as HTMLElement;
    scoreValue = document.getElementById("scoreValue") as HTMLElement;
    bestValue = document.getElementById("bestValue") as HTMLElement;
    comboWrap = document.getElementById("comboWrap") as HTMLElement;
    comboMult = document.getElementById("comboMult") as HTMLElement;
    comboCount = document.getElementById("comboCount") as HTMLElement;
    comboBar = document.getElementById("comboBar") as HTMLElement;
    targetSwatch = document.getElementById("targetSwatch") as HTMLElement;
    matchBar = document.getElementById("matchBar") as HTMLElement;
    gameStatus = document.getElementById("gameStatus") as HTMLElement;

    sizeGemCanvas();
    window.addEventListener("resize", sizeGemCanvas);
    onFrame(() => {
      // Background energy ramps with the combo tier and eases back down.
      const target = this.active ? currentTier() / MAX_TIER : 0;
      engine.energy += (target - engine.energy) * 0.05;
      if (this.active) {
        updateCombo();
        drawGems();
        updateGameHud();
      }
    });
  },

  start(): void {
    this.active = true;
    this.paused = false;
    combo = 0;
    comboExpire = 0;
    shockwaves = [];
    matchedLast = 0;
    const saved = loadProgress();
    best = saved?.best ?? 0;
    if (saved && saved.tutorialDone) {
      tutorialDone = true;
      score = saved.score ?? 0;
      waveNumber = Math.max(0, (saved.wave ?? 1) - 1);
      startGameWave();
    } else {
      tutorialDone = false;
      score = 0;
      roundsDone = 0;
      waveNumber = 0;
      gamePhase = "tutorial";
      startTutorialRound();
    }
    updateScore();
    bestValue.textContent = `Best ${best}`;
    this.onChange?.();
  },

  stop(): void {
    this.active = false;
    this.paused = false;
    combo = 0;
    shockwaves = [];
    gems = [];
    matchedLast = 0;
    engine.hueLockUntil = 0;
    gemCtx.setTransform(1, 0, 0, 1, 0, 0);
    gemCtx.clearRect(0, 0, gemCanvas.width, gemCanvas.height);
  },

  // Collect at a screen point. Low combo = precise single-gem pickup; as the
  // combo grows the reach widens into an area sweep.
  collectAt(px: number, py: number): void {
    if (!this.active || this.paused || roundClearing) return;

    const r = collectRadius();
    let any = false;

    if (r > 0) {
      for (const g of gems) {
        if (g.collected) continue;
        if (hueDiff(engine.baseHue, g.hue) > MATCH_TOLERANCE) continue;
        if (Math.hypot(px - g.x, py - g.y) < r) {
          grabManual(g);
          any = true;
        }
      }
    } else {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < gems.length; i++) {
        const g = gems[i];
        if (g.collected) continue;
        if (hueDiff(engine.baseHue, g.hue) > MATCH_TOLERANCE) continue;
        const d = Math.hypot(px - g.x, py - g.y);
        if (d < g.size * 2.1 && d < bestDist) {
          bestIdx = i;
          bestDist = d;
        }
      }
      if (bestIdx >= 0) {
        grabManual(gems[bestIdx]);
        any = true;
      }
    }

    if (any) {
      this.onChange?.();
      checkCleared();
    }
  },
};
