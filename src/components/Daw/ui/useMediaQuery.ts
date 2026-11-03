import { useCallback, useSyncExternalStore } from "react";

/** Whether a CSS media query matches, updating when it changes. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phones (and very narrow windows) get the one-panel layout. */
export const PHONE = "(max-width: 767px)";
