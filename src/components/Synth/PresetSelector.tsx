import { PRESETS, type SynthPreset } from "./presets/index";
import { sharpRowControls, whiteRowControls } from "./KeyPiano";

type PresetSelectorProps = {
  currentPresetId: string;
  onPresetChange: (presetId: string) => void;
  disabled?: boolean;
};

export function PresetSelector({
  currentPresetId,
  onPresetChange,
  disabled = false,
}: PresetSelectorProps) {
  const presetList = Object.values(PRESETS);
  const pianoKeys = new Set([
    ...sharpRowControls.map((k) => k.toLowerCase()),
    ...whiteRowControls.map((k) => k.toLowerCase()),
  ]);

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="preset-select"
        className="text-xs font-medium text-zinc-600"
      >
        Synth Preset
      </label>
      <select
        id="preset-select"
        value={currentPresetId}
        onChange={(e) => onPresetChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
        onKeyDown={(e) => {
          if (pianoKeys.has(e.key.toLowerCase())) {
            e.preventDefault();
          }
        }}
      >
        {presetList.map((preset: SynthPreset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-zinc-500">
        {PRESETS[currentPresetId]?.description}
      </p>
    </div>
  );
}
