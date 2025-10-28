type ToolbarProps = {
  onLoadImage: () => void;
  resetView: () => void;
  hasImage: boolean;
};

export function Toolbar({ onLoadImage, resetView, hasImage }: ToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 p-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={onLoadImage}
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium text-zinc-900 dark:text-zinc-100 transition-colors"
        >
          Load Image
        </button>

        <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <kbd className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono">
            Drag
          </kbd>
          <span>pan canvas</span>
          <span className="mx-1 text-zinc-400 dark:text-zinc-600">·</span>
          <kbd className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono">
            Drag Grid
          </kbd>
          <span>move grid</span>
          <span className="mx-1 text-zinc-400 dark:text-zinc-600">·</span>
          <kbd className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono">
            Wheel
          </kbd>
          <span>zoom</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={resetView}
          className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium text-zinc-900 dark:text-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!hasImage}
          title="Center & fit image"
        >
          Reset View
        </button>
      </div>
    </div>
  );
}
