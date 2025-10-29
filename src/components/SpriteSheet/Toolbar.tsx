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
