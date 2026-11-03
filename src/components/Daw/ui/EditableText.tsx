import { useState } from "react";

type EditableTextProps = {
  value: string;
  placeholder?: string;
  label: string;
  onCommit: (value: string) => void;
  className?: string;
  /** Changing this to a new non-zero value starts editing (⌘R). */
  editSignal?: number;
};

/** Text that turns into an input on double-click. Enter or blur saves, Escape cancels. */
export function EditableText({
  value,
  placeholder = "",
  label,
  onCommit,
  className = "",
  editSignal = 0,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [seenSignal, setSeenSignal] = useState(editSignal);
  if (editSignal !== seenSignal) {
    setSeenSignal(editSignal);
    if (editSignal) setEditing(true);
  }

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        defaultValue={value}
        className={`min-w-0 rounded-sm bg-zinc-950 px-1 text-zinc-100 outline-none ring-1 ring-amber-400/60 ${className}`}
        onFocus={(e) => e.currentTarget.select()}
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim();
          if (next !== value) onCommit(next);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <span
      title={`${label} (double-click to rename)`}
      className={`truncate ${className}`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {value || placeholder}
    </span>
  );
}
