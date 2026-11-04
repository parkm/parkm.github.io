import { deviceParams } from "../engine/devices";
import { EFFECTS } from "../engine/effects";
import { PAD_CHOKE, PAD_LEVEL, PAD_NOTE, PAD_PAN } from "../engine/padParams";
import { constrainParam, type ParamDef } from "../engine/params";
import { VOICES } from "../engine/voices";
import { newId } from "../model/ops";
import type { Device, EffectType, Pad, VoiceType } from "../model/types";

/**
 * Device settings as commented plain text, for copying out, editing by hand
 * or with an LLM, and pasting back:
 *
 *   # Filter cutoff. Lower is darker.
 *   # 30 to 18000 Hz. Default 1800.
 *   cutoff = 800
 *
 * One `key = value` per line; `#` starts a comment. Choices are written by
 * name. `[Name]` starts a section: drum pads in a Drum Kit, display-only
 * headings everywhere else.
 */

type DeviceType = Device["type"];

const INSTRUMENTS: DeviceType[] = ["drumKit", "synth", "quickSynth", "fmSynth"];
const isInstrument = (type: DeviceType) => INSTRUMENTS.includes(type);
const DEVICE_TYPES: DeviceType[] = [
  ...INSTRUMENTS,
  ...(Object.keys(EFFECTS) as EffectType[]),
];

export const deviceLabel = (type: DeviceType) =>
  type === "drumKit"
    ? "Drum Kit"
    : type === "quickSynth"
      ? "Quick Synth"
      : type === "synth"
        ? "Synth"
        : type === "fmSynth"
          ? "FM Synth"
          : EFFECTS[type].label;

const paramDefs = deviceParams;

const VOICE_TYPES = Object.keys(VOICES) as VoiceType[];

const PAD_VOICE: ParamDef = {
  key: "voice",
  label: "Voice",
  min: 0,
  max: VOICE_TYPES.length - 1,
  default: 0,
  options: VOICE_TYPES,
  description: "Which drum sound this pad plays.",
};

const PAD_MUTE: ParamDef = {
  key: "mute",
  label: "Mute",
  min: 0,
  max: 1,
  default: 0,
  options: ["no", "yes"],
  description: "Silences this pad.",
};

const UNIT_WORDS: Record<NonNullable<ParamDef["unit"]>, string> = {
  Hz: "Hz",
  ms: "ms",
  "%": "%",
  dB: "dB",
  st: "semitones",
  ct: "cents",
  s: "seconds",
};

const num = (v: number) => String(Number(v.toFixed(3)));

const formatValue = (def: ParamDef, v: number) =>
  def.options ? (def.options[Math.round(v)] ?? def.options[0]) : num(v);

function rangeNote(def: ParamDef) {
  if (def.options)
    return `One of: ${def.options.join(", ")}. Default ${def.options[def.default]}.`;
  const unit = def.unit ? ` ${UNIT_WORDS[def.unit]}` : "";
  return `${num(def.min)} to ${num(def.max)}${unit}. Default ${num(def.default)}.`;
}

/** Writes params, each with its description (only the first time it appears) and range. */
function paramWriter() {
  const described = new Set<string>();
  return (def: ParamDef, value: number) => {
    const lines: string[] = [];
    if (def.description && !described.has(def.description)) {
      described.add(def.description);
      lines.push(`# ${def.description}`);
    }
    lines.push(
      `# ${rangeNote(def)}`,
      `${def.key} = ${formatValue(def, value)}`,
    );
    return lines;
  };
}

/** The device's settings as commented text. Every param is written, defaults included. */
export function writePatch(device: Device): string {
  const label = deviceLabel(device.type);
  const out = [
    `# ${label} settings from the DAW at parkermiller.net/daw.`,
    `# One "key = value" per line; lines starting with # are comments.`,
    `# The comments above each key say what it does, its range and default.`,
    `# Numbers outside a range are clamped. A missing key uses its default.`,
  ];
  const write = paramWriter();

  if (device.type === "drumKit") {
    out.push(
      `# Each [section] is one pad, named in the brackets. List every pad:`,
      `# pads left out are removed. Settings below "voice" depend on the voice.`,
      "",
      `device = ${device.type}`,
    );
    for (const pad of device.pads) {
      out.push("", `[${pad.name}]`);
      out.push(...write(PAD_VOICE, VOICE_TYPES.indexOf(pad.voice)));
      out.push(...write(PAD_NOTE, pad.pitch));
      out.push(...write(PAD_LEVEL, pad.level));
      out.push(...write(PAD_PAN, pad.pan));
      out.push(...write(PAD_CHOKE, pad.choke ?? 0));
      out.push(...write(PAD_MUTE, pad.mute ? 1 : 0));
      for (const def of VOICES[pad.voice].params)
        out.push(...write(def, pad.params[def.key] ?? def.default));
    }
    return out.join("\n") + "\n";
  }

  out.push(
    `# [Section] headings are only for reading.`,
    "",
    `device = ${device.type}`,
  );
  let group: string | undefined;
  for (const def of paramDefs(device.type)) {
    if (def.group && def.group !== group) {
      group = def.group;
      out.push("", `[${group}]`);
    }
    out.push(...write(def, device.params[def.key] ?? def.default));
  }
  return out.join("\n") + "\n";
}

type Entry = { line: number; key: string; value: string };
type Section = { name: string; line: number; entries: Entry[] };

