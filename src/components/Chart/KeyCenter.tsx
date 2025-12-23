import { Play, Pause, ChevronUp, ChevronDown, RotateCcw } from "lucide-react";
import { PianoCanvas } from "./PianoCanvas";

type KeyCenterProps = {
  lastKeyPlayed: string;
  activeKey: string | null;
  onKeyPress: (note: string, octave: number) => void;
  onKeyRelease: () => void;
  isTonePlaying: boolean;
  onTonePlayToggle: () => void;
  baseFrequency: number;
  onBaseFrequencyChange: (freq: number) => void;
};

export function KeyCenter({
  lastKeyPlayed,
  activeKey,
  onKeyPress,
  onKeyRelease,
  isTonePlaying,
  onTonePlayToggle,
  baseFrequency,
  onBaseFrequencyChange,
}: KeyCenterProps) {
  const incrementFrequency = () => {
    if (baseFrequency < 480) {
      onBaseFrequencyChange(baseFrequency + 1);
    }
  };

  const decrementFrequency = () => {
    if (baseFrequency > 400) {
      onBaseFrequencyChange(baseFrequency - 1);
    }
  };

  const resetFrequency = () => {
    onBaseFrequencyChange(440);
  };

  return (
    <div className="w-full">
      <div className="mx-auto max-w-[640px]">
        <div className="border-x border-blue-400/15 bg-gradient-to-br from-blue-500/8 to-blue-600/6 shadow-[0_8px_32px_rgba(59,130,246,0.15)] overflow-hidden backdrop-blur-sm">
          <div className="px-5 py-6 border-b border-blue-400/10">
            <div className="text-[12px] uppercase tracking-[0.18em] text-blue-200/60 mb-3">
              Tone Center
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl font-bold text-white h-10 flex items-center flex-1">
                {lastKeyPlayed || "—"}
              </div>
              {lastKeyPlayed && (
                <button
                  onClick={onTonePlayToggle}
                  className="h-10 w-10 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/20 flex items-center justify-center transition-colors"
                  aria-label={isTonePlaying ? "Pause tone" : "Play tone"}
                >
                  {isTonePlaying ? (
                    <Pause className="h-5 w-5 text-blue-200" />
                  ) : (
                    <Play className="h-5 w-5 text-blue-200" />
                  )}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[11px] uppercase tracking-[0.15em] text-blue-200/50">
                A =
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={incrementFrequency}
                    className="h-7 w-9 rounded-t bg-blue-500/15 hover:bg-blue-500/25 active:bg-blue-500/35 border border-blue-400/20 flex items-center justify-center transition-colors touch-manipulation"
                    aria-label="Increase frequency"
                  >
                    <ChevronUp className="h-4 w-4 text-blue-200/70" />
                  </button>
                  <button
                    onClick={decrementFrequency}
                    className="h-7 w-9 rounded-b bg-blue-500/15 hover:bg-blue-500/25 active:bg-blue-500/35 border border-blue-400/20 flex items-center justify-center transition-colors touch-manipulation"
                    aria-label="Decrease frequency"
                  >
                    <ChevronDown className="h-4 w-4 text-blue-200/70" />
                  </button>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-semibold text-white tabular-nums">
                      {baseFrequency}
                    </span>
                    <span className="text-[10px] text-blue-200/50">Hz</span>
                  </div>
                  {baseFrequency !== 440 && (
                    <div
                      className={`text-[10px] font-medium tabular-nums ${
                        baseFrequency > 440
                          ? "text-emerald-400/80"
                          : "text-orange-400/80"
                      }`}
                    >
                      {baseFrequency > 440 ? "+" : ""}
                      {baseFrequency - 440}
                    </div>
                  )}
                </div>
                <button
                  onClick={resetFrequency}
                  className="h-8 w-8 rounded bg-blue-500/15 hover:bg-blue-500/25 active:bg-blue-500/35 border border-blue-400/20 flex items-center justify-center transition-colors touch-manipulation"
                  aria-label="Reset to 440 Hz"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-blue-200/70" />
                </button>
              </div>
            </div>
          </div>

          <div className="px-5 py-5 flex justify-center">
            <PianoCanvas
              activeKey={activeKey}
              onKeyPress={onKeyPress}
              onKeyRelease={onKeyRelease}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
