import { Checkbox, Label } from "@/components/ui";
import { Fretboard } from "./Fretboard";
import { Piano } from "./Piano";
import { type Note } from "./notes";
import { useState } from "react";

export const FretboardApp = () => {
  const [showNoteNames, setShowNoteNames] = useState(false);
  const [marked, setMarked] = useState<Set<Note>>(new Set());

  const toggle = (note: Note) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(note)) {
        next.delete(note);
      } else {
        next.add(note);
      }
      return next;
    });
  };

  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4 flex flex-col gap-4">
      <Fretboard
        showNoteNames={showNoteNames}
        marked={marked}
        onPress={toggle}
      />
      <Piano marked={marked} onPress={toggle} />
      <div className="flex items-center gap-2">
        <Checkbox
          id="show-notes"
          checked={showNoteNames}
          onCheckedChange={(checked) => setShowNoteNames(checked === true)}
        />
        <Label htmlFor="show-notes">Show note names</Label>
      </div>
    </div>
  );
};
