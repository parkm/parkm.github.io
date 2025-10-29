import { useCallback, useState } from "react";
import type { Grid } from "./types";

/**
 * Determines if a selection is contiguous in a row-major order
 * Allows multi-row selections as long as they flow left-to-right, top-to-bottom
 */
function getContiguousRange(startIndex: number, endIndex: number): number[] {
  const min = Math.min(startIndex, endIndex);
  const max = Math.max(startIndex, endIndex);
  const indices: number[] = [];

  for (let i = min; i <= max; i++) {
    indices.push(i);
  }

  return indices;
}

type UseAnimationEditorProps = {
  frameIndices: number[];
  grid: Grid;
  onUpdateFrames: (frameIndices: number[]) => void;
};

export function useAnimationEditor({
  frameIndices,
  onUpdateFrames,
}: UseAnimationEditorProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  const handlePointerDown = useCallback((index: number) => {
    setIsSelecting(true);
    setSelectionStart(index);
    setSelectionEnd(index);
  }, []);

  const handlePointerMove = useCallback(
    (index: number) => {
      if (isSelecting && selectionStart !== null) {
        setSelectionEnd(index);
      }
    },
    [isSelecting, selectionStart],
  );

  const handlePointerUp = useCallback(() => {
    if (isSelecting && selectionStart !== null && selectionEnd !== null) {
      const newFrames = getContiguousRange(selectionStart, selectionEnd);
      onUpdateFrames(newFrames);
    }
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [isSelecting, selectionStart, selectionEnd, onUpdateFrames]);

  // Calculate the preview range while selecting
  const previewFrames =
    isSelecting && selectionStart !== null && selectionEnd !== null
      ? getContiguousRange(selectionStart, selectionEnd)
      : frameIndices;

  return {
    isSelecting,
    previewFrames,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
