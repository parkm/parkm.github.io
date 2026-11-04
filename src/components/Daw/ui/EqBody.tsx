import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  autoGain,
  EQ_PARAMS,
  eqResponse,
  HIGH_CUT_OFF,
  LOW_CUT_OFF,
  logFrequencies,
} from "../engine/eq";
import { constrainParam, resolveParams, type ParamDef } from "../engine/params";
import { useDaw } from "./context";
import { Knob } from "./Knob";

const DEFS = new Map(EQ_PARAMS.map((d) => [d.key, d]));
const def = (key: string) => DEFS.get(key)!;

// Curve geometry, in SVG units (pixels). The curve is W wide and as tall as
// the device panel allows, so the EQ never scrolls inside its card.
const W = 320;
const MIN_H = 80;
const F_LO = 20;
const F_HI = 20000;
const DB = 18;
const FREQS = logFrequencies(F_LO, F_HI, 160);
const GRID_F = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
const GRID_DB = [-12, -6, 6, 12];

const xOf = (f: number) => (Math.log(f / F_LO) / Math.log(F_HI / F_LO)) * W;
const fOf = (x: number) => F_LO * (F_HI / F_LO) ** (x / W);

const fLabel = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f));

type Handle = {
  key: string;
  label: string;
  freqKey: string;
  gainKey?: string;
  hue: number;
};

const HANDLES: Handle[] = [
  { key: "lowCut", label: "Low cut", freqKey: "lowCut", hue: 250 },
  { key: "low", label: "Low", freqKey: "lowFreq", gainKey: "lowGain", hue: 30 },
  {
    key: "mid",
    label: "Mid",
    freqKey: "midFreq",
    gainKey: "midGain",
    hue: 140,
  },
  {
    key: "high",
    label: "High",
    freqKey: "highFreq",
    gainKey: "highGain",
    hue: 200,
  },
  { key: "highCut", label: "High cut", freqKey: "highCut", hue: 300 },
];

const cutFormat = (off: number) => (v: number) =>
  v === off
    ? "Off"
    : v >= 1000
      ? `${(v / 1000).toFixed(2)} kHz`
      : `${Math.round(v)} Hz`;

const signedDb = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;

/**
 * The EQ: a response curve with a handle per band (drag a band's dot
 * sideways to sweep it, up and down to boost or cut; double-click to reset),
 * beside knobs for the same controls.
 */
