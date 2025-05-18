import { useState, useEffect } from "react";
import { setVolume, stopAllNotes } from "./piano/synth";
import { PianoKeyboard } from "./piano/Keyboard";

export function KeyboardSection() {
  const [octaves, setOctaves] = useState(3);
  const [startOctave, setStartOctave] = useState(4);
  const [volume, setVolumeState] = useState(0.5);

  useEffect(() => stopAllNotes, []);

  return (
    <div className="keyboard-section bg-white p-4 rounded-lg shadow-md">
      <div className="settings mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center">
          <label htmlFor="octaves" className="mr-2 text-sm font-medium">
            Octaves:
          </label>
          <input
            id="octaves"
            type="number"
            min="1"
            max="7"
            value={octaves}
            onChange={(e) =>
              setOctaves(
                Math.max(1, Math.min(7, parseInt(e.target.value) || 1)),
              )
            }
            className="w-16 p-1 border border-gray-300 rounded text-center"
          />
        </div>
        <div className="flex items-center">
          <label htmlFor="startOctave" className="mr-2 text-sm font-medium">
            Start Octave:
          </label>
          <input
            id="startOctave"
            type="number"
            min="0"
            max="8"
            value={startOctave}
            onChange={(e) =>
              setStartOctave(
                Math.max(0, Math.min(8, parseInt(e.target.value) || 4)),
              )
            }
            className="w-16 p-1 border border-gray-300 rounded text-center"
          />
        </div>
        <div className="flex items-center">
          <label htmlFor="volume" className="mr-2 text-sm font-medium">
            Volume:
          </label>
          <input
            id="volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolumeState(v);
              setVolume(v);
            }}
            className="w-32 accent-blue-500"
          />
        </div>
      </div>
      <PianoKeyboard octaves={octaves} startOctave={startOctave} />
    </div>
  );
}
