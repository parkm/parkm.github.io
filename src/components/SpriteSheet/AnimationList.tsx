import { useState } from "react";
import type { Animation } from "./types";

type AnimationListProps = {
  animations: Animation[];
  selectedAnimationId: string | null;
  onSelectAnimation: (id: string | null) => void;
  onCreateAnimation: (name: string) => void;
  onDeleteAnimation: (id: string) => void;
  onRenameAnimation: (id: string, newName: string) => void;
};

export function AnimationList({
  animations,
  selectedAnimationId,
  onSelectAnimation,
  onCreateAnimation,
  onDeleteAnimation,
  onRenameAnimation,
}: AnimationListProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newAnimationName, setNewAnimationName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleCreate = () => {
    if (newAnimationName.trim()) {
      onCreateAnimation(newAnimationName.trim());
      setNewAnimationName("");
      setIsCreating(false);
    }
  };

  const handleRename = (id: string) => {
    if (editingName.trim()) {
      onRenameAnimation(id, editingName.trim());
      setEditingId(null);
      setEditingName("");
    }
  };

  const startEditing = (animation: Animation) => {
    setEditingId(animation.id);
    setEditingName(animation.name);
  };

  return (
    <div className="w-64 border-r border-zinc-200 dark:border-zinc-800 h-full flex flex-col bg-white dark:bg-zinc-950">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Animations
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
          Create and manage animations
        </p>
      </div>

      <div className="flex-1 overflow-auto p-2 min-h-0">
        <div className="space-y-1">
          {animations.map((animation) => (
            <div
              key={animation.id}
              className={`group relative rounded-lg transition-colors ${
                selectedAnimationId === animation.id
                  ? "bg-blue-100 dark:bg-blue-900/30"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
              }`}
            >
              {editingId === animation.id ? (
                <div className="p-2 flex gap-1 items-center">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleRename(animation.id);
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                        setEditingName("");
                      }
                    }}
                    onBlur={() => handleRename(animation.id)}
                    autoFocus
                    className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-blue-500 dark:border-blue-400 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>
              ) : (
                <div className="w-full p-2 flex items-center gap-2">
                  <button
                    onClick={() => {
                      onSelectAnimation(
                        selectedAnimationId === animation.id
                          ? null
                          : animation.id,
                      );
                    }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {animation.name}
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {animation.frameIndices.length} frame
                      {animation.frameIndices.length !== 1 ? "s" : ""}
                    </div>
                  </button>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(animation);
                      }}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                      title="Rename"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete animation "${animation.name}"?`)) {
                          onDeleteAnimation(animation.id);
                        }
                      }}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                      title="Delete"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-2 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        {isCreating ? (
          <div className="flex gap-1 items-center">
            <input
              type="text"
              value={newAnimationName}
              onChange={(e) => setNewAnimationName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreate();
                } else if (e.key === "Escape") {
                  setIsCreating(false);
                  setNewAnimationName("");
                }
              }}
              placeholder="Animation name"
              autoFocus
              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-blue-500 dark:border-blue-400 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none"
            />
            <button
              onClick={handleCreate}
              className="px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium flex-shrink-0"
            >
              ✓
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewAnimationName("");
              }}
              className="px-3 py-2 rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300 text-sm font-medium flex-shrink-0"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Animation
          </button>
        )}
      </div>
    </div>
  );
}
