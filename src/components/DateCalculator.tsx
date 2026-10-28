import { useState } from "react";
import { DateTime, Interval } from "luxon";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { NuqsAdapter } from "nuqs/adapters/react";

const MODES = ["add", "between"] as const;
const UNITS = ["years", "months", "weeks", "days", "hours", "minutes"] as const;
type Unit = (typeof UNITS)[number];
const TIME_UNITS: Unit[] = ["hours", "minutes"];

const PRESETS: { label: string; amounts: Partial<Record<Unit, number>> }[] = [
  { label: "1 week", amounts: { weeks: 1 } },
  { label: "2 weeks", amounts: { weeks: 2 } },
  { label: "30 days", amounts: { days: 30 } },
  { label: "90 days", amounts: { days: 90 } },
  { label: "6 months", amounts: { months: 6 } },
  { label: "1 year", amounts: { years: 1 } },
];

const FORMAT = "yyyy-MM-dd'T'HH:mm";
const now = () => DateTime.now().set({ second: 0, millisecond: 0 });
const parse = (value: string) => DateTime.fromFormat(value, FORMAT);
const isWeekend = (date: DateTime) => date.weekday > 5;

const plural = (n: number, unit: string) =>
  `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${
    n === 1 ? unit.replace(/s$/, "") : unit
  }`;

const round = (n: number) => Math.round(n * 10) / 10;

function addBusinessDays(date: DateTime, days: number) {
  const step = Math.sign(days);
  let result = date;
  for (let left = Math.abs(days); left > 0; ) {
    result = result.plus({ days: step });
    if (!isWeekend(result)) left--;
  }
  return result;
}

function weekdaysBetween(start: DateTime, end: DateTime) {
  let count = 0;
  for (
    let day = start.startOf("day");
    day < end.startOf("day") && count < 1e6;
    day = day.plus({ days: 1 })
  ) {
    if (!isWeekend(day)) count++;
  }
  return count;
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="dc-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

function Segmented<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="dc-segmented">
      <legend className="dc-sr-only">{label}</legend>
      {options.map(([option, text]) => (
        <label key={option}>
          <input
            type="radio"
            name={name}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span>{text}</span>
        </label>
      ))}
    </fieldset>
  );
}

