import { useState, useEffect } from "react";
import { stopAllNotes, playNote } from "./piano/synth";
import { PianoKeyboard } from "./piano/Keyboard";

export function KeyboardSection({
  id,
  label,
  markedKeys,
  onAdd,
  onRemove,
  onUpdate,
}: {
  id: number;
  label: string;
  markedKeys: string[];
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, label: string, keys: string[]) => void;
}) {
  const [octaves, setOctaves] = useState(3);
  const [startOctave, setStartOctave] = useState(3);
  const [optionsCollapsed, setOptionsCollapsed] = useState(true);

  useEffect(() => stopAllNotes, []);

  const handleKeyClick = (key: string) => {
    const newKeys = markedKeys.includes(key)
      ? markedKeys.filter((k) => k !== key)
      : [...markedKeys, key];
    onUpdate(id, label, newKeys);
  };

  const clearMarkedKeys = () => {
    onUpdate(id, label, []);
  };

  const [isPlaying, setIsPlaying] = useState(false);

  const startPlaying = () => {
    if (isPlaying || markedKeys.length === 0) return;
    setIsPlaying(true);
    markedKeys.forEach((key) => {
      const match = key.match(/([A-G]#?)(\d+)/);
      if (match) {
        const [_, note, octave] = match;
        playNote(note, parseInt(octave));
      }
    });
  };

  const stopPlaying = () => {
    if (!isPlaying) return;
    setIsPlaying(false);
    stopAllNotes();
  };

  const applyLeftInversion = () => {
    if (markedKeys.length <= 1) return;

    // Sort notes by pitch
    const sortedKeys = [...markedKeys].sort((a, b) => {
      const matchA = a.match(/([A-G]#?)(\d+)/);
      const matchB = b.match(/([A-G]#?)(\d+)/);
      if (!matchA || !matchB) return 0;

      const octaveA = parseInt(matchA[2]);
      const octaveB = parseInt(matchB[2]);

      if (octaveA !== octaveB) return octaveA - octaveB;

      // Same octave, compare notes (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
      const noteOrder: Record<string, number> = {
        C: 0,
        "C#": 1,
        D: 2,
        "D#": 3,
        E: 4,
        F: 5,
        "F#": 6,
        G: 7,
        "G#": 8,
        A: 9,
        "A#": 10,
        B: 11,
      };
      return noteOrder[matchA[1]] - noteOrder[matchB[1]];
    });

    // Get the highest note
    const highestNote = sortedKeys[sortedKeys.length - 1];

    // Extract octave and note
    const match = highestNote.match(/([A-G]#?)(\d+)/);
    if (!match) return;

    const [_, note, octave] = match;
    const newOctave = parseInt(octave) - 1;

    // Create the inverted note (highest note moved down an octave)
    const newNote = `${note}${newOctave}`;

    // Create the new chord with rotation
    const newMarkedKeys = sortedKeys.slice(0, -1);
    newMarkedKeys.unshift(newNote);

    onUpdate(id, label, newMarkedKeys);
  };

  const applyRightInversion = () => {
    if (markedKeys.length <= 1) return;

    // Sort notes by pitch
    const sortedKeys = [...markedKeys].sort((a, b) => {
      const matchA = a.match(/([A-G]#?)(\d+)/);
      const matchB = b.match(/([A-G]#?)(\d+)/);
      if (!matchA || !matchB) return 0;

      const octaveA = parseInt(matchA[2]);
      const octaveB = parseInt(matchB[2]);

      if (octaveA !== octaveB) return octaveA - octaveB;

      // Same octave, compare notes (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
      const noteOrder: Record<string, number> = {
        C: 0,
        "C#": 1,
        D: 2,
        "D#": 3,
        E: 4,
        F: 5,
        "F#": 6,
        G: 7,
        "G#": 8,
        A: 9,
        "A#": 10,
        B: 11,
      };
      return noteOrder[matchA[1]] - noteOrder[matchB[1]];
    });

    // Get the lowest note
    const lowestNote = sortedKeys[0];

    // Extract octave and note
    const match = lowestNote.match(/([A-G]#?)(\d+)/);
    if (!match) return;

    const [_, note, octave] = match;
    const newOctave = parseInt(octave) + 1;

    // Create the inverted note (lowest note moved up an octave)
    const newNote = `${note}${newOctave}`;

    // Create the new chord with rotation
    const newMarkedKeys = sortedKeys.slice(1);
    newMarkedKeys.push(newNote);

    onUpdate(id, label, newMarkedKeys);
  };

  return (
    <div className="keyboard-section bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-700">
      {/* Label input moved above keyboard */}
      <div className="mb-2">
        <input
          id="label"
          type="text"
          value={label}
          onChange={(e) => onUpdate(id, e.target.value, markedKeys)}
          className="p-1 border border-gray-600 rounded h-[26px] font-medium text-base w-full max-w-[200px] bg-gray-700 text-white placeholder-gray-400 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-500 focus:outline-none"
          placeholder="Label"
        />
      </div>

      <div className="flex flex-row gap-0">
        {/* Container for keyboard and label */}
        <div className="flex-grow flex overflow-hidden rounded-md bg-gray-900">
          {/* Piano Section - Scrollable */}
          <div className="overflow-x-auto">
            <PianoKeyboard
              octaves={octaves}
              startOctave={startOctave}
              onKeyClick={handleKeyClick}
              markedKeys={markedKeys}
              scale={0.6}
            />
          </div>

          <div className="flex flex-col border-l border-gray-700 pl-1 pr-1 min-w-[82px] justify-end">
            {/* Play button */}
            <div className="flex mb-1">
              <button
                onPointerDown={startPlaying}
                onPointerUp={stopPlaying}
                onPointerLeave={stopPlaying}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    startPlaying();
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    stopPlaying();
                  }
                }}
                className="flex items-center justify-center w-full h-5 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                title="Hold to play all marked keys as a chord"
                disabled={markedKeys.length === 0}
              >
                Play
              </button>
            </div>

            {/* Clear button */}
            <div className="flex mb-1">
              <button
                onClick={clearMarkedKeys}
                className="flex items-center justify-center w-full h-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs transition-colors duration-200"
                title="Clear all marked keys"
              >
                Clear
              </button>
            </div>

            {/* Inversion buttons */}
            <div className="flex mb-1">
              <button
                onClick={applyLeftInversion}
                className="flex items-center justify-center w-[40px] h-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-l text-xs transition-colors duration-200"
                title="Move highest note down an octave"
              >
                ↓
              </button>
              <button
                onClick={applyRightInversion}
                className="flex items-center justify-center w-[40px] h-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-r text-xs transition-colors duration-200"
                title="Move lowest note up an octave"
              >
                ↑
              </button>
            </div>

            {/* Add and Remove buttons */}
            <div className="flex">
              <button
                onClick={() => onAdd(id)}
                className="flex items-center justify-center w-[40px] h-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-l text-xs transition-colors duration-200"
                title="Add keyboard after this one"
              >
                +
              </button>
              <button
                onClick={() => onRemove(id)}
                className="flex items-center justify-center w-[40px] h-5 bg-red-600 hover:bg-red-700 text-white rounded-r text-xs transition-colors duration-200"
                title="Remove this keyboard"
              >
                -
              </button>
            </div>
          </div>
        </div>

        {/* Collapse Button */}
        <button
          onClick={() => setOptionsCollapsed(!optionsCollapsed)}
          className="flex-shrink-0 flex items-center justify-center px-1 bg-gradient-to-b from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-gray-300 border-l border-gray-700 transition-all duration-200"
          aria-label={optionsCollapsed ? "Expand options" : "Collapse options"}
        >
          <div className="flex items-center justify-center rounded-full w-5 h-5 bg-gray-900 shadow-sm">
            {optionsCollapsed ? "→" : "←"}
          </div>
        </button>

        {/* Controls Section */}
        {!optionsCollapsed && (
          <div className="flex-shrink-0 w-auto max-w-xs px-2 border-l border-gray-700 bg-gray-800">
            <div className="flex flex-row flex-wrap gap-1 items-start">
              <div className="min-w-[60px] flex-grow-0">
                <label
                  htmlFor="octaves"
                  className="text-[9px] font-medium block text-gray-300"
                >
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
                  className="p-0.5 border border-gray-600 rounded w-full text-xs text-center h-[22px] bg-gray-700 text-white"
                />
              </div>

              <div className="min-w-[60px] flex-grow-0">
                <label
                  htmlFor="startOctave"
                  className="text-[9px] font-medium block text-gray-300"
                >
                  Start:
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
                  className="p-0.5 border border-gray-600 rounded w-full text-xs text-center h-[22px] bg-gray-700 text-white"
                />
              </div>

              {markedKeys.length > 0 && (
                <div className="marked-keys-display p-1 border border-gray-600 rounded bg-gray-700 text-[9px] flex-shrink-0 max-w-[100px] overflow-hidden self-end h-[22px] flex items-center">
                  <p className="font-medium truncate text-gray-300">
                    {markedKeys.join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
