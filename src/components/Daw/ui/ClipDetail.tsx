import { ClipBar } from "./ClipBar";
import { PianoRoll } from "./PianoRoll";
import { StepGrid } from "./StepGrid";
import type { WorkspaceView } from "./workspace";

/** The selected clip's editor: its bar, then the step grid or piano roll. */
export function ClipDetail({ ws }: { ws: WorkspaceView }) {
  const { track, clipId, kit, pad, view, grid } = ws;
  if (!track || !clipId) {
    return (
      <div className="flex h-60 flex-1 items-center justify-center px-4 text-center text-zinc-500">
        {track
          ? "Empty slot. Double-click it to create a clip."
          : "Add a track to start."}
      </div>
    );
  }
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <ClipBar
        clipId={clipId}
        grid={grid}
        onGridChange={ws.setGrid}
        view={view}
        onViewChange={kit ? ws.actions.setView : undefined}
        padName={view === "steps" ? pad?.name : undefined}
      />
      {view === "steps" ? (
        <div className="min-h-0 flex-1 overflow-y-auto pt-2 pb-3">
          <StepGrid
            trackId={track.id}
            clipId={clipId}
            grid={grid}
            selectedPadId={pad?.id ?? null}
            onSelectPad={ws.actions.selectPad}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <PianoRoll
            key={clipId}
            trackId={track.id}
            clipId={clipId}
            grid={grid}
            labels={ws.padLabels}
            editorRef={ws.editorRef}
          />
        </div>
      )}
    </main>
  );
}