/** Split text into top-level entries and [sections]. Tolerates code fences and trailing comments. */
function parseLines(text: string) {
  const top: Entry[] = [];
  const sections: Section[] = [];
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const s = raw.trim();
    if (!s || s.startsWith("#") || s.startsWith("```")) return;
    const section = s.match(/^\[(.*)\]$/);
    if (section) {
      sections.push({ name: section[1].trim(), line, entries: [] });
      return;
    }
    const kv = s.match(/^([\w-]+)\s*[=:]\s*(.*)$/);
    if (!kv) {
      problems.push(`Line ${line}: expected "key = value", got "${s}".`);
      return;
    }
    const value = kv[2].replace(/\s+#.*$/, "").trim();
    const entry = { line, key: kv[1], value };
    (sections.at(-1)?.entries ?? top).push(entry);
  });
  return { top, sections, problems };
}

/** Read a value for `def`: a choice by name (or index), or a number, constrained to its range. */
function readValue(def: ParamDef, e: Entry, problems: string[]) {
  if (def.options) {
    const wanted = e.value.toLowerCase();
    const i = def.options.findIndex((o) => o.toLowerCase() === wanted);
    if (i >= 0) return i;
    const n = Number(e.value);
    if (Number.isInteger(n) && n >= 0 && n < def.options.length) return n;
    problems.push(
      `Line ${e.line}: ${e.key} must be one of ${def.options.join(", ")}; got "${e.value}".`,
    );
    return null;
  }
  const n = parseFloat(e.value);
  if (!Number.isFinite(n)) {
    problems.push(`Line ${e.line}: ${e.key} needs a number; got "${e.value}".`);
    return null;
  }
  const v = constrainParam(def, n);
  if (n < def.min || n > def.max)
    problems.push(
      `Line ${e.line}: ${e.key} ${num(n)} is outside ${num(def.min)} to ${num(def.max)}; used ${num(v)}.`,
    );
  return v;
}

function readParams(defs: ParamDef[], entries: Entry[], problems: string[]) {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const params: Record<string, number> = {};
  for (const e of entries) {
    const def = byKey.get(e.key);
    if (!def) {
      problems.push(`Line ${e.line}: unknown setting "${e.key}", skipped.`);
      continue;
    }
    const v = readValue(def, e, problems);
    if (v !== null) params[e.key] = v;
  }
  return params;
}

export type PatchResult =
  | { ok: true; device: Device; problems: string[] }
  | { ok: false; error: string; problems: string[] };

/**
 * Read patch text as a replacement for `current`. The result keeps the
 * current device's id. A patch can change the device type, but an instrument
 * only replaces an instrument and an effect only an effect.
 */
export function readPatch(text: string, current: Device): PatchResult {
  const { top, sections, problems } = parseLines(text);
  const typeEntry = top.find((e) => e.key === "device");
  const type = (typeEntry?.value ?? current.type) as DeviceType;
  if (!DEVICE_TYPES.includes(type))
    return {
      ok: false,
      error: `Unknown device "${type}". Use one of: ${DEVICE_TYPES.join(", ")}.`,
      problems,
    };
  if (isInstrument(type) !== isInstrument(current.type))
    return {
      ok: false,
      error: `These are ${deviceLabel(type)} settings; they can only replace ${isInstrument(type) ? "an instrument" : "an effect"}.`,
      problems,
    };
  const rest = top.filter((e) => e !== typeEntry);

  if (type === "drumKit") {
    for (const e of rest)
      problems.push(
        `Line ${e.line}: "${e.key}" is outside a [pad] section, skipped.`,
      );
    if (sections.length === 0)
      return { ok: false, error: "No [pad] sections found.", problems };
    const unused = current.type === "drumKit" ? [...current.pads] : [];
    const pads = sections.map((s) => {
      const i = unused.findIndex((p) => p.name === s.name);
      const old = i >= 0 ? unused.splice(i, 1)[0] : null;
      return readPad(s, old, problems);
    });
    return {
      ok: true,
      device: { id: current.id, type, pads },
      problems,
    };
  }

  const params = readParams(
    paramDefs(type),
    [...rest, ...sections.flatMap((s) => s.entries)],
    problems,
  );
  if (isInstrument(type))
    return {
      ok: true,
      device: {
        id: current.id,
        type: type as "synth" | "quickSynth" | "fmSynth",
        params,
      },
      problems,
    };
  return {
    ok: true,
    device: {
      id: current.id,
      type: type as EffectType,
      params,
      bypass: "bypass" in current && current.type === type && current.bypass,
    },
    problems,
  };
}

/** A pad from its section. The old pad (matched by name) only lends its id. */
function readPad(s: Section, old: Pad | null, problems: string[]): Pad {
  const field = (key: string) => s.entries.find((e) => e.key === key);
  let voice: VoiceType = "kick";
  const voiceEntry = field("voice");
  if (!voiceEntry) {
    problems.push(`Line ${s.line}: [${s.name}] has no voice; used kick.`);
  } else {
    const v = voiceEntry.value.toLowerCase() as VoiceType;
    if (VOICE_TYPES.includes(v)) voice = v;
    else
      problems.push(
        `Line ${voiceEntry.line}: voice must be one of ${VOICE_TYPES.join(", ")}; got "${voiceEntry.value}".`,
      );
  }
  const read = (def: ParamDef) => {
    const e = field(def.key);
    if (def === PAD_CHOKE && e && /^(none|off)$/i.test(e.value)) return 0;
    return (e && readValue(def, e, problems)) ?? def.default;
  };
  const choke = read(PAD_CHOKE);
  const own = new Set(["voice", "note", "level", "pan", "choke", "mute"]);
  return {
    id: old?.id ?? newId(),
    name: s.name || "Pad",
    pitch: read(PAD_NOTE),
    voice,
    params: readParams(
      VOICES[voice].params,
      s.entries.filter((e) => !own.has(e.key)),
      problems,
    ),
    level: read(PAD_LEVEL),
    pan: read(PAD_PAN),
    mute: read(PAD_MUTE) === 1,
    choke: choke > 0 ? choke : null,
  };
}
