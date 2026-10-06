import type React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
  /** Layout classes for the trigger (its width). */
  className?: string;
  /** For a FieldLabel's htmlFor. Without one the trigger is named "Select citation style". */
  id?: string;
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
  id,
}) => (
  <Select
    value={value}
    onValueChange={(next) => onChange(next as CitationStyle)}
    disabled={disabled}
  >
    <SelectTrigger
      id={id}
      // With an id, a visible FieldLabel names it; an aria-label would override that label.
      aria-label={id ? undefined : "Select citation style"}
      className={cn("w-full", className)}
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper" align="end">
      <SelectGroup>
        {STYLE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);
