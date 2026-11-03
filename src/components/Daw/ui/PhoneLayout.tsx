import {
  Grid3x3,
  Music,
  Piano,
  SlidersHorizontal,
  SlidersVertical,
} from "lucide-react";
import { ClipDetail } from "./ClipDetail";
import { DeviceChain } from "./DevicePanel";
import { MixerView } from "./MixerView";
import { PlaySheet } from "./PlaySheet";
import { SessionView } from "./SessionView";
import { TransportBar } from "./TransportBar";
import type { WorkspaceView } from "./workspace";

/** The phone's panels, one at a time. */
export type PhoneTab = "session" | "clip" | "devices" | "mixer";

const TABS: [PhoneTab, string, typeof Music][] = [
  ["session", "Session", Grid3x3],
  ["clip", "Clip", Music],
  ["devices", "Devices", SlidersHorizontal],
  ["mixer", "Mixer", SlidersVertical],
];

/**
 * Phones: one panel at a time, switched from a bottom tab bar, with a Play
 * sheet (pads or piano) that pulls up over it. Every feature is still
 * reachable: the transport scrolls sideways and the command menu holds the rest.
 */
export function PhoneLayout({
  ws,
  tab,
  setTab,
  playOpen,
  setPlayOpen,
}: {
  ws: WorkspaceView;
  tab: PhoneTab;
  setTab: (tab: PhoneTab) => void;
  playOpen: boolean;
  setPlayOpen: (open: boolean) => void;
}) {
  const { track, scene } = ws;
  return (
    <div className="flex h-dvh touch-manipulation flex-col overflow-hidden bg-zinc-900 text-[13px] text-zinc-300 select-none">
      <TransportBar />
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "session" && (
          <SessionView
            selection={track ? { trackId: track.id, scene } : null}
            onSelect={ws.actions.select}
            onSelectTrack={ws.actions.selectTrack}
            onOpen={ws.openClip}
            rename={ws.rename}
            size="large"
            showMixer={false}
          />
        )}
        {tab === "clip" && <ClipDetail ws={ws} />}
        {tab === "devices" && track && (
          <DeviceChain
            trackId={track.id}
            selectedPadId={ws.pad?.id ?? null}
            onSelectPad={ws.actions.selectPad}
            grid={ws.grid}
          />
        )}
        {tab === "mixer" && <MixerView />}
      </div>
      {playOpen && track && (
        <PlaySheet
          track={track}
          grid={ws.grid}
          octave={ws.octave}
          setOctave={ws.setOctave}
        />
      )}
      <nav
        aria-label="Panels"
        className="flex shrink-0 border-t border-zinc-950 bg-zinc-800 pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
              tab === id ? "text-amber-300" : "text-zinc-400"
            }`}
            onClick={() => setTab(id)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={playOpen}
          aria-label="Play pads or keys"
          className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
            playOpen ? "bg-amber-400 text-zinc-900" : "text-zinc-400"
          }`}
          onClick={() => setPlayOpen(!playOpen)}
        >
          <Piano size={18} />
          Play
        </button>
      </nav>
    </div>
  );
}
