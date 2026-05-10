import React from "react";

// ── Types ────────────────────────────────────────────────────────────────

export type CitationStyle =
  | "apa7"
  | "mla9"
  | "chicago17"
  | "ieee"
  | "vancouver"
  | "harvard";

export interface CitationStylePickerProps {
  value: CitationStyle;
  onChange: (style: CitationStyle) => void;
  disabled?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────

const STYLE_OPTIONS: { value: CitationStyle; label: string }[] = [
  { value: "apa7", label: "APA 7th Edition" },
  { value: "mla9", label: "MLA 9th Edition" },
  { value: "chicago17", label: "Chicago 17th Edition" },
  { value: "ieee", label: "IEEE" },
  { value: "vancouver", label: "Vancouver" },
  { value: "harvard", label: "Harvard" },
];

// ── Component ────────────────────────────────────────────────────────────

export const CitationStylePicker: React.FC<CitationStylePickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CitationStyle)}
        disabled={disabled}
        className="appearance-none bg-background border border-border rounded-md px-3 py-1.5 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        aria-label="Select citation style"
      >
        {STYLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {/* Custom dropdown arrow */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg
          className="w-4 h-4 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  );
};
