export type Vec2 = { x: number; y: number };

// Height of the complex plane visible at zoom 1.
export const VIEW_SPAN = 3.5;
export const MIN_ZOOM = 0.1;

// The center is kept in fixed point (value × 2^bits) so it has as many digits
// as the zoom calls for; a float runs out at around 1e15×. The zoom is kept as
// a log for the same reason.
export type View = {
  re: bigint;
  im: bigint;
  bits: number;
  logZoom: number;
};

// Fractional bits kept beyond what a single pixel needs.
const GUARD_BITS = 96;

function shift(value: bigint, by: number): bigint {
  return by >= 0 ? value << BigInt(by) : value >> BigInt(-by);
}

function toFixed(value: number, bits: number): bigint {
  return shift(BigInt(Math.round(value * 2 ** 52)), bits - 52);
}

// The leading 60 bits' worth of value × 2^-bits, as a float.
function toNumber(value: bigint, bits: number): number {
  return Number(shift(value, 60 - bits)) / 2 ** 60;
}

export const DEFAULT_VIEW: View = {
  re: toFixed(-0.745, 128),
  im: toFixed(0.186, 128),
  bits: 128,
  logZoom: 0,
};

// The height of the view as mantissa × 2^exponent, mantissa in [1, 2). At
// depth it is far too small for a float to hold in one piece.
export function viewScale(view: View): { mantissa: number; exponent: number } {
  const log2 = Math.log2(VIEW_SPAN) - view.logZoom / Math.LN2;
  const exponent = Math.floor(log2);
  return { mantissa: 2 ** (log2 - exponent), exponent };
}

function withPrecision(view: View): View {
  const needed = Math.ceil((GUARD_BITS - viewScale(view).exponent) / 64) * 64;
  if (needed <= view.bits) return view;
  const extra = needed - view.bits;
  return {
    ...view,
    re: shift(view.re, extra),
    im: shift(view.im, extra),
    bits: needed,
  };
}

// Screen offsets are in view heights, with y pointing up.
export function panBy(view: View, delta: Vec2): View {
  const { mantissa, exponent } = viewScale(view);
  const toPlane = (d: number) =>
    shift(
      BigInt(Math.round(d * mantissa * 2 ** 52)),
      view.bits + exponent - 52,
    );
  return {
    ...view,
    re: view.re + toPlane(delta.x),
    im: view.im + toPlane(delta.y),
  };
}

// Zooms by e^logFactor, keeping the point at `focus` on screen where it is.
export function zoomBy(view: View, logFactor: number, focus: Vec2): View {
  const logZoom = Math.max(view.logZoom + logFactor, Math.log(MIN_ZOOM));
  const keep = 1 - Math.exp(view.logZoom - logZoom);
  const moved = panBy(view, { x: focus.x * keep, y: focus.y * keep });
  return withPrecision({ ...moved, logZoom });
}

export function logDepth(view: View): number {
  return view.logZoom;
}

export function centerApprox(view: View): Vec2 {
  return { x: toNumber(view.re, view.bits), y: toNumber(view.im, view.bits) };
}

// How many iterations a view gets. Detail at depth takes more of them.
export function maxIterations(view: View): number {
  const depth = Math.max(0, view.logZoom / Math.LN2);
  return Math.floor(250 + 45 * depth);
}

// Width of the texture the reference orbit is stored in.
export const ORBIT_TEXTURE_WIDTH = 1024;

// The orbit of one point computed at full precision. Every pixel is then
// iterated on the GPU as a float-sized difference from it (perturbation),
// which is what makes arbitrarily deep zooms affordable.
export type Reference = {
  re: bigint;
  im: bigint;
  bits: number;
  // x, y, and the float32 rounding error of each, per step, padded to whole
  // texture rows.
  orbit: Float32Array;
  length: number;
  // Whether the orbit ran its full length without escaping.
  bounded: boolean;
};

// Well past the escape radius, so every pixel has escaped before the orbit
// ends.
const REFERENCE_BAILOUT = 1e6;

export function computeReference(view: View): Reference {
  const { re, im, bits } = view;
  // Longer than needed, so zooming in a little doesn't call for a new one.
  const steps = Math.ceil(maxIterations(view) * 1.3) + 64;
  const rows = Math.ceil((steps + 1) / ORBIT_TEXTURE_WIDTH);
  const orbit = new Float32Array(rows * ORBIT_TEXTURE_WIDTH * 4);
  const p = BigInt(bits);
  const pHalf = BigInt(bits - 1);

  let zr = 0n;
  let zi = 0n;
  let length = 0;
  let bounded = true;

  for (let i = 0; i <= steps; i++) {
    const x = toNumber(zr, bits);
    const y = toNumber(zi, bits);
    const xHigh = Math.fround(x);
    const yHigh = Math.fround(y);
    orbit[i * 4] = xHigh;
    orbit[i * 4 + 1] = yHigh;
    orbit[i * 4 + 2] = x - xHigh;
    orbit[i * 4 + 3] = y - yHigh;
    length = i + 1;

    if (x * x + y * y > REFERENCE_BAILOUT) {
      bounded = false;
      break;
    }

    const nextZr = ((zr * zr - zi * zi) >> p) + re;
    zi = ((zr * zi) >> pHalf) + im;
    zr = nextZr;
  }

  return { re, im, bits, orbit, length, bounded };
}

// Where the view center sits relative to a point (a reference, or another
// view's center), in view heights.
export function referenceOffset(
  view: View,
  reference: { re: bigint; im: bigint; bits: number },
): Vec2 {
  const { mantissa, exponent } = viewScale(view);
  const align = view.bits - reference.bits;
  const toViews = (center: bigint, origin: bigint) =>
    toNumber(center - shift(origin, align), view.bits + exponent) / mantissa;
  return {
    x: toViews(view.re, reference.re),
    y: toViews(view.im, reference.im),
  };
}

// Pixels are float offsets from the reference, so it has to stay close to the
// view for them to keep their precision, and its orbit has to cover the view's
// iteration count (unless it escaped).
export function referenceFits(view: View, reference: Reference): boolean {
  if (reference.bits > view.bits) return false;
  if (reference.bounded && reference.length <= maxIterations(view))
    return false;
  const offset = referenceOffset(view, reference);
  return Math.hypot(offset.x, offset.y) < 4;
}
