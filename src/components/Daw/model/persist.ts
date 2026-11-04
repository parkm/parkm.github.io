import { createScene, SCENE_COUNT, trackHue } from "./defaults";
import { PPQ } from "./time";
import type { Store } from "./store";
import type { Project } from "./types";

const KEY = "daw:project";

export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseProject(raw) : null;
  } catch {
    return null;
  }
}

/** Read a saved project (localStorage or a file). Null if it isn't one. */
export function parseProject(raw: string): Project | null {
  try {
    const doc = JSON.parse(raw) as Project;
    if (doc?.version !== 1 || !Array.isArray(doc.tracks) || !doc.clips)
      return null;
    return migrate(doc);
  } catch {
    return null;
  }
}

export const serializeProject = (doc: Project) => JSON.stringify(doc, null, 1);

/** Save the document shortly after it stops changing. Returns an unsubscribe. */
export function autosave(store: Store<Project>, delay = 400) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    timer = undefined;
    try {
      localStorage.setItem(KEY, JSON.stringify(store.get()));
    } catch {
      // Storage full or blocked; the session keeps working.
    }
  };
  const unsubscribe = store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(save, delay);
  });
  window.addEventListener("pagehide", save);
  return () => {
    unsubscribe();
    window.removeEventListener("pagehide", save);
    if (timer !== undefined) save();
  };
}

/** Fill in fields added after a project was saved. */
function migrate(doc: Project): Project {
  const sceneCount = Math.max(
    SCENE_COUNT,
    doc.scenes?.length ?? 0,
    ...doc.tracks.map((t) => t.slots.length),
  );
  return {
    ...doc,
    launchQuantize: doc.launchQuantize ?? PPQ * 4,
    masterDevices: doc.masterDevices ?? [],
    scenes: [
      ...(doc.scenes ?? []),
      ...Array.from(
        { length: sceneCount - (doc.scenes?.length ?? 0) },
        createScene,
      ),
    ],
    tracks: doc.tracks.map((t, i) => ({
      ...t,
      hue: t.hue ?? trackHue(i),
      slots: [
        ...t.slots,
        ...Array.from({ length: sceneCount - t.slots.length }, () => null),
      ],
    })),
  };
}
