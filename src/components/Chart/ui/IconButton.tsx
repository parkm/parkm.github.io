import React from "react";

export function IconButton(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "neutral" | "primary" | "danger";
}) {
  const { label, onClick, disabled, children, tone = "neutral" } = props;
  const toneClass =
    tone === "primary"
      ? "bg-white/10 active:bg-white/15 border-white/15"
      : tone === "danger"
        ? "bg-red-500/15 active:bg-red-500/25 border-red-400/20"
        : "bg-white/5 active:bg-white/10 border-white/10";

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-2xl border ${toneClass} px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:active:bg-white/5 select-none`}
    >
      {children}
    </button>
  );
}
