import { Plus, ChevronLeft, ChevronRight, X } from "lucide-react";

export type FormBar = {
  id: string;
  note: string;
  duration: number;
};

type FormCenterProps = {
  lastKeyPlayed: string;
  mode: "bass" | "harmony";
  onModeChange: (mode: "bass" | "harmony") => void;
  bars: FormBar[];
  onBarsChange: (bars: FormBar[]) => void;
};

let barIdCounter = 0;

export function FormCenter({
  lastKeyPlayed,
  mode,
  onModeChange,
  bars,
  onBarsChange,
}: FormCenterProps) {
  const addBar = () => {
    if (!lastKeyPlayed) {
      return;
    }

    const newBar: FormBar = {
      id: `bar-${++barIdCounter}`,
      note: lastKeyPlayed,
      duration: 1,
    };
    const newBars = [...bars, newBar];
    onBarsChange(newBars);
  };

  const handleAddBarClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addBar();
  };

  const updateBarDuration = (id: string, delta: number) => {
    onBarsChange(
      bars.map((bar) => {
        if (bar.id === id) {
          const newDuration = Math.max(
            0.25,
            Math.min(64, bar.duration + delta),
          );
          return { ...bar, duration: newDuration };
        }
        return bar;
      }),
    );
  };

  const moveBarLeft = (index: number) => {
    if (index === 0) return;
    const newBars = [...bars];
    [newBars[index - 1], newBars[index]] = [newBars[index], newBars[index - 1]];
    onBarsChange(newBars);
  };

  const moveBarRight = (index: number) => {
    if (index === bars.length - 1) return;
    const newBars = [...bars];
    [newBars[index], newBars[index + 1]] = [newBars[index + 1], newBars[index]];
    onBarsChange(newBars);
  };

  const deleteBar = (id: string) => {
    onBarsChange(bars.filter((bar) => bar.id !== id));
  };

  const formatDuration = (duration: number) => {
    if (duration === 1) return "1 bar";
    if (duration < 1) return `${duration} bar`;
    return `${duration} bars`;
  };

  return (
    <div className="w-full">
      <div className="mx-auto max-w-[640px]">
        <div className="rounded-b-[28px] border-x border-b border-purple-400/15 bg-gradient-to-br from-purple-500/8 to-purple-600/6 shadow-[0_8px_32px_rgba(168,85,247,0.15)] overflow-hidden backdrop-blur-sm">
          <div className="px-5 py-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {mode === "bass" && lastKeyPlayed && (
                  <button
                    onClick={handleAddBarClick}
                    className="h-10 w-10 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 active:bg-purple-500/40 border border-purple-400/20 flex items-center justify-center transition-colors touch-manipulation select-none relative z-10"
                    aria-label="Add bar"
                    type="button"
                  >
                    <Plus className="h-5 w-5 text-purple-200 pointer-events-none" />
                  </button>
                )}
                <div className="text-[12px] uppercase tracking-[0.18em] text-purple-200/60">
                  Form Center
                </div>
              </div>
              <div className="flex gap-1 bg-purple-500/10 rounded-lg p-1 border border-purple-400/20">
                <button
                  onClick={() => onModeChange("bass")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                    mode === "bass"
                      ? "bg-purple-500/30 text-white"
                      : "text-purple-200/60 hover:text-purple-200/80"
                  }`}
                >
                  Bass
                </button>
                <button
                  onClick={() => onModeChange("harmony")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                    mode === "harmony"
                      ? "bg-purple-500/30 text-white"
                      : "text-purple-200/60 hover:text-purple-200/80"
                  }`}
                >
                  Harmony
                </button>
              </div>
            </div>

            {bars.length === 0 ? (
              <div className="text-center py-8 text-purple-200/40 text-sm">
                {mode === "bass"
                  ? "Play a key and click + to add bars"
                  : "Harmony mode coming soon"}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {bars.map((bar, index) => (
                  <div
                    key={index}
                    data-bar-id={bar.id}
                    className="group relative select-none rounded-lg border border-purple-400/20 bg-purple-500/10"
                  >
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xl font-bold text-white">
                          {bar.note}
                        </div>
                        <button
                          onClick={() => deleteBar(bar.id)}
                          type="button"
                          className="h-6 w-6 rounded bg-red-500/20 hover:bg-red-500/30 active:bg-red-500/40 border border-red-400/20 flex items-center justify-center transition-colors touch-manipulation"
                          aria-label="Delete bar"
                        >
                          <X className="h-4 w-4 text-red-200" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => updateBarDuration(bar.id, -0.25)}
                          disabled={bar.duration <= 0.25}
                          type="button"
                          className="h-6 w-6 rounded bg-purple-500/20 hover:bg-purple-500/30 active:bg-purple-500/40 disabled:opacity-30 disabled:cursor-not-allowed border border-purple-400/20 flex items-center justify-center text-purple-200 text-xs font-bold transition-colors touch-manipulation select-none"
                        >
                          −
                        </button>
                        <div className="text-xs text-purple-200/70 min-w-[60px] text-center pointer-events-none">
                          {formatDuration(bar.duration)}
                        </div>
                        <button
                          onClick={() => updateBarDuration(bar.id, 0.25)}
                          disabled={bar.duration >= 64}
                          type="button"
                          className="h-6 w-6 rounded bg-purple-500/20 hover:bg-purple-500/30 active:bg-purple-500/40 disabled:opacity-30 disabled:cursor-not-allowed border border-purple-400/20 flex items-center justify-center text-purple-200 text-xs font-bold transition-colors touch-manipulation select-none"
                        >
                          +
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {index > 0 && (
                          <button
                            onClick={() => moveBarLeft(index)}
                            type="button"
                            className="h-7 px-2 rounded bg-purple-500/20 hover:bg-purple-500/30 active:bg-purple-500/40 border border-purple-400/20 flex items-center justify-center transition-colors touch-manipulation"
                            aria-label="Move left"
                          >
                            <ChevronLeft className="h-4 w-4 text-purple-200" />
                          </button>
                        )}
                        {index < bars.length - 1 && (
                          <button
                            onClick={() => moveBarRight(index)}
                            type="button"
                            className="h-7 px-2 rounded bg-purple-500/20 hover:bg-purple-500/30 active:bg-purple-500/40 border border-purple-400/20 flex items-center justify-center transition-colors touch-manipulation"
                            aria-label="Move right"
                          >
                            <ChevronRight className="h-4 w-4 text-purple-200" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
