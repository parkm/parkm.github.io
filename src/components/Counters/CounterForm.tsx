/**
 * Create / edit form for a counter. Encapsulates its own draft state and emits
 * a `NewCounterInput` on submit. The reset and goal sections progressively
 * disclose their options behind a single toggle, with plain-language helper
 * text so the behaviour is obvious without documentation.
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Input, Label, Select, SelectOption } from "@/components/ui";
import { Checkbox } from "@/components/ui/Checkbox";
import { DEFAULT_GOAL, DEFAULT_RESET, WEEKDAY_LABELS } from "./helpers";
import type { Counter, GoalConfig, ResetConfig } from "./types";
import type { NewCounterInput } from "./store";

interface Props {
  initial?: Counter;
  onSubmit: (input: NewCounterInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function CounterForm({ initial, onSubmit, onCancel, onDelete }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [step, setStep] = useState(String(initial?.step ?? 1));
  const [value, setValue] = useState(String(initial?.value ?? 0));
  const [reset, setReset] = useState<ResetConfig>(
    initial?.reset ?? DEFAULT_RESET,
  );
  const [goal, setGoal] = useState<GoalConfig>(initial?.goal ?? DEFAULT_GOAL);

  const stepNum = Number(step);
  const valid =
    name.trim().length > 0 && Number.isFinite(stepNum) && stepNum > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({
          name: name.trim(),
          step: stepNum,
          value: Number(value) || 0,
          reset,
          goal,
        });
      }}
      className="flex flex-col gap-5"
    >
      {/* Basics */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="counter-name">Name</Label>
        <Input
          id="counter-name"
          autoFocus={!initial}
          placeholder="e.g. Water (glasses), Pushups…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="counter-step">Step</Label>
          <Input
            id="counter-step"
            type="number"
            inputMode="decimal"
            min={0}
            value={step}
            onChange={(e) => setStep(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            The +/− button amount.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="counter-value">Starting value</Label>
          <Input
            id="counter-value"
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      </div>

      {/* Reset */}
      <fieldset className="rounded-lg border p-4">
        <label className="flex items-start gap-3">
          <Checkbox
            checked={reset.enabled}
            onCheckedChange={(c) =>
              setReset((r) => ({ ...r, enabled: c === true }))
            }
            className="mt-0.5"
          />
          <span>
            <span className="text-sm font-medium">Reset on a schedule</span>
            <p className="text-muted-foreground text-xs">
              Automatically return to a baseline value. Defaults to midnight
              each day — perfect for daily habits.
            </p>
          </span>
        </label>

        {reset.enabled && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">How often</Label>
              <Select
                className="w-full"
                value={reset.cadence}
                onChange={(e) =>
                  setReset((r) => ({
                    ...r,
                    cadence: e.target.value as ResetConfig["cadence"],
                  }))
                }
              >
                <SelectOption value="daily">Daily</SelectOption>
                <SelectOption value="weekly">Weekly</SelectOption>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">At</Label>
              <Input
                type="time"
                value={reset.timeOfDay}
                onChange={(e) =>
                  setReset((r) => ({ ...r, timeOfDay: e.target.value }))
                }
              />
            </div>

            {reset.cadence === "weekly" && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label className="text-xs">On</Label>
                <Select
                  className="w-full"
                  value={reset.weekday}
                  onChange={(e) =>
                    setReset((r) => ({ ...r, weekday: Number(e.target.value) }))
                  }
                >
                  {WEEKDAY_LABELS.map((label, i) => (
                    <SelectOption key={label} value={i + 1}>
                      {label}
                    </SelectOption>
                  ))}
                </Select>
              </div>
            )}

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label className="text-xs">Reset to</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={reset.resetTo}
                onChange={(e) =>
                  setReset((r) => ({
                    ...r,
                    resetTo: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>
        )}
      </fieldset>

      {/* Goal */}
      <fieldset className="rounded-lg border p-4">
        <label className="flex items-start gap-3">
          <Checkbox
            checked={goal.enabled}
            onCheckedChange={(c) =>
              setGoal((g) => ({ ...g, enabled: c === true }))
            }
            className="mt-0.5"
          />
          <span>
            <span className="text-sm font-medium">Set a goal</span>
            <p className="text-muted-foreground text-xs">
              {reset.enabled
                ? `A target to hit each ${reset.cadence === "weekly" ? "week" : "day"}, tracked against the reset.`
                : "A target value to work toward."}
            </p>
          </span>
        </label>

        {goal.enabled && (
          <div className="mt-4 flex flex-col gap-1.5 border-t pt-4">
            <Label className="text-xs">Target amount</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={goal.amount}
              onChange={(e) =>
                setGoal((g) => ({ ...g, amount: Number(e.target.value) || 0 }))
              }
            />
          </div>
        )}
      </fieldset>

      {/* Actions */}
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
          {initial ? "Save" : "Create counter"}
        </Button>
      </div>
    </form>
  );
}
