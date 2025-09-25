import { useState } from "react";
import { DateTime, Duration } from "luxon";

type Operation = "add" | "diff";
type DurationUnit = "years" | "months" | "days" | "hours" | "minutes";

interface DateResult {
  type: "date";
  label: string;
  iso: string | null;
  locale: string;
}

interface DiffResult {
  type: "diff";
  diff: Record<string, number>;
}

type Result = DateResult | DiffResult | null;

const durationFields: DurationUnit[] = [
  "years",
  "months",
  "days",
  "hours",
  "minutes",
];

export const DateCalculator = () => {
  const [baseDate, setBaseDate] = useState<string>(
    DateTime.now().toISO({ suppressMilliseconds: true }) ?? "",
  );
  const [operation, setOperation] = useState<Operation>("add");
  const [secondDate, setSecondDate] = useState<string>("");
  const [duration, setDuration] = useState<Record<DurationUnit, number>>({
    years: 0,
    months: 0,
    days: 0,
    hours: 0,
    minutes: 0,
  });
  const [granularity, setGranularity] = useState<DurationUnit[]>([
    ...durationFields,
  ]);
  const [result, setResult] = useState<Result>(null);

  const inputClasses =
    "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";

  const labelClasses =
    "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2";

  const buttonClasses =
    "px-6 py-2.5 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";

  const primaryButtonClasses = `${buttonClasses} bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md focus:ring-blue-500`;

  const secondaryButtonClasses = `${buttonClasses} bg-gray-600 hover:bg-gray-700 text-white shadow-sm hover:shadow-md focus:ring-gray-500`;

  const handleDurationChange = (field: DurationUnit, value: string) => {
    const numericValue = Number(value);
    setDuration({
      ...duration,
      [field]: isNaN(numericValue) ? 0 : numericValue,
    });
  };

  const setBaseToNow = () => {
    setBaseDate(DateTime.now().toISO({ suppressMilliseconds: true }) ?? "");
  };

  const setSecondToNow = () => {
    setSecondDate(DateTime.now().toISO({ suppressMilliseconds: true }) ?? "");
  };

  const handleGranularityChange = (value: DurationUnit) => {
    setGranularity((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value],
    );
  };

  const calculate = () => {
    const fallbackIso =
      DateTime.now().toISO({ suppressMilliseconds: true }) ?? "";
    const dt1 = DateTime.fromISO(baseDate || fallbackIso);

    if (operation === "add") {
      const dur = Duration.fromObject(duration);
      const newDate = dt1.plus(dur);
      setResult({
        type: "date",
        label: newDate.toFormat("yyyy LLL dd, HH:mm"),
        iso: newDate.toISO(),
        locale: newDate.setLocale("en").toLocaleString(DateTime.DATETIME_FULL),
      });
    }

    if (operation === "diff") {
      if (!secondDate) {
        alert("Please enter a second date");
        return;
      }
      const dt2 = DateTime.fromISO(secondDate);
      const diff = dt2.diff(dt1, granularity).toObject();
      setResult({
        type: "diff",
        diff: diff as Record<string, number>,
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <header className="text-center border-b border-gray-200 dark:border-gray-700 pb-6">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Date & Time Calculator
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Calculate date differences and add durations with precision
        </p>
      </header>

      <div className="space-y-6">
        <div>
          <label htmlFor="base-date" className={labelClasses}>
            Base Date &amp; Time
          </label>
          <div className="flex gap-3">
            <input
              id="base-date"
              type="datetime-local"
              value={baseDate.slice(0, 16)}
              onChange={(e) => setBaseDate(e.target.value)}
              className={`${inputClasses} flex-1`}
            />
            <button
              type="button"
              onClick={setBaseToNow}
              className={secondaryButtonClasses}
            >
              Now
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="operation" className={labelClasses}>
            Operation Type
          </label>
          <select
            id="operation"
            value={operation}
            onChange={(e) => setOperation(e.target.value as Operation)}
            className={inputClasses}
          >
            <option value="add">Add Duration to Date</option>
            <option value="diff">Calculate Difference Between Dates</option>
          </select>
        </div>

        {operation === "add" && (
          <div>
            <label className={labelClasses} htmlFor="duration-years">
              Duration to Add
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {durationFields.map((field) => (
                <div key={field}>
                  <label
                    htmlFor={`duration-${field}`}
                    className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 capitalize"
                  >
                    {field}
                  </label>
                  <input
                    id={`duration-${field}`}
                    type="number"
                    value={duration[field]}
                    onChange={(e) =>
                      handleDurationChange(field, e.target.value)
                    }
                    className={inputClasses}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {operation === "diff" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="second-date" className={labelClasses}>
                Second Date &amp; Time
              </label>
              <div className="flex gap-3">
                <input
                  id="second-date"
                  type="datetime-local"
                  value={secondDate ? secondDate.slice(0, 16) : ""}
                  onChange={(e) => setSecondDate(e.target.value)}
                  className={`${inputClasses} flex-1`}
                />
                <button
                  type="button"
                  onClick={setSecondToNow}
                  className={secondaryButtonClasses}
                >
                  Now
                </button>
              </div>
            </div>

            <div>
              <label className={labelClasses}>Granularity</label>
              <div className="flex flex-wrap gap-3">
                {durationFields.map((g) => (
                  <label
                    key={g}
                    htmlFor={`granularity-${g}`}
                    className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <input
                      id={`granularity-${g}`}
                      type="checkbox"
                      checked={granularity.includes(g)}
                      onChange={() => handleGranularityChange(g)}
                    />
                    <span className="capitalize">{g}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={calculate}
          className={`${primaryButtonClasses} w-full py-3 text-lg font-semibold`}
        >
          Calculate Result
        </button>

        {result && (
          <div className="rounded-lg p-6 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            {result.type === "date" && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Calculated Date
                </h3>
                <div className="grid gap-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-600">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Formatted Date:
                    </span>
                    <span className="text-gray-900 dark:text-gray-100 font-mono">
                      {result.label}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-600">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      ISO Format:
                    </span>
                    <span className="text-gray-900 dark:text-gray-100 font-mono text-sm">
                      {result.iso}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Full Locale:
                    </span>
                    <span className="text-gray-900 dark:text-gray-100 text-sm">
                      {result.locale}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {result.type === "diff" && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Time Difference
                </h3>
                <div className="bg-gray-900 rounded-md p-4">
                  <pre className="text-green-400 text-sm overflow-x-auto">
                    {JSON.stringify(result.diff, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
