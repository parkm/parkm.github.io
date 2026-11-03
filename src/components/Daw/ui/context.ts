import { createContext, useContext, useSyncExternalStore } from "react";
import type { Session, SessionState } from "../engine/session";
import type { Store } from "../model/store";
import type { Project } from "../model/types";

export type DawContextValue = { store: Store<Project>; session: Session };

export const DawContext = createContext<DawContextValue | null>(null);

export function useDaw() {
  const value = useContext(DawContext);
  if (!value) throw new Error("useDaw must be used inside <DawContext>");
  return value;
}

/**
 * Subscribe to a slice of the document. Components re-render only when the
 * selected value changes by reference, so select the smallest piece you need.
 */
export function useDoc<S>(selector: (doc: Project) => S): S {
  const { store } = useDaw();
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

export function useSessionState<S>(selector: (state: SessionState) => S): S {
  const { session } = useDaw();
  return useSyncExternalStore(session.subscribe, () =>
    selector(session.getState()),
  );
}

export function useHistory() {
  const { store } = useDaw();
  const canUndo = useSyncExternalStore(store.subscribe, store.canUndo);
  const canRedo = useSyncExternalStore(store.subscribe, store.canRedo);
  return { canUndo, canRedo };
}
