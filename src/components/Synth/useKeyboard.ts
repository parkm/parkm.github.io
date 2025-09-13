import React, { useCallback, useEffect } from "react";
import {
  clamp,
  isPlayableKey,
  MIN_OCT,
  MAX_OCT,
  MIN_VEL,
  MAX_VEL,
  VEL_STEP,
} from "./utils";

export function useComputerKeyboard({
  enabled,
  onPlay,
  onRelease,
  setOctave,
  setVelocity,
}: {
  enabled: boolean;
  onPlay: (key: string) => void;
  onRelease: (key: string) => void;
  setOctave: React.Dispatch<React.SetStateAction<number>>;
  setVelocity: React.Dispatch<React.SetStateAction<number>>;
}) {
  const handleKeyDown = useCallback(
    (ev: KeyboardEvent) => {
      const key = ev.key.toLowerCase();
      if (ev.repeat) return;

      if (key === "z") return setOctave((o) => clamp(o - 1, MIN_OCT, MAX_OCT));
      if (key === "x") return setOctave((o) => clamp(o + 1, MIN_OCT, MAX_OCT));
      if (key === "c")
        return setVelocity((v) => clamp(v - VEL_STEP, MIN_VEL, MAX_VEL));
      if (key === "v")
        return setVelocity((v) => clamp(v + VEL_STEP, MIN_VEL, MAX_VEL));

      if (isPlayableKey(key)) onPlay(key);
    },
    [onPlay, setOctave, setVelocity],
  );

  const handleKeyUp = useCallback(
    (ev: KeyboardEvent) => {
      const key = ev.key.toLowerCase();
      if (!isPlayableKey(key)) return;
      onRelease(key);
    },
    [onRelease],
  );

  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => handleKeyDown(e);
    const up = (e: KeyboardEvent) => handleKeyUp(e);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [enabled, handleKeyDown, handleKeyUp]);
}