export function EqBody({
  values,
  onChange,
  onChangeMany,
}: {
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
  onChangeMany: (patch: Record<string, number>) => void;
}) {
  const { store } = useDaw();
  const v = useMemo(() => resolveParams(EQ_PARAMS, values), [values]);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Handle | null>(null);
  const [H, setH] = useState(120);
  useLayoutEffect(() => {
    const box = boxRef.current!;
    const measure = () => setH(Math.max(MIN_H, Math.floor(box.clientHeight)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  const yOf = (db: number) =>
    H / 2 - (Math.max(-DB, Math.min(DB, db)) / DB) * (H / 2);
  const dbOf = (y: number) => ((H / 2 - y) / (H / 2)) * DB;

  const curve = useMemo(() => {
    const db = eqResponse(v, FREQS);
    const trim = 20 * Math.log10(v.autoGain === 1 ? autoGain(v) : 1) + v.output;
    return FREQS.map(
      (f, i) =>
        `${i ? "L" : "M"}${xOf(f).toFixed(1)} ${yOf(db[i] + trim).toFixed(1)}`,
    ).join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yOf follows H
  }, [v, H]);

  const handlePos = (h: Handle) => {
    const f = v[h.freqKey];
    const y = h.gainKey ? yOf(v[h.gainKey]) : H / 2;
    return { x: xOf(f), y };
  };

  const moveTo = (h: Handle, e: PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    const patch: Record<string, number> = {
      [h.freqKey]: constrainParam(def(h.freqKey), fOf(x)),
    };
    if (h.gainKey) patch[h.gainKey] = constrainParam(def(h.gainKey), dbOf(y));
    onChangeMany(patch);
  };

  const reset = (h: Handle) => {
    const patch: Record<string, number> = {
      [h.freqKey]: def(h.freqKey).default,
    };
    if (h.gainKey) patch[h.gainKey] = 0;
    onChangeMany(patch);
  };

  const knob = (
    key: string,
    format?: (v: number) => string,
    label?: string,
  ) => (
    <Knob
      key={key}
      def={label ? { ...def(key), label } : def(key)}
      value={v[key]}
      onChange={(x) => onChange(key, x)}
      onBegin={store.begin}
      onEnd={store.end}
      format={format}
      size={38}
    />
  );

  const segmented = (key: string) => {
    const d: ParamDef = def(key);
    return (
      <div
        className="flex rounded bg-zinc-950/60 p-0.5"
        role="group"
        aria-label={d.label}
        title={d.description}
      >
        {d.options!.map((o, i) => (
          <button
            key={o}
            type="button"
            aria-pressed={v[key] === i}
            className={`h-5 flex-1 rounded-sm px-1.5 text-[10px] whitespace-nowrap ${
              v[key] === i
                ? "bg-zinc-600 text-zinc-50"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => onChange(key, i)}
          >
            {o}
          </button>
        ))}
      </div>
    );
  };

  const section = (name: string, children: ReactNode) => (
    <div data-group={name} className="flex shrink-0 flex-col gap-1.5">
      <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
        {name}
      </div>
      {children}
    </div>
  );

  return (
    <div className="flex h-full gap-4">
      <div
        ref={boxRef}
        data-group="Curve"
        className="relative h-full shrink-0"
        style={{ width: W, minHeight: MIN_H }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-x-0 top-0 touch-none rounded bg-zinc-950/70 select-none"
          style={{ width: W, height: H }}
          aria-label="EQ curve"
          onPointerMove={(e) => drag.current && moveTo(drag.current, e)}
          onPointerUp={() => {
            if (drag.current) store.end();
            drag.current = null;
          }}
          onPointerCancel={() => {
            if (drag.current) store.end();
            drag.current = null;
          }}
        >
          {GRID_F.map((f) => (
            <g key={f}>
              <line
                x1={xOf(f)}
                x2={xOf(f)}
                y1={0}
                y2={H}
                className="stroke-zinc-800"
                strokeWidth={1}
              />
              <text
                x={xOf(f) + 2}
                y={H - 3}
                className="fill-zinc-600 text-[8px]"
              >
                {fLabel(f)}
              </text>
            </g>
          ))}
          {GRID_DB.map((d) => (
            <g key={d}>
              <line
                x1={0}
                x2={W}
                y1={yOf(d)}
                y2={yOf(d)}
                className="stroke-zinc-800/70"
                strokeWidth={1}
              />
              <text x={2} y={yOf(d) - 2} className="fill-zinc-600 text-[8px]">
                {d > 0 ? `+${d}` : d}
              </text>
            </g>
          ))}
          <line
            x1={0}
            x2={W}
            y1={H / 2}
            y2={H / 2}
            className="stroke-zinc-700"
            strokeWidth={1}
          />
          <path
            d={`${curve} L${W} ${H / 2} L0 ${H / 2} Z`}
            className="fill-amber-300/10"
          />
          <path
            d={curve}
            className="fill-none stroke-amber-300"
            strokeWidth={1.75}
          />
          {HANDLES.map((h) => {
            const { x, y } = handlePos(h);
            const off =
              (h.key === "lowCut" && v.lowCut === LOW_CUT_OFF) ||
              (h.key === "highCut" && v.highCut === HIGH_CUT_OFF) ||
              (h.gainKey !== undefined && v[h.gainKey] === 0);
            return (
              <g key={h.key}>
                <title>
                  {`${h.label}: drag ${h.gainKey ? "sideways to sweep, up or down to boost or cut" : "sideways to set"}. Double-click to reset.`}
                </title>
                {/* Bigger invisible target for fingers. */}
                <circle
                  cx={x}
                  cy={y}
                  r={12}
                  className="cursor-grab fill-transparent"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    svgRef.current!.setPointerCapture(e.pointerId);
                    drag.current = h;
                    store.begin();
                  }}
                  onDoubleClick={() => reset(h)}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={5}
                  className="pointer-events-none"
                  style={{
                    fill: off ? "transparent" : `oklch(0.78 0.14 ${h.hue})`,
                    stroke: `oklch(0.78 0.14 ${h.hue})`,
                    strokeWidth: 1.5,
                  }}
                />
              </g>
            );
          })}
        </svg>
      </div>
      {section(
        "Cuts",
        <>
          {knob("lowCut", cutFormat(LOW_CUT_OFF), "Low")}
          {knob("highCut", cutFormat(HIGH_CUT_OFF), "High")}
          {segmented("slope")}
        </>,
      )}
      {section(
        "Low",
        <>
          {knob("lowGain", signedDb)}
          {knob("lowFreq")}
        </>,
      )}
      {section(
        "Mid",
        <>
          {knob("midGain", signedDb)}
          {knob("midFreq")}
          {segmented("midWidth")}
        </>,
      )}
      {section(
        "High",
        <>
          {knob("highGain", signedDb)}
          {knob("highFreq")}
        </>,
      )}
      {section(
        "Output",
        <>
          {knob("output", signedDb)}
          {segmented("autoGain")}
        </>,
      )}
    </div>
  );
}
