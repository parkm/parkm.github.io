import { useEffect } from "react";
import {
  useQueryState,
  parseAsFloat,
  parseAsInteger,
  createParser,
} from "nuqs";
import { NuqsAdapter } from "nuqs/adapters/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { initAudio, stopAllNotes, setVolume } from "./piano/synth";
import { KeyboardSection } from "./KeyboardSection";

type KeyboardData = {
  id: number;
  label: string;
  keys: string[];
};

const keyboardArrayParser = createParser({
  parse: (value: string) => {
    try {
      const decoded = atob(value);
      return JSON.parse(decoded) as KeyboardData[];
    } catch {
      return [{ id: 0, label: "", keys: [] }];
    }
  },
  serialize: (value: KeyboardData[]) => btoa(JSON.stringify(value)),
}).withDefault([{ id: 0, label: "", keys: [] }]);

function KeyboardsContent() {
  const [sections, setSections] = useQueryState(
    "sections",
    keyboardArrayParser,
  );
  const [globalVolume, setGlobalVolume] = useQueryState(
    "vol",
    parseAsFloat.withDefault(0.1),
  );
  const [globalOctaves, setGlobalOctaves] = useQueryState(
    "octaves",
    parseAsInteger.withDefault(3),
  );
  const [globalStartOctave, setGlobalStartOctave] = useQueryState(
    "start",
    parseAsInteger.withDefault(3),
  );

  useEffect(() => {
    initAudio();
    setVolume(globalVolume);
    return stopAllNotes;
    // Initialize audio on mount, no deps since it should only run once
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setVolume(globalVolume);
  }, [globalVolume]);

  const addSection = () =>
    setSections((s) => [
      ...s,
      { id: Math.max(...s.map((k) => k.id)) + 1, label: "", keys: [] },
    ]);

  const addKeyboardAfter = (id: number) => {
    setSections((prevSections) => {
      const index = prevSections.findIndex((section) => section.id === id);
      if (index === -1) return prevSections;

      const newSections = [...prevSections];
      const newId = Math.max(...prevSections.map((k) => k.id)) + 1;
      newSections.splice(index + 1, 0, { id: newId, label: "", keys: [] });
      return newSections;
    });
  };

  const removeKeyboard = (id: number) => {
    setSections((prevSections) => {
      if (prevSections.length <= 1) return prevSections;
      return prevSections.filter((section) => section.id !== id);
    });
  };

  const updateKeyboard = (id: number, label: string, keys: string[]) => {
    setSections((prevSections) =>
      prevSections.map((section) =>
        section.id === id ? { ...section, label, keys } : section,
      ),
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSections((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
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
          <div className="flex items-center">
            <label
              htmlFor="globalOctaves"
              className="mr-1 text-[9px] font-medium text-gray-300"
            >
              Octaves:
            </label>
            <input
              id="globalOctaves"
              type="number"
              min="1"
              max="7"
              value={globalOctaves}
              onChange={(e) =>
                setGlobalOctaves(
                  Math.max(1, Math.min(7, parseInt(e.target.value) || 1)),
                )
              }
              className="p-0.5 border border-gray-600 rounded w-10 text-xs text-center h-5 bg-gray-700 text-white"
            />
          </div>
          <div className="flex items-center">
            <label
              htmlFor="globalStartOctave"
              className="mr-1 text-[9px] font-medium text-gray-300"
            >
              Start:
            </label>
            <input
              id="globalStartOctave"
              type="number"
              min="0"
              max="8"
              value={globalStartOctave}
              onChange={(e) =>
                setGlobalStartOctave(
                  Math.max(0, Math.min(8, parseInt(e.target.value) || 4)),
                )
              }
              className="p-0.5 border border-gray-600 rounded w-10 text-xs text-center h-5 bg-gray-700 text-white"
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid grid-cols-1 gap-2">
            {sections.map((section) => (
              <KeyboardSection
                key={section.id}
                id={section.id}
                label={section.label}
                markedKeys={section.keys}
                octaves={globalOctaves}
                startOctave={globalStartOctave}
                onAdd={addKeyboardAfter}
                onRemove={removeKeyboard}
                onUpdate={updateKeyboard}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function Keyboards() {
  return (
    <NuqsAdapter>
      <KeyboardsContent />
    </NuqsAdapter>
  );
}
