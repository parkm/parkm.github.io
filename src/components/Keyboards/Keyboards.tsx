import { useState, useEffect } from "react";
import { initAudio, stopAllNotes } from "./piano/synth";
import { KeyboardSection } from "./KeyboardSection";

export function Keyboards() {
  const [sections, setSections] = useState([0]);

  useEffect(() => {
    initAudio();
    return stopAllNotes;
  }, []);

  const addSection = () => setSections((s) => [...s, s.length]);

  return (
    <div className="keyboards-container p-4 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Piano Keyboards</h1>
        <button
          onClick={addSection}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full flex items-center"
        >
          <span className="text-xl mr-1">+</span> Add Keyboard
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sections.map((id) => (
          <KeyboardSection key={id} />
        ))}
      </div>
    </div>
  );
}
