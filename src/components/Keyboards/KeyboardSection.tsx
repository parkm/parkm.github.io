import { useState, useEffect, useMemo } from "react";
import { Chord } from "tonal";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { stopAllNotes, playNote } from "./piano/synth";
import { PianoKeyboard } from "./piano/Keyboard";

export function KeyboardSection({
  id,
  label,
  markedKeys,
  octaves,
  startOctave,
  onAdd,
  onRemove,
  onUpdate,
}: {
  id: number;
  label: string;
  markedKeys: string[];
  octaves: number;
  startOctave: number;
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, label: string, keys: string[]) => void;
}) {
  const [optionsCollapsed, setOptionsCollapsed] = useState(true);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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

  const playChord = (keys: string[], duration = 200) => {
    stopAllNotes();
    keys.forEach((key) => {
      const match = key.match(/([A-G]#?)(\d+)/);
      if (match) {
        const [, note, octave] = match;
        playNote(note, parseInt(octave));
      }
    });

    setTimeout(() => {
      stopAllNotes();
    }, duration);
  };

  const sortKeysByPitch = (keys: string[]) => {
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

    return [...keys].sort((a, b) => {
      const matchA = a.match(/([A-G]#?)(\d+)/);
      const matchB = b.match(/([A-G]#?)(\d+)/);
      if (!matchA || !matchB) return 0;

      const octaveA = parseInt(matchA[2]);
      const octaveB = parseInt(matchB[2]);

      if (octaveA !== octaveB) return octaveA - octaveB;

      return noteOrder[matchA[1]] - noteOrder[matchB[1]];
    });
  };

  const applyLeftInversion = () => {
    if (markedKeys.length <= 1) return;

    const sortedKeys = sortKeysByPitch(markedKeys);
    const highestNote = sortedKeys[sortedKeys.length - 1];

    const match = highestNote.match(/([A-G]#?)(\d+)/);
    if (!match) return;

    const [, note, octave] = match;
    const newNote = `${note}${parseInt(octave) - 1}`;

    const newMarkedKeys = sortedKeys.slice(0, -1);
    newMarkedKeys.unshift(newNote);

    onUpdate(id, label, newMarkedKeys);
    playChord(newMarkedKeys);
  };

  const applyRightInversion = () => {
    if (markedKeys.length <= 1) return;

    const sortedKeys = sortKeysByPitch(markedKeys);
    const lowestNote = sortedKeys[0];

    const match = lowestNote.match(/([A-G]#?)(\d+)/);
    if (!match) return;

    const [, note, octave] = match;
    const newNote = `${note}${parseInt(octave) + 1}`;

    const newMarkedKeys = sortedKeys.slice(1);
    newMarkedKeys.push(newNote);

    onUpdate(id, label, newMarkedKeys);
    playChord(newMarkedKeys);
  };

  const chordNamePlaceholder = useMemo(() => {
    if (markedKeys.length === 0) return "Label";

    const sortedKeys = sortKeysByPitch(markedKeys);

    const notes = sortedKeys
      .map((key) => {
        const match = key.match(/([A-G]#?)(\d+)/);
        return match ? match[1] : null;
      })
      .filter((note): note is string => note !== null);

    const uniqueNotes = Array.from(new Set(notes));
    if (uniqueNotes.length === 0) return "Unknown";

    const detectedChords = Chord.detect(notes);
    return detectedChords.length > 0
      ? detectedChords[0]
      : uniqueNotes.join(" ");
  }, [markedKeys]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="keyboard-section bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-700"
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Drag to reorder"
        >
          ⋮⋮
        </button>
        <input
          id="label"
          type="text"
          value={label}
          onChange={(e) => onUpdate(id, e.target.value, markedKeys)}
          className="p-1 border border-gray-600 rounded h-[26px] font-medium text-base flex-1 max-w-[200px] bg-gray-700 text-white placeholder-gray-400 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-500 focus:outline-none"
          placeholder={chordNamePlaceholder}
        />
      </div>

      <div className="flex flex-row gap-0">
        <div className="flex-grow flex overflow-hidden rounded-md bg-gray-900">
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

            <div className="flex mb-1">
              <button
                onClick={clearMarkedKeys}
                className="flex items-center justify-center w-full h-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs transition-colors duration-200"
                title="Clear all marked keys"
              >
                Clear
              </button>
            </div>

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

        <button
          onClick={() => setOptionsCollapsed(!optionsCollapsed)}
          className="flex-shrink-0 flex items-center justify-center px-1 bg-gradient-to-b from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-gray-300 border-l border-gray-700 transition-all duration-200"
          aria-label={optionsCollapsed ? "Expand options" : "Collapse options"}
        >
          <div className="flex items-center justify-center rounded-full w-5 h-5 bg-gray-900 shadow-sm">
            {optionsCollapsed ? "→" : "←"}
          </div>
        </button>

        {!optionsCollapsed && (
          <div className="flex-shrink-0 w-auto max-w-xs px-2 border-l border-gray-700 bg-gray-800">
            <div className="flex flex-row flex-wrap gap-1 items-start">
              {markedKeys.length > 0 && (
                <div className="marked-keys-display p-1 border border-gray-600 rounded bg-gray-700 text-[9px] flex-shrink-0 max-w-[100px] self-end flex items-center">
                  <p className="font-medium text-gray-300">
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
