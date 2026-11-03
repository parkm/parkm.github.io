import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { EFFECTS } from "../engine/effects";
import type { ParamDef } from "../engine/params";
import {
  ENVELOPE_PICKS,
  QUICK_PARAMS,
  QUICK_PRESETS,
} from "../engine/quickSynth";
import {
  MOD_DESTINATIONS,
  MOD_SLOTS,
  MOD_SOURCES,
  SYNTH_PARAMS,
  SYNTH_PRESETS,
} from "../engine/synth";
import { VOICES } from "../engine/voices";
import {
  addEffect,
  moveDevice,
  removeDevice,
  setDeviceParam,
  setDeviceParams,
  toggleBypass,
} from "../model/deviceOps";
import { DEFAULT_VELOCITY, setPadParam, updatePad } from "../model/ops";
import type { Tick } from "../model/time";
import type {
  Device,
  DrumKitDevice,
  EffectType,
  Id,
  Pad,
} from "../model/types";
import { useDaw, useDoc } from "./context";
import { DragNumber } from "./DragNumber";
import { Knob } from "./Knob";
import { formatPan, PAN } from "./TrackMixer";

const LEVEL: ParamDef = {
  key: "level",
  label: "Level",
  min: -36,
  max: 6,
  default: 0,
  unit: "dB",
  step: 0.1,
};

type DeviceChainProps = {
  trackId: Id;
  selectedPadId: Id | null;
  onSelectPad: (id: Id) => void;
  grid: Tick;
};

/**
 * The selected track's device chain, left to right in signal order, like
 * Ableton's device view. Click a device title to fold it.
 */
