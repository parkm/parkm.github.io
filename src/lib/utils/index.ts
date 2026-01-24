export * from "./cn";
export * from "./audioInit";

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
