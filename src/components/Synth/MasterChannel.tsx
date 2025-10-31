import { useState, useCallback, useEffect, useRef } from "react";

type MasterChannelProps = {
  onGainChange: (gain: number) => void;
  onEQChange: (eq: { low: number; mid: number; high: number }) => void;
  getMeterLevel: () => number;
};

export function MasterChannel({
  onGainChange,
  onEQChange,
  getMeterLevel,
}: MasterChannelProps) {
  const [gain, setGain] = useState(0);
  const [eq, setEQ] = useState({ low: 0, mid: 0, high: 0 });
  const [showEQ, setShowEQ] = useState(false);
  const [meterLevel, setMeterLevel] = useState(-60);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    onGainChange(0);
    onEQChange({ low: 0, mid: 0, high: 0 });
  }, [onGainChange, onEQChange]);

  useEffect(() => {
    let lastTime = performance.now();
    const targetFPS = 30;
    const frameTime = 1000 / targetFPS;

    const updateMeter = (currentTime: number) => {
      const elapsed = currentTime - lastTime;

      if (elapsed >= frameTime) {
        const level = getMeterLevel();
        setMeterLevel(level);
        lastTime = currentTime - (elapsed % frameTime);
      }

      animationFrameRef.current = requestAnimationFrame(updateMeter);
    };

    animationFrameRef.current = requestAnimationFrame(updateMeter);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [getMeterLevel]);

  const handleGainChange = useCallback(
    (value: number) => {
      setGain(value);
      onGainChange(value);
    },
    [onGainChange],
  );

  const handleEQChange = useCallback(
    (band: "low" | "mid" | "high", value: number) => {
      const newEQ = { ...eq, [band]: value };
      setEQ(newEQ);
      onEQChange(newEQ);
    },
    [eq, onEQChange],
  );

  const dbToHeight = (db: number) => {
    const normalizedDb = Math.max(-60, Math.min(12, db));
    return ((normalizedDb + 60) / 72) * 100;
  };

  const getMeterColor = (db: number) => {
    if (db > 0) return "bg-red-500";
    if (db > -3) return "bg-orange-500";
    if (db > -12) return "bg-yellow-400";
    return "bg-green-500";
  };

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
      <h2 className="mb-4 text-lg font-semibold text-zinc-800">
        Master Channel
      </h2>

      <div className="flex gap-6">
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-medium text-zinc-600">Level</span>

          <div className="relative h-48 w-12 rounded-lg bg-zinc-900 border border-zinc-300">
            <div className="absolute inset-0 flex flex-col justify-end p-1">
              <div
                className={`w-full rounded transition-colors duration-100 ${getMeterColor(meterLevel)}`}
                style={{
                  height: `${dbToHeight(meterLevel)}%`,
                  transition: "height 0.05s linear",
                }}
              />
            </div>

            <div className="absolute inset-0 flex flex-col justify-between py-2 px-1 pointer-events-none">
              {[12, 6, 0, -6, -12, -24, -40].map((db) => (
                <div key={db} className="flex items-center">
                  <div className="h-px w-1 bg-zinc-400" />
                  {db === 0 && (
                    <div className="h-px w-full bg-red-400 absolute left-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <span className="text-sm font-mono text-zinc-700 min-w-[4.5rem] text-center">
            {meterLevel > -59 ? (
              <>
                {meterLevel > 0 ? "+" : ""}
                {meterLevel.toFixed(1)} dB
              </>
            ) : (
              <>-∞ dB</>
            )}
          </span>
        </div>

        <div className="flex-1 flex flex-col gap-3">
          <div className="space-y-2">
            <label
              htmlFor="master-gain"
              className="text-xs font-medium text-zinc-600"
            >
              Master Gain
            </label>
            <div className="flex items-center gap-2">
              <input
                id="master-gain"
                type="range"
                min="-24"
                max="12"
                step="0.5"
                value={gain}
                onChange={(e) => handleGainChange(Number(e.target.value))}
                className="flex-1 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-800"
              />
              <span className="text-xs font-mono text-zinc-700 min-w-[3.5rem] text-right">
                {gain > 0 ? "+" : ""}
                {gain.toFixed(1)} dB
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowEQ(!showEQ)}
            className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg border border-zinc-300 transition-colors"
          >
            {showEQ ? "Hide" : "Show"} EQ
          </button>

          {showEQ && (
            <div className="space-y-4 pt-2">
              <h3 className="text-sm font-semibold text-zinc-700">3-Band EQ</h3>
              <p className="text-xs text-zinc-500">
                Low Shelf · Mid Bell · High Shelf
              </p>

              {[
                { key: "low" as const, label: "Low", freq: "< 250 Hz" },
                { key: "mid" as const, label: "Mid", freq: "250 Hz - 4 kHz" },
                { key: "high" as const, label: "High", freq: "> 4 kHz" },
              ].map(({ key, label, freq }) => (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-zinc-600">
                      {label} <span className="text-zinc-400">({freq})</span>
                    </span>
                    <span className="text-xs font-mono text-zinc-700 min-w-[3rem] text-right">
                      {eq[key] > 0 ? "+" : ""}
                      {eq[key].toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={eq[key]}
                    onChange={(e) =>
                      handleEQChange(key, Number(e.target.value))
                    }
                    className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-800"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
