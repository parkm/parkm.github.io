// Color + hue math shared across the Color app modules.

export function hslToRgb(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(255 * f(0));
  const g = Math.round(255 * f(8));
  const b = Math.round(255 * f(4));
  return (r << 16) + (g << 8) + b;
}

export function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

export function hslCss(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

export function hslCssA(h: number, s: number, l: number, a: number): string {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

// Shortest absolute distance between two hues (0..180).
export function hueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Signed shortest distance from `from` to `to` around the hue wheel (-180..180].
// Positive => target is "clockwise" (drag right to reach it).
export function signedHueDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}