export function DeviceChain({
  trackId,
  selectedPadId,
  onSelectPad,
  grid,
}: DeviceChainProps) {
  const { store } = useDaw();
  const devices = useDoc(
    (d) => d.tracks.find((t) => t.id === trackId)?.devices,
  );
  const [folded, setFolded] = useState<Set<Id>>(() => new Set());
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  if (!devices) return null;

  const toggleFold = (id: Id) =>
    setFolded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div aria-label="Devices" className="flex min-w-0 flex-1 flex-col">
      <ChainMinimap
        scrollRef={scrollRef}
        contentRef={contentRef}
        zoom={zoom}
        onZoom={setZoom}
        layoutKey={`${devices.map((d) => d.id).join()}|${[...folded].join()}`}
      />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-auto">
        <div
          ref={contentRef}
          className="flex h-full w-max gap-2 p-2"
          style={{ zoom }}
        >
          {devices.map((device, i) => (
            <DeviceCard
              key={device.id}
              trackId={trackId}
              device={device}
              index={i}
              count={devices.length}
              folded={folded.has(device.id)}
              onToggleFold={() => toggleFold(device.id)}
            >
              {device.type === "drumKit" ? (
                <DrumKitBody
                  trackId={trackId}
                  kit={device}
                  selectedPadId={selectedPadId}
                  onSelectPad={onSelectPad}
                  grid={grid}
                />
              ) : device.type === "quickSynth" ? (
                <QuickSynthBody
                  values={device.params}
                  onChange={(key, value) =>
                    store.update((d) =>
                      setDeviceParam(d, trackId, device.id, key, value),
                    )
                  }
                  onPick={(params) =>
                    store.update((d) =>
                      setDeviceParams(d, trackId, device.id, {
                        ...device.params,
                        ...params,
                      }),
                    )
                  }
                />
              ) : (
                <ParamGroups
                  defs={
                    device.type === "synth"
                      ? SYNTH_PARAMS
                      : EFFECTS[device.type].params
                  }
                  values={device.params}
                  onChange={(key, value) =>
                    store.update((d) =>
                      setDeviceParam(d, trackId, device.id, key, value),
                    )
                  }
                />
              )}
            </DeviceCard>
          ))}
          <div className="flex shrink-0 flex-col gap-1">
            <span className="px-1 text-[11px] text-zinc-500">Add effect</span>
            {(Object.keys(EFFECTS) as EffectType[]).map((type) => (
              <button
                key={type}
                type="button"
                className="rounded px-2 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-700"
                onClick={() => store.update((d) => addEffect(d, trackId, type))}
              >
                + {EFFECTS[type].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const deviceLabel = (device: Device) =>
  device.type === "drumKit"
    ? "Drum Kit"
    : device.type === "quickSynth"
      ? "Quick Synth"
      : device.type === "synth"
        ? "Synth"
        : EFFECTS[device.type].label;

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function DeviceCard({
  trackId,
  device,
  index,
  count,
  folded,
  onToggleFold,
  children,
}: {
  trackId: Id;
  device: Device;
  index: number;
  count: number;
  folded: boolean;
  onToggleFold: () => void;
  children: ReactNode;
}) {
  const { store } = useDaw();
  const isEffect = "bypass" in device;
  const on = !isEffect || !device.bypass;
  const label = deviceLabel(device);

  const power = isEffect && (
    <button
      type="button"
      title={on ? "Turn off" : "Turn on"}
      aria-label={`${label} on`}
      aria-pressed={on}
      className={`h-3.5 w-3.5 shrink-0 rounded-full ${on ? "bg-amber-400" : "bg-zinc-600"}`}
      onClick={() => store.update((d) => toggleBypass(d, trackId, device.id))}
    />
  );

  const presets =
    device.type === "synth"
      ? SYNTH_PRESETS
      : device.type === "quickSynth"
        ? QUICK_PRESETS
        : null;

  if (folded) {
    return (
      <section
        data-device={label}
        aria-label={label}
        className="flex h-full w-8 shrink-0 flex-col items-center gap-2 rounded bg-zinc-800/80 py-2"
      >
        {power}
        <button
          type="button"
          title="Unfold"
          className="text-xs font-medium text-zinc-300 [writing-mode:vertical-rl]"
          onClick={onToggleFold}
        >
          {label}
        </button>
      </section>
    );
  }

  return (
    <section
      data-device={label}
      aria-label={label}
      className="flex h-full shrink-0 flex-col rounded bg-zinc-800/80"
    >
      <header className="flex h-7 shrink-0 items-center gap-1.5 border-b border-zinc-900 pr-2">
        {/* Title and presets stay in view while scrolling across a wide device. */}
        <div className="sticky left-0 z-10 flex items-center gap-1.5 rounded-tl bg-zinc-800 px-2">
          {power}
          <button
            type="button"
            title="Fold"
            className={`text-xs font-medium whitespace-nowrap ${on ? "text-zinc-100" : "text-zinc-500"}`}
            onClick={onToggleFold}
          >
            {label}
          </button>
          {presets && (
            <select
              aria-label={`${label} preset`}
              className="h-5 rounded bg-zinc-950/60 px-1 text-[11px] text-zinc-300"
              value=""
              onChange={(e) => {
                const preset = presets[e.currentTarget.value];
                if (preset) {
                  store.update((d) =>
                    setDeviceParams(d, trackId, device.id, preset),
                  );
                }
              }}
            >
              <option value="">Preset…</option>
              {Object.keys(presets).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex-1" />
        {isEffect && (
          <>
            <IconButton
              label="Move earlier"
              disabled={index <= 1}
              onClick={() =>
                store.update((d) => moveDevice(d, trackId, device.id, -1))
              }
            >
              <ChevronLeft size={13} />
            </IconButton>
            <IconButton
              label="Move later"
              disabled={index >= count - 1}
              onClick={() =>
                store.update((d) => moveDevice(d, trackId, device.id, 1))
              }
            >
              <ChevronRight size={13} />
            </IconButton>
            <IconButton
              label={`Remove ${label}`}
              onClick={() =>
                store.update((d) => removeDevice(d, trackId, device.id))
              }
            >
              <X size={13} />
            </IconButton>
          </>
        )}
      </header>
      <div
        className={`min-h-0 flex-1 overflow-y-auto p-2 ${on ? "" : "opacity-50"}`}
      >
        {children}
      </div>
    </section>
  );
}

/** Params laid out as columns, one per group, like the sections of a hardware synth. */
function ParamGroups({
  defs,
  values,
  onChange,
}: {
  defs: ParamDef[];
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
}) {
  const { store } = useDaw();
  const groups = new Map<string, ParamDef[]>();
  for (const def of defs) {
    const g = def.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), def]);
  }
  return (
    <div className="flex h-full gap-3">
      {[...groups].map(([name, group]) => (
        <div key={name} data-group={name} className="flex shrink-0 flex-col">
          {name && (
            <div className="mb-1.5 text-[10px] tracking-wide text-zinc-500 uppercase">
              {name}
            </div>
          )}
          {name === "Modulation" ? (
            <ModMatrix values={values} onChange={onChange} />
          ) : (
            <div
              className={`grid gap-x-1 gap-y-2 ${group.length > 8 ? "grid-cols-3" : "grid-cols-2"}`}
            >
              {group.map((def) =>
                def.options ? (
                  <OptionSelect
                    key={def.key}
                    def={def}
                    value={values[def.key] ?? def.default}
                    onChange={(v) => onChange(def.key, v)}
                  />
                ) : (
                  <Knob
                    key={def.key}
                    def={def}
                    value={values[def.key] ?? def.default}
                    onChange={(v) => onChange(def.key, v)}
                    onBegin={store.begin}
                    onEnd={store.end}
                  />
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Modulation matrix: each row routes a source to a target by an amount. */
function ModMatrix({
  values,
  onChange,
}: {
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
}) {
  const { store } = useDaw();
  const value = (key: string, fallback: number) => values[key] ?? fallback;
  const select = "h-6 rounded bg-zinc-950/60 px-1 text-[11px] text-zinc-200";
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: MOD_SLOTS }, (_, i) => {
        const n = i + 1;
        const off = value(`mod${n}Src`, 0) === 0;
        return (
          <div
            key={n}
            className={`flex items-center gap-1 ${off ? "opacity-60" : ""}`}
          >
            <select
              aria-label={`Mod ${n} source`}
              className={`${select} w-24`}
              value={value(`mod${n}Src`, 0)}
              onChange={(e) =>
                onChange(`mod${n}Src`, Number(e.currentTarget.value))
              }
            >
              {MOD_SOURCES.map((s, j) => (
                <option key={s} value={j}>
                  {s}
                </option>
              ))}
            </select>
            <span className="text-zinc-500">→</span>
            <select
              aria-label={`Mod ${n} target`}
              className={`${select} w-24`}
              value={value(`mod${n}Dst`, 4)}
              onChange={(e) =>
                onChange(`mod${n}Dst`, Number(e.currentTarget.value))
              }
            >
              {MOD_DESTINATIONS.map((s, j) => (
                <option key={s} value={j}>
                  {s}
                </option>
              ))}
            </select>
            <DragNumber
              label={`Mod ${n} amount`}
              value={value(`mod${n}Amt`, 0)}
              min={-100}
              max={100}
              format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}%`}
              parse={(t) => parseFloat(t)}
              onChange={(v) => onChange(`mod${n}Amt`, v)}
              onBegin={store.begin}
              onEnd={store.end}
              className="w-14! text-[11px]"
            />
          </div>
        );
      })}
    </div>
  );
}

function OptionSelect({
  def,
  value,
  onChange,
}: {
  def: ParamDef;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex w-[4.75rem] flex-col items-center gap-1">
      <span className="text-[11px] text-zinc-400">{def.label}</span>
      <select
        className="h-6 w-full rounded bg-zinc-950/60 px-0.5 text-[11px] text-zinc-200"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      >
        {def.options!.map((o, i) => (
          <option key={o} value={i}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function DrumKitBody({
  trackId,
  kit,
  selectedPadId,
  onSelectPad,
  grid,
}: {
  trackId: Id;
  kit: DrumKitDevice;
  selectedPadId: Id | null;
  onSelectPad: (id: Id) => void;
  grid: Tick;
}) {
  const { session } = useDaw();
  const pad = kit.pads.find((p) => p.id === selectedPadId);
  return (
    <div className="flex h-full gap-3">
      <div className="grid w-60 shrink-0 grid-cols-3 content-start gap-1.5">
        {kit.pads.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`h-11 truncate rounded px-2 text-left text-xs transition-colors active:bg-amber-300 active:text-zinc-900 ${
              p.id === selectedPadId
                ? "bg-zinc-500 text-zinc-50"
                : "bg-zinc-700/70 text-zinc-300 hover:bg-zinc-600/80"
            } ${p.mute ? "opacity-50" : ""}`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              onSelectPad(p.id);
              session.hit(trackId, p.pitch, DEFAULT_VELOCITY, grid);
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      {pad && <PadEditor key={pad.id} trackId={trackId} pad={pad} />}
    </div>
  );
}

function PadEditor({ trackId, pad }: { trackId: Id; pad: Pad }) {
  const { store } = useDaw();
  const voice = VOICES[pad.voice];
  const padId = pad.id;

  const setParam = useCallback(
    (key: string, value: number) =>
      store.update((d) => setPadParam(d, trackId, padId, key, value)),
    [store, trackId, padId],
  );
  const setLevel = useCallback(
    (level: number) =>
      store.update((d) =>
        updatePad(d, trackId, padId, (p) => ({ ...p, level })),
      ),
    [store, trackId, padId],
  );
  const setPan = useCallback(
    (pan: number) =>
      store.update((d) => updatePad(d, trackId, padId, (p) => ({ ...p, pan }))),
    [store, trackId, padId],
  );

  return (
    <div className="flex w-64 shrink-0 flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-zinc-100">{pad.name}</span>
        <span className="text-[11px] text-zinc-500">
          {voice.label} · note {pad.pitch}
          {pad.choke !== null && ` · choke ${pad.choke}`}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-x-1 gap-y-2">
        {voice.params.map((def) => (
          <Knob
            key={def.key}
            def={def}
            value={pad.params[def.key] ?? def.default}
            onChange={(v) => setParam(def.key, v)}
            onBegin={store.begin}
            onEnd={store.end}
          />
        ))}
        <Knob
          def={LEVEL}
          value={pad.level}
          onChange={setLevel}
          onBegin={store.begin}
          onEnd={store.end}
        />
        <Knob
          def={PAN}
          value={pad.pan}
          onChange={setPan}
          onBegin={store.begin}
          onEnd={store.end}
          format={formatPan}
        />
      </div>
    </div>
  );
}

const SHAPE_LABEL = (v: number) =>
  v < 4
    ? "Sine"
    : v > 96
      ? "Square"
      : Math.abs(v - 50) < 4
        ? "Saw"
        : v < 50
          ? "Sine–Saw"
          : "Saw–Square";

/** Quick Synth: big knobs in plain sections, one-click envelopes. */
function QuickSynthBody({
  values,
  onChange,
  onPick,
}: {
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
  onPick: (params: Record<string, number>) => void;
}) {
  const { store } = useDaw();
  const defs = new Map(QUICK_PARAMS.map((d) => [d.key, d]));
  const value = (key: string) => values[key] ?? defs.get(key)!.default;
  const knob = (key: string, format?: (v: number) => string, size = 46) => (
    <Knob
      key={key}
      def={defs.get(key)!}
      value={value(key)}
      onChange={(v) => onChange(key, v)}
      onBegin={store.begin}
      onEnd={store.end}
      format={format}
      size={size}
    />
  );
  const segmented = (key: string, options: readonly string[]) => (
    <div
      className="flex rounded bg-zinc-950/60 p-0.5"
      role="group"
      aria-label={defs.get(key)!.label}
    >
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          aria-pressed={Math.round(value(key)) === i}
          className={`h-6 flex-1 rounded-sm px-2 text-[11px] ${
            Math.round(value(key)) === i
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
  const section = (name: string, children: ReactNode, width?: string) => (
    <div
      data-group={name}
      className={`flex shrink-0 flex-col gap-2 ${width ?? ""}`}
    >
      <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
        {name}
      </div>
      {children}
    </div>
  );
  const wobbleRate = defs.get("wobbleRate")!;

  return (
    <div className="flex h-full gap-5">
      {section(
        "Sound",
        <div className="grid grid-cols-2 gap-x-1 gap-y-2">
          {knob("shape", SHAPE_LABEL)}
          {knob("thickness")}
          {knob("sub")}
          {knob("octave", (v) => (v > 0 ? `+${v}` : String(v)))}
        </div>,
      )}
      {section(
        "Tone",
        <div className="grid grid-cols-2 gap-x-1 gap-y-2">
          {knob("brightness")}
          {knob("resonance")}
          {knob("contour", (v) => `${v > 0 ? "+" : ""}${Math.round(v)}%`)}
        </div>,
      )}
      {section(
        "Envelope",
        <>
          <div className="flex gap-1" role="group" aria-label="Envelope shapes">
            {Object.entries(ENVELOPE_PICKS).map(([name, params]) => (
              <button
                key={name}
                type="button"
                className="h-6 rounded bg-zinc-700/70 px-2 text-[11px] text-zinc-200 hover:bg-zinc-600"
                onClick={() => onPick(params)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-x-1">
            {["attack", "decay", "sustain", "release"].map((k) =>
              knob(k, undefined, 38),
            )}
          </div>
        </>,
      )}
      {section(
        "Movement",
        <div className="grid grid-cols-3 gap-x-1 gap-y-2">
          {knob("vibrato")}
          {knob("vibratoRate", undefined, 38)}
          {knob("vibratoDelay", undefined, 38)}
          {knob("wobble")}
          <OptionSelect
            def={wobbleRate}
            value={value("wobbleRate")}
            onChange={(v) => onChange("wobbleRate", v)}
          />
        </div>,
      )}
      {section(
        "Play",
        <>
          {segmented("mono", defs.get("mono")!.options!)}
          <div className="grid grid-cols-2 gap-x-1 gap-y-2">
            {knob("glide", undefined, 38)}
            {knob("velocity", undefined, 38)}
            {knob("drive", undefined, 38)}
            {knob("volume", undefined, 38)}
          </div>
        </>,
      )}
    </div>
  );
}

type Block = {
  label: string;
  left: number;
  width: number;
  groups: { label: string; left: number; width: number }[];
};
type Metrics = {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  blocks: Block[];
};

/**
 * Overview of the whole device chain, like Ableton's. Drag sideways to
 * scroll, up/down to zoom; click a device to jump there; double-click to fit
 * everything.
 */
function ChainMinimap({
  scrollRef,
  contentRef,
  zoom,
  onZoom,
  layoutKey,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  onZoom: (zoom: number) => void;
  layoutKey: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Metrics>({
    scrollLeft: 0,
    clientWidth: 1,
    scrollWidth: 1,
    blocks: [],
  });
  const anchor = useRef<number | null>(null);

  // Measure device and section positions in scroll coordinates.
  const measure = useCallback(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const origin = scroller.getBoundingClientRect().left - scroller.scrollLeft;
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - origin, width: r.width };
    };
    const blocks = [
      ...content.querySelectorAll<HTMLElement>("[data-device]"),
    ].map((el) => ({
      label: el.dataset.device ?? "",
      ...rect(el),
      groups: [...el.querySelectorAll<HTMLElement>("[data-group]")].map(
        (g) => ({
          label: g.dataset.group ?? "",
          ...rect(g),
        }),
      ),
    }));
    setM({
      scrollLeft: scroller.scrollLeft,
      clientWidth: scroller.clientWidth,
      scrollWidth: scroller.scrollWidth,
      blocks,
    });
  }, [scrollRef, contentRef]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    ro.observe(content);
    scroller.addEventListener("scroll", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scroller.removeEventListener("scroll", schedule);
    };
  }, [scrollRef, contentRef, measure, layoutKey]);

  // After a zoom, keep the same spot in the middle of the view.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || anchor.current === null) return;
    scroller.scrollLeft =
      anchor.current * scroller.scrollWidth - scroller.clientWidth / 2;
    anchor.current = null;
    measure();
  }, [zoom, scrollRef, measure]);

  const mapW = mapRef.current?.clientWidth ?? 1;
  const scale = mapW / Math.max(m.scrollWidth, 1);

  const zoomTo = (next: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const clamped = Math.min(1.5, Math.max(0.35, next));
    if (clamped === zoom) return;
    anchor.current =
      (scroller.scrollLeft + scroller.clientWidth / 2) / scroller.scrollWidth;
    onZoom(clamped);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollRef.current;
    if (e.button !== 0 || !scroller) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const viewLeft = scroller.scrollLeft * scale;
    const viewW = scroller.clientWidth * scale;
    if (x < viewLeft || x > viewLeft + viewW) {
      // Clicked outside the view box: jump there first, then drag from it.
      scroller.scrollLeft = x / scale - scroller.clientWidth / 2;
    }
    let lastX = e.clientX;
    let lastY = e.clientY;
    let currentZoom = zoom;
    const target = e.currentTarget;
    const move = (ev: PointerEvent) => {
      // Recompute the scale each move: zooming mid-drag changes the scroll width.
      const liveScale = target.clientWidth / Math.max(scroller.scrollWidth, 1);
      scroller.scrollLeft += (ev.clientX - lastX) / liveScale;
      const dy = ev.clientY - lastY;
      if (Math.abs(dy) > 0) {
        // Drag down to zoom in, up to zoom out.
        currentZoom = Math.min(
          1.5,
          Math.max(0.35, currentZoom * Math.exp(dy * 0.01)),
        );
        zoomTo(currentZoom);
      }
      lastX = ev.clientX;
      lastY = ev.clientY;
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const fit = () => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    // The content's own width, not the scroller's, which is never smaller than the view.
    const natural = content.getBoundingClientRect().width / zoom;
    zoomTo(Math.min(1, scroller.clientWidth / natural));
  };

  return (
    <div
      ref={mapRef}
      role="scrollbar"
      aria-label="Device overview"
      aria-orientation="horizontal"
      aria-valuenow={Math.round(m.scrollLeft)}
      title="Drag to scroll, drag up/down to zoom, double-click to fit"
      className="relative h-9 shrink-0 cursor-grab touch-none overflow-hidden border-b border-zinc-950 bg-zinc-950/50 active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onDoubleClick={fit}
      onWheel={(e) => {
        const scroller = scrollRef.current;
        if (scroller) scroller.scrollLeft += e.deltaX || e.deltaY;
      }}
    >
      {m.blocks.map((b, i) => (
        <div
          key={i}
          className="absolute top-1.5 bottom-1.5 overflow-hidden rounded-sm bg-zinc-700/80"
          style={{ left: b.left * scale, width: Math.max(2, b.width * scale) }}
        >
          <div className="truncate px-1 text-[9px] leading-3 text-zinc-200">
            {b.label}
          </div>
          {b.groups.map((g, j) => (
            <div
              key={j}
              title={g.label}
              className="absolute bottom-0.5 h-1.5 rounded-[1px] bg-zinc-400/50"
              style={{
                left: (g.left - b.left) * scale,
                width: Math.max(1, g.width * scale - 1),
              }}
            />
          ))}
        </div>
      ))}
      <div
        className="pointer-events-none absolute top-0.5 bottom-0.5 rounded-sm border border-amber-400/80 bg-amber-400/10"
        style={{
          left: m.scrollLeft * scale,
          width: Math.max(4, m.clientWidth * scale),
        }}
      />
    </div>
  );
}
