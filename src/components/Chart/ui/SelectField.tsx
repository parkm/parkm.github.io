export function SelectField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <div className="text-[11px] tracking-wide uppercase text-white/50 mb-1">
        {props.label}
      </div>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/15"
      >
        {props.options.map((o) => (
          <option key={o} value={o} className="bg-[#0b0f18]">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
