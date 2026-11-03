# DAW

Browser DAW at `/daw`. Session view, clips and scenes, synth drums, two synths,
effects, capture, and export, built on raw Web Audio.

## Layers

```
model/     The document: plain data (types.ts), pure edits (ops.ts, sessionOps.ts,
           deviceOps.ts), and an undoable store (store.ts). No audio, no React.
engine/    Audio. engine.ts builds the graph for a document and follows it by
           reference diffing; transport.ts schedules notes ahead of time;
           session.ts owns the AudioContext, clip launching, recording, capture.
           Instruments and effects implement DeviceInstance (devices.ts).
commands/  Every user action, defined once (see below).
export/    WAV and MIDI encoders and downloads.
ui/        React. Components read the document with useDoc(selector) and change
           it with store.update(op). Anything animating with playback (playheads,
           meters) writes to the DOM from onFrame, not React state.
```

Rules that keep it simple:

- **The document is the truth.** Audio and UI follow it. Undo is free:
  `store.update` records history; wrap drags in `store.begin()` / `store.end()`
  so a whole gesture is one step.
- **Edits are pure functions** in `model/` returning a new `Project` (or the
  same one if nothing changed). Test them without a browser.
- **The engine never touches a global AudioContext.** The same code renders
  offline for export.
- **Timing is in ticks** (960 per quarter). Seconds only exist in the scheduler.

## Commands

`commands/` holds every action: shortcuts, toolbar buttons, context menus and
the command menu (⌘K) all run the same definitions.

```ts
{
  id: "clip.halveLoop",          // stable; buttons refer to it
  group: "Clip",                 // heading in the command menu
  title: "Halve loop",           // or (ctx) => string
  keys: ["mod+shift+h"],         // optional shortcuts
  scope: "detail",               // shortcut only while that half has focus
  keywords: ["/2", "shorter"],   // extra search words
  when: (ctx) => !!ctx.clip,     // applies here? (hidden + shortcut free if not)
  enabled: (ctx) => …,           // can run now? (shown disabled if not)
  run: (ctx) => ctx.store.update((d) => halveClip(d, ctx.clip!.id, PPQ)),
}
```

To add an action: write the edit in `model/` if it changes the document, add a
command to the matching list (`transport.ts`, `session.ts`, `clip.ts`,
`notes.ts`, `view.ts`), and it's in the command menu with its shortcut. To put
it on screen, use `useCommandButton(id)` for a button or `useCommand(id)` for
anything custom.

Shortcut conflicts resolve by order in `registry.ts`: the first command that
applies wins, so contextual lists (notes, drums) come before general ones.

The piano roll publishes a `NoteEditor` (selection, quantize, copy…) for note
commands to call; it doesn't handle keys itself. Playing notes from the
computer keyboard isn't a command: `ui/keyboard.ts` runs commands first and
passes the rest to the pads or piano.

## Layouts

`Daw.tsx` (Workspace) owns UI state and commands and hands layouts a
`WorkspaceView` (`ui/workspace.ts`). Layouts only arrange panels:

- `WideLayout` — session grid over a detail panel (clip editor or devices).
- `PhoneLayout` (under 768 px) — one panel at a time from a bottom tab bar
  (Session · Clip · Devices · Mixer) plus a Play sheet of pads or keys. The
  open tab sets `focus` and `detail`, so commands behave as on desktop, and
  the ⌘K menu reaches everything the toolbars can't fit.

Shared pieces: `ClipDetail`, `TrackMixer` (session columns and `MixerView`),
`PlaySheet` (touch input that records and feeds Capture like the keyboard).
Editors take one-finger edits; `useTwoFingerGestures` adds pan and pinch and
cancels the first finger's edit with `store.cancel()`.

## Adding a device

- **Effect:** add an entry to `EFFECTS` in `engine/effects.ts` with its params
  (`ParamDef`) and a `build` that wires native nodes between `input` and
  `output`. The device panel, bypass, dry/wet and reordering come for free.
- **Instrument:** add a device type in `model/types.ts`, implement
  `DeviceInstance` (`noteOn`, `noteOff`, `cancel`, `update`), and register it in
  `engine/devices.ts`. A front-end over an existing engine (like the Quick
  Synth over the Synth) only needs a param translation.

## Persistence

Projects autosave to localStorage and can be saved as JSON. Adding a document
field: make it optional or fill it in `migrate()` (`model/persist.ts`) so older
saved projects keep loading.
