import { Checkbox, Label } from "@/components/ui";
import { Fretboard, type StringFret } from "./Fretboard";
import { useState } from "react";

export const FretboardApp = () => {
  const [showNoteNames, setShowNoteNames] = useState(false);
  const [markedNotes, setMarkedNotes] = useState<StringFret[]>([]);

  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4 flex flex-col gap-4">
      <Fretboard
        showNoteNames={showNoteNames}
        markedNotes={markedNotes}
        onFretPress={({ stringFret }) => {
          setMarkedNotes((prev) =>
            prev.includes(stringFret)
              ? prev.filter((k) => k !== stringFret)
              : [...prev, stringFret],
          );
        }}
      />

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
