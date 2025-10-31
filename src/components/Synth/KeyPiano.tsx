import { useMemo } from "react";

const KeyCap = ({
  label,
  active = false,
  sharp = false,
  onDown,
  onUp,
}: {
  label: string;
  active?: boolean;
  sharp?: boolean;
  onDown?: () => void;
  onUp?: () => void;
}) => {
  if (!label) return <div className="flex h-12 flex-1" />;
  return (
    <button
      type="button"
      aria-pressed={active}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      className={[
        "flex h-12 flex-1 select-none items-center justify-center rounded-md border text-sm font-medium outline-none",
        sharp
          ? "-mb-4 z-10 basis-14 border-zinc-300 bg-zinc-900 text-white shadow"
          : "border-zinc-200 bg-white text-zinc-800 shadow-sm",
        active
          ? sharp
            ? "ring-2 ring-amber-400"
            : "ring-2 ring-indigo-500"
          : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
};

export function KeyPiano({
  pressed,
  onDown,
  onUp,
}: {
  pressed: Record<string, boolean>;
  onDown: (label: string) => void;
  onUp: (label: string) => void;
}) {
  const sharpRow = useMemo(
    () => ["W", "E", "", "T", "Y", "U", "", "O", "P"],
    [],
  );
  const whiteRow = useMemo(
    () => ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
    [],
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-1 px-8">
        {sharpRow.map((label) => {
          const keyStr = label ? label.toLowerCase() : "";
          return (
            <KeyCap
              key={`sharp-${label || Math.random()}`}
              label={label}
              sharp
              active={!!pressed[keyStr]}
              onDown={label ? () => onDown(label) : undefined}
              onUp={label ? () => onUp(label) : undefined}
            />
          );
        })}
      </div>
      <div className="flex gap-1">
        {whiteRow.map((label) => (
          <KeyCap
            key={`white-${label}`}
            label={label}
            active={pressed[label.toLowerCase()] === true}
            onDown={() => onDown(label)}
            onUp={() => onUp(label)}
          />
        ))}
      </div>
    </div>
  );
}
