/**
 * Create / edit a stack: a name plus the set of counters shown together.
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatNumber } from "./helpers";
import type { Counter, Stack } from "./types";

interface Props {
  counters: Counter[];
  initial?: Stack;
  onSubmit: (name: string, counterIds: string[]) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function StackForm({
  counters,
  initial,
  onSubmit,
  onCancel,
  onDelete,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [selected, setSelected] = useState<string[]>(initial?.counterIds ?? []);

  const valid = name.trim().length > 0 && selected.length >= 1;

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit(name.trim(), selected);
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="stack-name">Name</Label>
        <Input
          id="stack-name"
          autoFocus={!initial}
          placeholder="e.g. Morning routine"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Counters in this stack</Label>
        {counters.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Create some counters first.
          </p>
        ) : (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {counters.map((c) => (
              <label
                key={c.id}
                className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
              >
                <Checkbox
                  checked={selected.includes(c.id)}
                  onCheckedChange={() => toggle(c.id)}
                />
                <span className="flex-1 text-sm font-medium">{c.name}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatNumber(c.value)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive mr-auto"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid}>
          {initial ? "Save" : "Create stack"}
        </Button>
      </div>
    </form>
  );
}
