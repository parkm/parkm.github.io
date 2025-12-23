export function Checkbox(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        className="w-4 h-4 rounded border-white/10 bg-white/5 text-white focus:ring-2 focus:ring-white/15 focus:ring-offset-0"
      />
      <span className="text-xs text-white/65">{props.label}</span>
    </label>
  );
}
