import { useId } from "react";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { AcademicDiscoveryFiltersSection } from "../AcademicDiscoveryFiltersSection";
import {
  DEFAULT_FILTERS,
  type FilterState,
  isDefaultFilters,
  RESULT_COUNT_OPTIONS,
  SORT_OPTIONS,
  TIME_RANGE_OPTIONS,
} from "./filterState";

interface DiscoveryFiltersProps {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
}

export function DiscoveryFilters({ filters, onChange }: DiscoveryFiltersProps) {
  const timeRangeId = useId();
  const sortId = useId();

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={timeRangeId}>Time range</FieldLabel>
        <Select
          value={filters.timeRange ?? "any"}
          onValueChange={(value) =>
            onChange({
              timeRange: value === "any" ? undefined : (value as FilterState["timeRange"]),
            })
          }
        >
          <SelectTrigger id={timeRangeId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={sortId}>Sort by</FieldLabel>
        <Select
          value={filters.sortBy}
          onValueChange={(value) => onChange({ sortBy: value as FilterState["sortBy"] })}
        >
          <SelectTrigger id={sortId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel>Results</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Number of results"
          value={String(filters.maxResults)}
          onValueChange={(value) => {
            if (value) onChange({ maxResults: Number(value) });
          }}
        >
          {RESULT_COUNT_OPTIONS.map((count) => (
            <ToggleGroupItem key={count} value={String(count)}>
              {count}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      {filters.sourceTypes.includes("academic") && (
        <AcademicDiscoveryFiltersSection
          academic={filters.academic}
          setAcademic={(patch) => onChange({ academic: { ...filters.academic, ...patch } })}
          showTopDivider
        />
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isDefaultFilters(filters)}
        onClick={() => onChange(DEFAULT_FILTERS)}
      >
        Reset filters
      </Button>
    </FieldGroup>
  );
}