function DateField({
  id,
  label,
  value,
  withTime,
  onChange,
}: {
  id: string;
  label: string;
  value: DateTime;
  withTime: boolean;
  /** null means "now", which is what the Today/Now button sets. */
  onChange: (value: DateTime | null) => void;
}) {
  return (
    <div className="dc-field">
      <label htmlFor={id}>{label}</label>
      <div className="dc-date">
        <input
          id={id}
          type={withTime ? "datetime-local" : "date"}
          value={value.toFormat(withTime ? FORMAT : "yyyy-MM-dd")}
          onChange={(e) => {
            const next = withTime
              ? parse(e.target.value)
              : DateTime.fromISO(e.target.value).set({
                  hour: value.hour,
                  minute: value.minute,
                });
            if (next.isValid) onChange(next);
          }}
        />
        <button type="button" onClick={() => onChange(null)}>
          {withTime ? "Now" : "Today"}
        </button>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="dc-copy"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// Everything lives in the URL so a calculation can be shared or bookmarked.
// Values at their defaults are left out, and a missing date means "now".
const queryParsers = {
  mode: parseAsStringLiteral(MODES).withDefault("add"),
  time: parseAsBoolean.withDefault(false),
  from: parseAsString,
  to: parseAsString,
  subtract: parseAsBoolean.withDefault(false),
  business: parseAsBoolean.withDefault(false),
  units: parseAsArrayOf(parseAsStringLiteral(UNITS)).withDefault([
    "years",
    "months",
    "days",
  ]),
  inclusive: parseAsBoolean.withDefault(false),
  years: parseAsInteger,
  months: parseAsInteger,
  weeks: parseAsInteger,
  days: parseAsInteger,
  hours: parseAsInteger,
  minutes: parseAsInteger,
} as const;

const fromQuery = (value: string | null, fallback: DateTime) => {
  const date = value ? DateTime.fromISO(value) : null;
  return date?.isValid ? date : fallback;
};

const Calculator = () => {
  const [query, setQuery] = useQueryStates(queryParsers);
  const [loadedAt] = useState(now);
  const { mode, time: withTime, subtract, units } = query;
  const businessDays = query.business;
  const includeEnd = query.inclusive;
  const amounts: Record<Unit, number | null> = query;

  const start = fromQuery(query.from, loadedAt);
  const end = fromQuery(query.to, loadedAt.plus({ months: 1 }));

  const toQuery = (date: DateTime | null) =>
    date && (withTime ? date.toFormat(FORMAT) : date.toISODate());
  const setStart = (date: DateTime | null) => setQuery({ from: toQuery(date) });
  const setEnd = (date: DateTime | null) => setQuery({ to: toQuery(date) });

  const visibleUnits = withTime
    ? [...UNITS]
    : UNITS.filter((u) => !TIME_UNITS.includes(u));

  const added = (() => {
    const sign = subtract ? -1 : 1;
    const n = (unit: Unit) =>
      withTime || !TIME_UNITS.includes(unit) ? (amounts[unit] ?? 0) * sign : 0;

    let date = start.plus({
      years: n("years"),
      months: n("months"),
      weeks: n("weeks"),
    });
    date = businessDays
      ? addBusinessDays(date, n("days"))
      : date.plus({ days: n("days") });
    return date.plus({ hours: n("hours"), minutes: n("minutes") });
  })();

  const between = (() => {
    const earlier = end < start;
    let [a, b] = earlier ? [end, start] : [start, end];
    if (!withTime) [a, b] = [a.startOf("day"), b.startOf("day")];
    if (includeEnd && !withTime) b = b.plus({ days: 1 });

    const chosen = visibleUnits.filter((u) => units.includes(u));
    const breakdown = chosen.length ? chosen : (["days"] as Unit[]);
    const parts = b.diff(a, breakdown).toObject();
    const text = breakdown
      .map((unit) => [unit, round(parts[unit] ?? 0)] as const)
      .filter(([, n]) => n)
      .map(([unit, n]) => plural(n, unit))
      .join(", ");

    const span = Interval.fromDateTimes(a, b);
    return {
      earlier,
      text: text || (withTime ? "Same moment" : "Same day"),
      days: round(span.length("days")),
      weeks: round(span.length("weeks")),
      hours: round(span.length("hours")),
      weekdays: weekdaysBetween(a, b),
    };
  })();

  const setPreset = (preset: Partial<Record<Unit, number>>) =>
    setQuery(Object.fromEntries(UNITS.map((u) => [u, preset[u] ?? null])));

  const toggleUnit = (unit: Unit) =>
    setQuery({
      units: units.includes(unit)
        ? units.filter((u) => u !== unit)
        : [...units, unit],
    });

  const addedText = withTime
    ? `${added.toLocaleString(DateTime.DATE_HUGE)}, ${added.toLocaleString(DateTime.TIME_SIMPLE)}`
    : added.toLocaleString(DateTime.DATE_HUGE);

  return (
    <div className="dc">
      <h1>Date calculator</h1>

      <div className="dc-top">
        <Segmented
          name="mode"
          label="Mode"
          value={mode}
          options={[
            ["add", "Add or subtract"],
            ["between", "Between dates"],
          ]}
          onChange={(mode) => setQuery({ mode })}
        />
        <Toggle checked={withTime} onChange={(time) => setQuery({ time })}>
          Include time
        </Toggle>
      </div>

      {mode === "add" ? (
        <div className="dc-inputs">
          <DateField
            id="start"
            label="From"
            value={start}
            withTime={withTime}
            onChange={setStart}
          />

          <div className="dc-amounts">
            <Segmented
              name="direction"
              label="Direction"
              value={subtract ? "subtract" : "add"}
              options={[
                ["add", "Add"],
                ["subtract", "Subtract"],
              ]}
              onChange={(v) => setQuery({ subtract: v === "subtract" })}
            />

            <div className="dc-chips" role="group" aria-label="Quick amounts">
              {PRESETS.map(({ label, amounts }) => (
                <button
                  key={label}
                  type="button"
                  className="dc-chip"
                  onClick={() => setPreset(amounts)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="dc-amount-grid">
              {visibleUnits.map((unit) => (
                <div key={unit} className="dc-amount">
                  <input
                    id={`amount-${unit}`}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="0"
                    value={amounts[unit] ?? ""}
                    onChange={(e) =>
                      setQuery({
                        [unit]:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                  <label htmlFor={`amount-${unit}`}>
                    {unit === "days" && businessDays ? "business days" : unit}
                  </label>
                </div>
              ))}
            </div>

            <Toggle
              checked={businessDays}
              onChange={(business) => setQuery({ business })}
            >
              Count days as business days (skip weekends)
            </Toggle>
          </div>
        </div>
      ) : (
        <div className="dc-inputs">
          <div className="dc-range">
            <DateField
              id="start"
              label="Start"
              value={start}
              withTime={withTime}
              onChange={setStart}
            />
            <button
              type="button"
              className="dc-swap"
              aria-label="Swap start and end"
              onClick={() => {
                setQuery({ from: toQuery(end), to: toQuery(start) });
              }}
            >
              ⇅
            </button>
            <DateField
              id="end"
              label="End"
              value={end}
              withTime={withTime}
              onChange={setEnd}
            />
          </div>

          <fieldset className="dc-units">
            <legend>Show the difference in</legend>
            <div className="dc-chips">
              {visibleUnits.map((unit) => (
                <label key={unit} className="dc-chip">
                  <input
                    type="checkbox"
                    checked={units.includes(unit)}
                    onChange={() => toggleUnit(unit)}
                  />
                  <span>{unit}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {!withTime && (
            <Toggle
              checked={includeEnd}
              onChange={(inclusive) => setQuery({ inclusive })}
            >
              Include the end date
            </Toggle>
          )}
        </div>
      )}

      <section className="dc-result" aria-live="polite">
        {mode === "add" ? (
          <>
            <div className="dc-answer-row">
              <p className="dc-answer">{addedText}</p>
              <CopyButton text={addedText} />
            </div>
            <p className="dc-sub">
              {withTime
                ? added.toRelative({ base: now() })
                : added.toRelativeCalendar({ base: now() })}
            </p>
            <dl>
              <div>
                <dt>Week</dt>
                <dd>{added.weekNumber}</dd>
              </div>
              <div>
                <dt>Day of year</dt>
                <dd>{added.ordinal}</dd>
              </div>
              <div className="dc-wide">
                <dt>ISO 8601</dt>
                <dd>
                  {withTime
                    ? added.toISO({ suppressMilliseconds: true })
                    : added.toISODate()}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <div className="dc-answer-row">
              <p className="dc-answer">{between.text}</p>
              <CopyButton text={between.text} />
            </div>
            {between.earlier && (
              <p className="dc-sub">The end is before the start.</p>
            )}
            <dl>
              <div>
                <dt>Days</dt>
                <dd>{between.days.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Weeks</dt>
                <dd>{between.weeks.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Weekdays</dt>
                <dd>{between.weekdays.toLocaleString()}</dd>
              </div>
              {withTime && (
                <div>
                  <dt>Hours</dt>
                  <dd>{between.hours.toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </>
        )}
      </section>
    </div>
  );
};

export const DateCalculator = () => (
  <NuqsAdapter>
    <Calculator />
  </NuqsAdapter>
);
