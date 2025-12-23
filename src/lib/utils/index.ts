export * from "./cn";

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
