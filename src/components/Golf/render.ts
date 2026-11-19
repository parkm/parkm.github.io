import { CUP_DEPTH, CUP_HALF, GREEN_HALF, VIEW_H, VIEW_W } from "./course";
import type { Game } from "./game";
import { BALL_R, MOVING } from "./physics";

/**
 * Sizes are in CSS pixels. `scale` and `oy` (the screen y of world y = 0)
 * follow the camera and change from frame to frame.
 */
export type View = {
  w: number;
  h: number;
  dpr: number;
  scale: number;
  oy: number;
};

const TAU = Math.PI * 2;
/** The camera's y sits this far down the screen. */
const FOCUS_AT = 0.62;
/** The camera's y when the whole height of the course is in view. */
const FOCUS_Y = 300;
/** The course never reaches above or below these. */
const WORLD_TOP = FOCUS_Y - FOCUS_AT * VIEW_H;
const WORLD_BOTTOM = WORLD_TOP + VIEW_H;
/** On a small screen the camera zooms in up to this scale. */
const CLOSE_SCALE = 1.3;
/** World units kept clear around the ball and the cup. */
const PAD_X = 70;
const PAD_Y = 230;

export type Camera = { x: number; y: number; scale: number };

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * Where the camera should be. A screen big enough to show the whole hole at a
 * readable size gets a fixed view of it. A smaller one gets a closer view that
 * keeps the ball and the cup in frame, so it tightens as the ball gets near.
 */
export function frameShot(g: Game, view: View): Camera {
  const { ball, hole } = g;
  const { cup } = hole;
  const fit = Math.min(view.w / VIEW_W, view.h / VIEW_H);
  const scale = clamp(
    Math.min(
      view.w / (Math.abs(cup.x - ball.x) + 2 * PAD_X),
      view.h / (Math.abs(cup.y - ball.y) + PAD_Y),
    ),
    fit,
    Math.max(fit, CLOSE_SCALE),
  );
  // Never look past the edges of the hole.
  const slack = Math.max(0, (VIEW_W - view.w / scale) / 2);
  const x = clamp((ball.x + cup.x) / 2, hole.camX - slack, hole.camX + slack);
  const tall = view.h / scale;
  const lo = WORLD_TOP + FOCUS_AT * tall;
  const hi = WORLD_BOTTOM - (1 - FOCUS_AT) * tall;
  const y = lo >= hi ? FOCUS_Y : clamp((ball.y + cup.y) / 2, lo, hi);
  return { x, y, scale };
}

export function pointView(view: View, camera: Camera) {
  view.scale = camera.scale;
  view.oy = view.h * FOCUS_AT - camera.y * camera.scale;
}

function drawBackdrop(ctx: CanvasRenderingContext2D, g: Game, view: View) {
  const { palette } = g;
  const sky = ctx.createLinearGradient(0, 0, 0, view.h);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(0.7, palette.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.w, view.h);

  ctx.fillStyle = palette.sun;
  ctx.beginPath();
  ctx.arc(
    view.w * 0.78,
    view.h * 0.17,
    Math.min(view.w, view.h) * 0.06,
    0,
    TAU,
  );
  ctx.fill();

  // A far ridge that drifts past more slowly than the course.
  ctx.fillStyle = palette.far;
  ctx.beginPath();
  ctx.moveTo(0, view.h);
  for (let sx = 0; sx <= view.w + 8; sx += 8) {
    const x = g.camX * 0.3 + (sx - view.w / 2) / view.scale;
    const y = 250 - 34 * Math.sin(x * 0.0041) - 18 * Math.sin(x * 0.0107 + 1.3);
    ctx.lineTo(sx, view.oy + y * view.scale);
  }
  ctx.lineTo(view.w, view.h);
  ctx.fill();
}

