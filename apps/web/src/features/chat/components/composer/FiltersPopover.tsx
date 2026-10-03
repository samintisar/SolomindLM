import { ListFilter } from "lucide-react";
import { useId } from "react";
import {
  AcademicDiscoveryFiltersSection,
  buildAcademicDiscoveryApiFilters,
  type DiscoveryAcademicFilterState,
} from "@/features/sources/components/AcademicDiscoveryFiltersSection";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { ControlTooltip } from "../ControlTooltip";
import { type ChatComposerMode, SOURCE_FILTERS, type SourceFilterId } from "./constants";

type FiltersPopoverProps = {
  mode: ChatComposerMode;
  /** Active source channels (Chat and Deep Research). */
  sourceFilters: readonly SourceFilterId[];
  onSourceFilterChange?: (filters: SourceFilterId[]) => void;
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
  const idBase = useId();
  const activeHintId = `${idBase}-active`;
  const lockedHintId = `${idBase}-locked`;
  const isLiterature = mode === "literatureReview";
  const academicChannelOn = sourceFilters.includes("academic");
  const hasAcademicFilters =
    Object.keys(buildAcademicDiscoveryApiFilters(academicDiscoveryFilters ?? {})).length > 0;
  // Literature Review always uses the academic filters; elsewhere they only apply with the channel on.
  const active = hasAcademicFilters && (isLiterature || academicChannelOn);
  const onlyOneChannel = sourceFilters.length === 1;

  // Literature Review shows only the academic filters, so it has nothing to show without their handler.
  const literatureFiltersHandler = isLiterature ? onAcademicDiscoveryFiltersChange : undefined;
  if (isLiterature && !literatureFiltersHandler) return null;

  // A channel can be turned off only while another stays on, so a query always has a source.
  const toggleChannel = (id: SourceFilterId, checked: boolean) => {
    if (!onSourceFilterChange) return;
    if (checked) {
      if (!sourceFilters.includes(id)) onSourceFilterChange([...sourceFilters, id]);
    } else if (sourceFilters.length > 1) {
      onSourceFilterChange(sourceFilters.filter((f) => f !== id));
    }
  };

  return (
    <Popover>
      <ControlTooltip label={active ? "Filters · academic filters applied" : "Filters"}>
        <PopoverTrigger asChild disabled={disabled}>
          <Button
            variant="ghost"
            size="icon-md"
            disabled={disabled}
            aria-label="Filters"
            aria-describedby={active ? activeHintId : undefined}
            className="relative"
          >
            <ListFilter />
            {active ? (
              <>
                <span
                  aria-hidden
                  className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
                />
                <span id={activeHintId} className="sr-only">
                  academic filters applied
                </span>
              </>
            ) : null}
          </Button>
        </PopoverTrigger>
      </ControlTooltip>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={16}
        className="max-h-(--radix-popover-content-available-height) w-76 max-w-(--radix-popover-content-available-width) overflow-y-auto overscroll-contain"
      >
        {literatureFiltersHandler ? (
          <AcademicDiscoveryFiltersSection
            academic={academicDiscoveryFilters ?? {}}
            setAcademic={literatureFiltersHandler}
            showTopDivider={false}
          />
        ) : (
          <>
            <p className="mb-2 font-sans text-xs font-medium text-muted-foreground">
              Source channels
            </p>
            <div className="flex flex-col gap-0.5">
              {SOURCE_FILTERS.map(({ id, label, icon: Icon }) => {
                const checked = sourceFilters.includes(id);
                const isLast = checked && onlyOneChannel;
                return (
                  <label
                    key={id}
                    className="group/row flex min-h-10 cursor-pointer items-center gap-3 rounded-md p-2 font-sans text-sm hover:bg-accent has-disabled:cursor-not-allowed has-disabled:hover:bg-transparent"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!onSourceFilterChange || isLast}
                      aria-describedby={isLast ? lockedHintId : undefined}
                      onCheckedChange={(next) => toggleChannel(id, next === true)}
                    />
                    <Icon
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground group-has-disabled/row:opacity-60"
                    />
                    <span className="min-w-0 flex-1 group-has-disabled/row:opacity-60">
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>
            {onSourceFilterChange && onlyOneChannel ? (
              <p id={lockedHintId} className="mt-1 font-sans text-xs text-muted-foreground">
                At least one source is required
              </p>
            ) : null}
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
