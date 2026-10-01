import { ListFilter } from "lucide-react";
import {
  AcademicDiscoveryFiltersSection,
  buildAcademicDiscoveryApiFilters,
  type DiscoveryAcademicFilterState,
} from "@/features/sources/components/AcademicDiscoveryFiltersSection";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { ControlTooltip } from "../ControlTooltip";
import { type ChatComposerMode, SOURCE_FILTERS } from "./constants";

type FiltersPopoverProps = {
  mode: ChatComposerMode;
  /** Active source channels (Chat and Deep Research). */
  sourceFilters: readonly string[];
  onSourceFilterChange?: (filters: string[]) => void;
  /** Academic sub-filters, shown when the Academic channel is on (or always in Literature Review). */
  academicDiscoveryFilters?: DiscoveryAcademicFilterState;
  onAcademicDiscoveryFiltersChange?: (patch: Partial<DiscoveryAcademicFilterState>) => void;
  disabled?: boolean;
};

export function FiltersPopover({
  mode,
  sourceFilters,
  onSourceFilterChange,
  academicDiscoveryFilters,
  onAcademicDiscoveryFiltersChange,
  disabled,
}: FiltersPopoverProps) {
  const isLiterature = mode === "literatureReview";
  const academicChannelOn = sourceFilters.includes("academic");
  const hasAcademicFilters =
    Object.keys(buildAcademicDiscoveryApiFilters(academicDiscoveryFilters ?? {})).length > 0;
  // Literature Review always uses the academic filters; elsewhere they only apply with the channel on.
  const active = hasAcademicFilters && (isLiterature || academicChannelOn);

  // A channel can be turned off only while another stays on, so a query always has a source.
  const toggleChannel = (id: string, checked: boolean) => {
    if (!onSourceFilterChange) return;
    if (checked) {
      if (!sourceFilters.includes(id)) onSourceFilterChange([...sourceFilters, id]);
    } else if (sourceFilters.length > 1) {
      onSourceFilterChange(sourceFilters.filter((f) => f !== id));
    }
  };

  return (
    <Popover>
      <ControlTooltip label="Filters">
        <PopoverTrigger asChild disabled={disabled}>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={active ? "Filters (active)" : "Filters"}
            className="relative"
          >
            <ListFilter />
            {active ? (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
              />
            ) : null}
          </Button>
        </PopoverTrigger>
      </ControlTooltip>
      <PopoverContent
        side="top"
        align="start"
        className="max-h-(--radix-popover-content-available-height) w-76 max-w-(--radix-popover-content-available-width) overflow-y-auto"
      >
        {isLiterature ? (
          onAcademicDiscoveryFiltersChange ? (
            <AcademicDiscoveryFiltersSection
              academic={academicDiscoveryFilters ?? {}}
              setAcademic={onAcademicDiscoveryFiltersChange}
              showTopDivider={false}
            />
          ) : null
        ) : (
          <>
            <p className="mb-2 font-sans text-xs font-medium text-muted-foreground">
              Source channels
            </p>
            <div className="flex flex-col gap-0.5">
              {SOURCE_FILTERS.map(({ id, label, icon: Icon }) => {
                const checked = sourceFilters.includes(id);
                const isLast = checked && sourceFilters.length === 1;
                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-3 rounded-md p-2 font-sans text-sm hover:bg-accent has-disabled:cursor-not-allowed"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!onSourceFilterChange || isLast}
                      onCheckedChange={(next) => toggleChannel(id, next === true)}
                    />
                    <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">{label}</span>
                  </label>
                );
              })}
            </div>
            {academicChannelOn && onAcademicDiscoveryFiltersChange ? (
              <AcademicDiscoveryFiltersSection
                academic={academicDiscoveryFilters ?? {}}
                setAcademic={onAcademicDiscoveryFiltersChange}
              />
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
