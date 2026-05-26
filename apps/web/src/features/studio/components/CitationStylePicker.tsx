import React from "react";
import { cn } from "@/shared/utils/cn";

// ── Types ────────────────────────────────────────────────────────────────

export type CitationStyle =
  | "apa7"
  | "apa6"
  | "mla9"
  | "mla8"
  | "chicago17"
  | "chicago17_notes"
  | "ama11"
  | "ama10"
  | "acs"
  | "ieee"
  | "vancouver"
  | "harvard";

export interface CitationStylePickerProps {
  value: CitationStyle;
  onChange: (style: CitationStyle) => void;
  disabled?: boolean;
  className?: string;
}

// ── Constants ────────────────────────────────────────────────────────────

const STYLE_OPTIONS: { value: CitationStyle; label: string }[] = [
  { value: "apa7", label: "APA 7th" },
  { value: "apa6", label: "APA 6th" },
  { value: "mla9", label: "MLA 9th" },
  { value: "mla8", label: "MLA 8th" },
  { value: "chicago17", label: "Chicago 17 (Author-Date)" },
  { value: "chicago17_notes", label: "Chicago 17 (Notes)" },
  { value: "ama11", label: "AMA 11th" },
  { value: "ama10", label: "AMA 10th" },
  { value: "acs", label: "ACS" },
  { value: "ieee", label: "IEEE" },
  { value: "vancouver", label: "Vancouver" },
  { value: "harvard", label: "Harvard" },
];

// ── Component ────────────────────────────────────────────────────────────

export const CitationStylePicker: React.FC<CitationStylePickerProps> = ({
  value,
  onChange,
  disabled = false,
  className,
}) => {
  return (
    <div className={cn("relative inline-block min-w-0 max-w-full", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CitationStyle)}
        disabled={disabled}
        className="w-full max-w-full appearance-none truncate bg-background border border-border rounded-md px-3 py-1.5 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
};
