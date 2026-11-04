/** Describes one automatable number: drives the device UI, defaults, and (later) automation. */
export type ParamDef = {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  unit?: "Hz" | "ms" | "%" | "dB" | "st" | "ct" | "s";
  /** "exp" maps the knob logarithmically; needs min > 0. */
  curve?: "lin" | "exp";
  step?: number;
  /** A discrete choice; the value is an index into this list. */
  options?: readonly string[];
  /** Heading the device UI groups this param under. */
  group?: string;
  /** What it does to the sound, in a sentence or two. Shown as the control's tooltip and in exported settings. */
  description?: string;
  /** Shown only when this holds for the device's (resolved) values, like a delay's ms knob in Free mode. */
  when?: (values: Record<string, number>) => boolean;
};

/** A param that picks one of `options` (value is the index). */
export const choice = (
  key: string,
  label: string,
  options: readonly string[],
  value = 0,
  group?: string,
  description?: string,
): ParamDef => ({
  key,
  label,
  min: 0,
  max: options.length - 1,
  default: value,
  step: 1,
  options,
  group,
  description,
});

export const toNormal = (def: ParamDef, value: number) => {
  const v = Math.min(def.max, Math.max(def.min, value));
  return def.curve === "exp"
    ? Math.log(v / def.min) / Math.log(def.max / def.min)
    : (v - def.min) / (def.max - def.min);
};

export const fromNormal = (def: ParamDef, n: number) => {
  const x = Math.min(1, Math.max(0, n));
  const v =
    def.curve === "exp"
      ? def.min * (def.max / def.min) ** x
      : def.min + x * (def.max - def.min);
  return snap(def, v);
};

/** Round to the param's step (whole numbers for linear params without one). */
const snap = (def: ParamDef, v: number) => {
  const step = def.step ?? (def.curve === "exp" ? 0 : 1);
  return step ? Math.round(v / step) * step : v;
};

/** Clamp a typed or imported value into range and onto the param's step. */
export const constrainParam = (def: ParamDef, value: number) =>
  snap(def, Math.min(def.max, Math.max(def.min, value)));

export function formatParam(def: ParamDef, value: number) {
  if (def.options) return def.options[Math.round(value)] ?? "";
  const unit = def.unit ?? "";
  if (def.unit === "Hz" && value >= 1000)
    return `${(value / 1000).toFixed(2)} kHz`;
  if (def.unit === "ms" && value >= 1000)
    return `${(value / 1000).toFixed(2)} s`;
  if (def.unit === "st")
    return `${value > 0 ? "+" : ""}${Math.round(value)} st`;
  if (def.unit === "dB")
    return value <= -60 ? "-inf dB" : `${value.toFixed(1)} dB`;
  const text =
    def.step && def.step < 1
      ? // Fine-stepped params show what the step allows: a 0.25-step ratio as 3.75 or 2.
        String(Number(value.toFixed(3)))
      : value.toFixed(Math.abs(value) < 10 && !Number.isInteger(value) ? 1 : 0);
  return `${text}${unit ? ` ${unit}` : ""}`.replace(" %", "%");
}

export function resolveParams(
  defs: ParamDef[],
  values: Record<string, number>,
) {
  const out: Record<string, number> = {};
  for (const d of defs) out[d.key] = values[d.key] ?? d.default;
  return out;
}

/** Put defs under a heading in the device UI. */
export const inGroup = (group: string, defs: ParamDef[]): ParamDef[] =>
  defs.map((d) => ({ ...d, group }));

/** Show defs only when `when` holds for the device's values. */
export const showWhen = (
  when: (values: Record<string, number>) => boolean,
  defs: ParamDef[],
): ParamDef[] => defs.map((d) => ({ ...d, when }));

/** Attach descriptions to defs by key. */
export const describe = (
  defs: ParamDef[],
  descriptions: Record<string, string>,
): ParamDef[] =>
  defs.map((d) =>
    descriptions[d.key] ? { ...d, description: descriptions[d.key] } : d,
  );