function drawGround(ctx: CanvasRenderingContext2D, g: Game, view: View) {
  const { hole, palette } = g;
  const { xs, ys } = hole;
  const floor = (view.h - view.oy) / view.scale + 10;

  ctx.fillStyle = palette.water;
  for (const pond of hole.ponds)
    ctx.fillRect(pond.x0 - 6, pond.y, pond.x1 - pond.x0 + 12, 80);

  ctx.beginPath();
  ctx.moveTo(xs[0], floor);
  for (let i = 0; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
  ctx.lineTo(xs[xs.length - 1], floor);
  ctx.fillStyle = palette.ground;
  ctx.fill();

  // A lighter band just under the surface. It is drawn below the outline so
  // the ball still sits exactly on top of what it collides with.
  ctx.save();
  ctx.translate(0, 2);
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = palette.edge;
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
  ctx.stroke();
  ctx.strokeStyle = palette.green;
  for (const pin of hole.pins) {
    const gap = pin === hole.cup && g.cupFill < 1 ? CUP_HALF : 0;
    ctx.beginPath();
    ctx.moveTo(pin.x - GREEN_HALF, pin.y);
    ctx.lineTo(pin.x - gap, pin.y);
    ctx.moveTo(pin.x + gap, pin.y);
    ctx.lineTo(pin.x + GREEN_HALF, pin.y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = palette.sand;
  for (const bunker of hole.bunkers) {
    const width = bunker.x1 - bunker.x0;
    const under: number[] = [];
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      const v = (xs[i] - bunker.x0) / width;
      if (v < 0 || v > 1) continue;
      ctx.lineTo(xs[i], ys[i]);
      under.push(xs[i], ys[i] + 9 * Math.sin(Math.PI * v) ** 0.6);
    }
    for (let i = under.length - 2; i >= 0; i -= 2)
      ctx.lineTo(under[i], under[i + 1]);
    ctx.fill();
  }
}

function drawCup(ctx: CanvasRenderingContext2D, g: Game) {
  const { cup } = g.hole;
  const { palette } = g;
  // After a hole is finished the cup fills in from the bottom.
  if (g.cupFill > 0) {
    ctx.fillStyle = palette.ground;
    ctx.fillRect(
      cup.x - CUP_HALF,
      cup.y + CUP_DEPTH * (1 - g.cupFill),
      CUP_HALF * 2,
      CUP_DEPTH * g.cupFill + 1,
    );
  }
  ctx.globalAlpha = 1 - g.cupFill;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cup.x, cup.y + CUP_DEPTH);
  ctx.lineTo(cup.x, cup.y - 54);
  ctx.stroke();
  ctx.fillStyle = palette.flag;
  ctx.beginPath();
  ctx.moveTo(cup.x, cup.y - 55);
  ctx.lineTo(cup.x + 22, cup.y - 47);
  ctx.lineTo(cup.x, cup.y - 39);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawTrail(ctx: CanvasRenderingContext2D, g: Game) {
  if (g.trail.length < 4 || g.trailAlpha <= 0) return;
  ctx.strokeStyle = g.palette.ink;
  ctx.globalAlpha = 0.16 * g.trailAlpha;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < g.trail.length; i += 2)
    ctx.lineTo(g.trail[i], g.trail[i + 1]);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawAim(ctx: CanvasRenderingContext2D, g: Game, view: View) {
  const { aim, ball } = g;
  if (g.phase !== "aim" || !aim) return;
  // Keeps the marks from getting too fine when the camera is far out.
  const thick = Math.max(1, 0.9 / view.scale);
  ctx.fillStyle = ctx.strokeStyle = g.palette.ink;

  // The pull: a band from the ball back along the drag.
  const pull = 14 + aim.power * 62;
  const hx = ball.x - aim.dx * pull;
  const hy = ball.y - aim.dy * pull;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2 * thick;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx, hy, 3.5 * thick, 0, TAU);
  ctx.fill();

  // The start of the flight.
  const path = g.preview;
  for (let i = 4; i < path.length; i += 4) {
    ctx.globalAlpha = 0.7 * (1 - i / (path.length + 4));
    ctx.beginPath();
    ctx.arc(path[i], path[i + 1], 2 * thick, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = "butt";
}

function drawBall(ctx: CanvasRenderingContext2D, g: Game) {
  const { ball } = g;
  if (g.phase === "lost") return;
  // White when a shot can be played, a shade greyer when it can't.
  const shade = Math.round(255 - 58 * g.dim);
  ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = g.palette.ink;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.stroke();
  // A mark that turns with the ball.
  ctx.fillStyle = g.palette.ink;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(
    ball.x + Math.cos(ball.angle) * BALL_R * 0.5,
    ball.y + Math.sin(ball.angle) * BALL_R * 0.5,
    BALL_R * 0.22,
    0,
    TAU,
  );
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawParticles(ctx: CanvasRenderingContext2D, g: Game) {
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Text and markers, drawn in CSS pixels so they stay readable on a phone. */
function drawOverlay(ctx: CanvasRenderingContext2D, g: Game, view: View) {
  const sx = (x: number) => (x - g.camX) * view.scale + view.w / 2;
  const sy = (y: number) => y * view.scale + view.oy;
  ctx.fillStyle = g.palette.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const p of g.popups) {
    ctx.globalAlpha = Math.min(1, p.life * 2.5);
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText(p.text, sx(p.x), sy(p.y));
  }

  if (g.hint && g.phase === "aim" && !g.aim) {
    ctx.globalAlpha = 0.7;
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillText(g.hint, view.w / 2, Math.max(70, view.h * 0.22));
  }

  // The ball has flown off the top of the screen.
  const by = sy(g.ball.y);
  if (g.ball.state === MOVING && by < -BALL_R * view.scale) {
    const x = Math.max(12, Math.min(view.w - 12, sx(g.ball.x)));
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x + 7, 17);
    ctx.lineTo(x - 7, 17);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function draw(ctx: CanvasRenderingContext2D, g: Game, view: View) {
  const { dpr, scale } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackdrop(ctx, g, view);

  const s = scale * dpr;
  ctx.setTransform(
    s,
    0,
    0,
    s,
    (view.w / 2 - g.camX * scale) * dpr,
    view.oy * dpr,
  );
  drawGround(ctx, g, view);
  drawCup(ctx, g);
  drawTrail(ctx, g);
  drawAim(ctx, g, view);
  drawBall(ctx, g);
  drawParticles(ctx, g);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOverlay(ctx, g, view);
}
