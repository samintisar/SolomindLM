import { Search, SlidersHorizontal } from "lucide-react";
import { useId } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Spinner } from "@/shared/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { DiscoveryFilters } from "./DiscoveryFilters";
import { countActiveFilters, type FilterPatch, type FilterState } from "./filterState";
import { SOURCE_TYPE_META, SOURCE_TYPES, type SourceType } from "./sourceTypes";

interface DiscoveryToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  isLoading: boolean;
  /** Blocks searching without the loading spinner, e.g. while sources are being added. */
  disabled?: boolean;
  filters: FilterState;
  onFiltersChange: (patch: FilterPatch) => void;
  onFiltersReset: () => void;
}

export function DiscoveryToolbar({
  query,
  onQueryChange,
  onSearch,
  isLoading,
  disabled = false,
  filters,
  onFiltersChange,
  onFiltersReset,
}: DiscoveryToolbarProps) {
  const searchId = useId();
  const activeCount = countActiveFilters(filters);

  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <label htmlFor={searchId} className="sr-only">
          Search sources
        </label>
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            id={searchId}
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search for articles, papers, or websites..."
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              variant="default"
              size="sm"
              disabled={!query.trim() || isLoading || disabled}
            >
              {isLoading ? <Spinner aria-hidden /> : null}
              Search
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          aria-label="Source types"
          value={filters.sourceTypes}
          onValueChange={(value) =>
            onFiltersChange({ sourceTypes: value.length ? (value as SourceType[]) : ["web"] })
          }
        >
          {SOURCE_TYPES.map((type) => {
            const { label, icon: Icon } = SOURCE_TYPE_META[type];
            return (
              <ToggleGroupItem key={type} value={type}>
                <Icon aria-hidden />
                {/* Four labelled segments overflow a phone; keep the names for screen readers. */}
                <span className="max-sm:sr-only">{label}</span>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={activeCount > 0 ? `Filters, ${activeCount} active` : "Filters"}
            >
              <SlidersHorizontal aria-hidden />
              Filters
              {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-80 max-h-(--radix-popover-content-available-height) overflow-y-auto"
          >
            <DiscoveryFilters
              filters={filters}
              onChange={onFiltersChange}
              onReset={onFiltersReset}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
