import { Music, SlidersHorizontal } from "lucide-react";
import type { DetailMode, FocusArea } from "../commands/types";
import { ClipDetail } from "./ClipDetail";
import { DeviceChain } from "./DevicePanel";
import { noteName } from "./PianoRoll";
import { SessionView } from "./SessionView";
import { TransportBar } from "./TransportBar";
import type { WorkspaceView } from "./workspace";

/**
 * Desktop and tablet: session grid on top, the detail panel (clip editor or
 * device chain) below, like Live.
 */
export function WideLayout({
  ws,
  detail,
  setFocus,
}: {
  ws: WorkspaceView;
  detail: DetailMode;
  setFocus: (focus: FocusArea) => void;
}) {
  const { track, scene, kit, octave } = ws;
  return (
    <div className="flex h-dvh touch-manipulation flex-col overflow-hidden bg-zinc-900 text-[13px] text-zinc-300 select-none">
      <TransportBar />
      <section
        aria-label="Session"
        className="flex min-h-0 flex-1"
        onPointerDownCapture={() => setFocus("session")}
      >
        <SessionView
          selection={track ? { trackId: track.id, scene } : null}
          onSelect={ws.actions.select}
          onSelectTrack={ws.actions.selectTrack}
          onOpen={ws.openClip}
          rename={ws.rename}
        />
      </section>
      <section
        aria-label="Detail"
        className="flex h-[436px] shrink-0 border-t-4 border-zinc-950"
        onPointerDownCapture={() => setFocus("detail")}
      >
        <nav className="flex w-8 shrink-0 flex-col items-center gap-1 border-r border-zinc-950 bg-zinc-800/60 py-2">
          {(
            [
              ["clip", "Clip", Music],
              ["devices", "Devices", SlidersHorizontal],
            ] as const
          ).map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              title={`${label} (⇧Tab)`}
              aria-label={label}
              aria-pressed={detail === mode}
              className={`flex h-7 w-7 items-center justify-center rounded ${
                detail === mode
                  ? "bg-zinc-600 text-zinc-50"
                  : "text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
              onClick={() => ws.actions.setDetail(mode)}
            >
              <Icon size={14} />
            </button>
          ))}
        </nav>
        {detail === "devices" && track ? (
          <DeviceChain
            trackId={track.id}
            selectedPadId={ws.pad?.id ?? null}
            onSelectPad={ws.actions.selectPad}
            grid={ws.grid}
          />
        ) : (
          <ClipDetail ws={ws} />
        )}
      </section>
      <footer className="shrink-0 border-t border-zinc-950 px-3 py-1 text-[11px] text-zinc-500">
        <span className="text-zinc-400">⌘K all commands</span> ·{" "}
        {kit
          ? "A–L play pads"
          : `A–; play notes from ${noteName((octave + 1) * 12)} · Z/X octave`}{" "}
        · R record · C capture · hold Q to scrub · Space play/stop · Session:
        Enter launch, arrows move · Piano roll: B select/draw, double-click add,
        ⌥-drag copy, right-click for more, ⇧Z fit
      </footer>
    </div>
  );
}
