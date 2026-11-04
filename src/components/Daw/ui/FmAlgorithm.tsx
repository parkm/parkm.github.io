import { ALGORITHMS, type Algorithm } from "../engine/fmSynth";
import type { ParamDef } from "../engine/params";

const CELL = 28;
const R = 9;

/** Operators as numbered circles, arrows from modulator to target; carriers (heard) in amber. */
function Diagram({ algorithm }: { algorithm: Algorithm }) {
  const pos = Object.values(algorithm.layout);
  const cols = Math.max(...pos.map(([c]) => c)) + 1;
  const rows = Math.max(...pos.map(([, r]) => r)) + 1;
  const w = 4 * CELL;
  const h = 4 * CELL;
  const at = (n: number) => {
    const [c, r] = algorithm.layout[n];
    return {
      x: w / 2 + (c - (cols - 1) / 2) * CELL,
      y: h / 2 + (r - (rows - 1) / 2) * CELL,
    };
  };
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <marker
          id="fm-arrow"
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0 L6 3 L0 6 z" className="fill-zinc-400" />
        </marker>
      </defs>
      {algorithm.edges.map(([from, to]) => {
        const a = at(from);
        const b = at(to);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x + ux * R}
            y1={a.y + uy * R}
            x2={b.x - ux * (R + 1)}
            y2={b.y - uy * (R + 1)}
            className="stroke-zinc-400"
            strokeWidth={1.25}
            markerEnd="url(#fm-arrow)"
          />
        );
      })}
      {[1, 2, 3, 4].map((n) => {
        const { x, y } = at(n);
        const carrier = algorithm.carriers.includes(n);
        return (
          <g key={n}>
            <circle
              cx={x}
              cy={y}
              r={R}
              className={carrier ? "fill-amber-400" : "fill-zinc-600"}
            />
            <text
              x={x}
              y={y + 3.5}
              textAnchor="middle"
              className={`text-[10px] font-medium ${carrier ? "fill-zinc-900" : "fill-zinc-100"}`}
            >
              {n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Algorithm picker with a diagram of the routing. */
export function FmAlgorithm({
  def,
  value,
  onChange,
}: {
  def: ParamDef;
  value: number;
  onChange: (value: number) => void;
}) {
  const algorithm = ALGORITHMS[Math.round(value)] ?? ALGORITHMS[0];
  return (
    <div
      className="flex w-24 flex-col items-center gap-1.5"
      title={def.description}
    >
      <select
        aria-label="Algorithm"
        className="h-6 w-full rounded bg-zinc-950/60 px-0.5 text-[11px] text-zinc-200"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      >
        {ALGORITHMS.map((a, i) => (
          <option key={a.name} value={i}>
            {a.name}
          </option>
        ))}
      </select>
      <Diagram algorithm={algorithm} />
      <p className="text-center text-[10px] leading-tight text-zinc-500">
        <span className="text-amber-400">●</span> heard{" "}
        <span className="text-zinc-500">●</span> modulates
      </p>
    </div>
  );
}

/** "Op 2" → "Op 2 · Mod" or "· Carrier" for the current algorithm. */
export function fmGroupLabel(name: string, algorithmIndex: number) {
  const m = name.match(/^Op (\d)$/);
  if (!m) return name;
  const algorithm = ALGORITHMS[Math.round(algorithmIndex)] ?? ALGORITHMS[0];
  return `${name} · ${algorithm.carriers.includes(Number(m[1])) ? "Carrier" : "Mod"}`;
}
