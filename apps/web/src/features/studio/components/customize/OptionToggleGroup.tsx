import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import type { ToggleOption } from "./options";

interface OptionToggleGroupProps<T extends string> {
  label: string;
  value: T;
  options: readonly ToggleOption<T>[];
  onValueChange: (value: T) => void;
}

/** A labelled segmented choice (count, difficulty, length…). One option is always chosen. */
export function OptionToggleGroup<T extends string>({
  label,
  value,
  options,
  onValueChange,
}: OptionToggleGroupProps<T>) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{label}</FieldLegend>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label={label}
        value={value}
        onValueChange={(next) => {
          // Radix sends "" when the chosen item is clicked again; keep the choice.
          if (next) onValueChange(next as T);
        }}
        className="w-full"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </FieldSet>
  );
}
