/**
 * Immutable state container with undo/redo. History entries are previous
 * snapshots; structural sharing keeps them cheap.
 *
 * Continuous gestures (painting steps, turning a knob) wrap their updates in
 * begin()/end() so the whole gesture is one undo step.
 */
export type Store<T> = {
  get: () => T;
  subscribe: (listener: () => void) => () => void;
  /** Apply an update. Returning the same state is a no-op. */
  update: (fn: (state: T) => T) => void;
  /** Replace state without recording history (e.g. loading a project). */
  reset: (state: T) => void;
  begin: () => void;
  end: () => void;
  /** Abandon the gesture in progress: restore the state from its begin(), record nothing. */
  cancel: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export function createStore<T>(initial: T, historyLimit = 300): Store<T> {
  let state = initial;
  let past: T[] = [];
  let future: T[] = [];
  let depth = 0;
  let gestureStart: T | null = null;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());

  const record = (prev: T) => {
    past.push(prev);
    if (past.length > historyLimit) past.shift();
    future = [];
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(fn) {
      const next = fn(state);
      if (next === state) return;
      if (depth === 0) record(state);
      state = next;
      emit();
    },
    reset(next) {
      state = next;
      past = [];
      future = [];
      emit();
    },
    begin() {
      if (depth++ === 0) gestureStart = state;
    },
    end() {
      if (depth === 0) return;
      if (--depth > 0) return;
      if (gestureStart !== null && gestureStart !== state) {
        record(gestureStart);
        emit();
      }
      gestureStart = null;
    },
    cancel() {
      if (depth === 0) return;
      depth = 0;
      const start = gestureStart;
      gestureStart = null;
      if (start !== null && start !== state) {
        state = start;
        emit();
      }
    },
    undo() {
      if (depth > 0) return;
      const prev = past.pop();
      if (prev === undefined) return;
      future.push(state);
      state = prev;
      emit();
    },
    redo() {
      if (depth > 0) return;
      const next = future.pop();
      if (next === undefined) return;
      past.push(state);
      state = next;
      emit();
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
