import { useState, useEffect } from "react";
import { initAudio, stopAllNotes, setVolume } from "./piano/synth";
import { KeyboardSection } from "./KeyboardSection";

export function Keyboards() {
  const [sections, setSections] = useState([0]);
  const [globalVolume, setGlobalVolume] = useState(0.1);

  useEffect(() => {
    initAudio();
    setVolume(globalVolume);
    return stopAllNotes;
    // Initialize audio on mount, no deps since it should only run once
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setVolume(globalVolume);
  }, [globalVolume]);

  const addSection = () => setSections((s) => [...s, s.length]);

  const addKeyboardAfter = (id: number) => {
    setSections((prevSections) => {
      const index = prevSections.findIndex((sectionId) => sectionId === id);
      if (index === -1) return prevSections;

      // Create a new array with a new ID inserted after the current one
      const newSections = [...prevSections];
      // Use the max existing ID + 1 to ensure uniqueness
      const newId = Math.max(...prevSections) + 1;
      newSections.splice(index + 1, 0, newId);
      return newSections;
    });
  };

  const removeKeyboard = (id: number) => {
    setSections((prevSections) => {
      // Don't remove if it's the last keyboard
      if (prevSections.length <= 1) return prevSections;
      return prevSections.filter((sectionId) => sectionId !== id);
    });
  };

  return (
    <div className="keyboards-container p-1 bg-gray-900 min-h-screen">
      <div className="sticky top-0 z-10 bg-gray-800 p-2 rounded-lg shadow-lg mb-2 flex flex-wrap items-center gap-1">
        <h1 className="text-base font-bold flex-shrink-0 text-white">
          Piano Keyboards
        </h1>
        <div className="flex flex-wrap items-center gap-1 ml-auto">
          <div className="flex items-center">
            <label
              htmlFor="globalVolume"
              className="mr-1 text-[9px] font-medium text-gray-300"
            >
              Vol:
            </label>
            <input
              id="globalVolume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={globalVolume}
              onChange={(e) => setGlobalVolume(parseFloat(e.target.value))}
              className="w-16 accent-indigo-500 h-3"
            />
          </div>
          <button
            onClick={addSection}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-[9px] flex items-center transition-colors duration-200"
          >
            <span className="mr-0.5">+</span> Add
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {sections.map((id) => (
          <KeyboardSection
            key={id}
            id={id}
            onAdd={addKeyboardAfter}
            onRemove={removeKeyboard}
          />
        ))}
      </div>
    </div>
  );
}
