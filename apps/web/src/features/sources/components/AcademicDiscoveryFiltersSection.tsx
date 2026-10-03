import { ChevronDown, Search } from "lucide-react";
import { type FC, useId, useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Separator } from "@/shared/components/ui/separator";
import {
  ACADEMIC_FIELD_GROUPS,
  type AcademicSjrWorstAllowed,
  collectFieldSearchTerms,
} from "../constants/academicFieldTaxonomy";

type PublicationYearMode = "all" | "lastN" | "custom";

export interface DiscoveryAcademicFilterState {
  minCitations?: number;
  openAccessOnly?: boolean;
  hasFullText?: boolean;
  publicationYearMode?: PublicationYearMode;
  lastNYears?: number;
  customYearFrom?: number;
  customYearTo?: number;
  fieldOfStudyIds?: string[];
  /** 1 = Q1 only … 4 = all tiers (no journal filter until backend supports SJR) */
  worstAllowedJournalQuartile?: AcademicSjrWorstAllowed;
}

const LAST_N_YEARS_MIN = 1;
const LAST_N_YEARS_MAX = 80;
const LAST_N_YEARS_DEFAULT = 2;

function clampLastNYears(n: number): number {
  return Math.max(LAST_N_YEARS_MIN, Math.min(LAST_N_YEARS_MAX, n));
}

/** A custom range is invalid only when both ends are set and From is after To. */
function isCustomRangeInvalid(academic: DiscoveryAcademicFilterState): boolean {
  return (
    academic.customYearFrom != null &&
    academic.customYearTo != null &&
    academic.customYearFrom > academic.customYearTo
  );
}

export function buildAcademicDiscoveryApiFilters(academic: DiscoveryAcademicFilterState): {
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  hasFullText?: boolean;
  fieldOfStudyTerms?: string[];
} {
  const cy = new Date().getFullYear();
  const mode = academic.publicationYearMode ?? "all";
  let publicationYearFrom: number | undefined;
  let publicationYearTo: number | undefined;
  if (mode === "lastN") {
    const n = clampLastNYears(academic.lastNYears ?? LAST_N_YEARS_DEFAULT);
    publicationYearFrom = cy - n + 1;
    publicationYearTo = cy;
  } else if (mode === "custom") {
    if (academic.customYearFrom != null) publicationYearFrom = academic.customYearFrom;
    if (academic.customYearTo != null) publicationYearTo = academic.customYearTo;
    else if (academic.customYearFrom != null) publicationYearTo = cy;
    // An inverted range matches nothing; send no year filter rather than an empty search.
    if (
      publicationYearFrom != null &&
      publicationYearTo != null &&
      publicationYearFrom > publicationYearTo
    ) {
      publicationYearFrom = undefined;
      publicationYearTo = undefined;
    }
  }

  const ids = academic.fieldOfStudyIds ?? [];
  const fieldTerms = ids.length > 0 ? collectFieldSearchTerms(new Set(ids)) : [];

  const minCitations =
    academic.minCitations != null && academic.minCitations > 0 ? academic.minCitations : undefined;

  return {
    ...(publicationYearFrom != null ? { publicationYearFrom } : {}),
    ...(publicationYearTo != null ? { publicationYearTo } : {}),
    ...(minCitations != null ? { minCitations } : {}),
    ...(academic.openAccessOnly ? { openAccessOnly: true } : {}),
    ...(academic.hasFullText ? { hasFullText: true } : {}),
    ...(fieldTerms.length > 0 ? { fieldOfStudyTerms: fieldTerms } : {}),
  };
}

function parseOptionalInt(raw: string): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? undefined : n;
}

interface AcademicDiscoveryFiltersSectionProps {
  academic: DiscoveryAcademicFilterState;
  setAcademic: (patch: Partial<DiscoveryAcademicFilterState>) => void;
  /** Top divider when stacked under source-channel filters. Omit for standalone panels. */
  showTopDivider?: boolean;
}

export const AcademicDiscoveryFiltersSection: FC<AcademicDiscoveryFiltersSectionProps> = ({
  academic,
  setAcademic,
  showTopDivider = true,
}) => {
  const id = useId();
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [fieldQuery, setFieldQuery] = useState("");
  const [moreOpenByGroup, setMoreOpenByGroup] = useState<Record<string, boolean>>({});

  const yearMode = academic.publicationYearMode ?? "all";
  const rangeInvalid = yearMode === "custom" && isCustomRangeInvalid(academic);
  const selectedFields = useMemo(
    () => new Set(academic.fieldOfStudyIds ?? []),
    [academic.fieldOfStudyIds]
  );

  const ids = {
    legend: `${id}-year-legend`,
    all: `${id}-year-all`,
    lastN: `${id}-year-last-n`,
    custom: `${id}-year-custom`,
    years: `${id}-years`,
    from: `${id}-year-from`,
    to: `${id}-year-to`,
    rangeError: `${id}-year-range-error`,
    pdf: `${id}-has-pdf`,
    openAccess: `${id}-open-access`,
    minCitations: `${id}-min-citations`,
  };

  const setYearMode = (mode: string) => {
    if (mode === "lastN") {
      setAcademic({
        publicationYearMode: "lastN",
        lastNYears: academic.lastNYears ?? LAST_N_YEARS_DEFAULT,
      });
    } else if (mode === "custom" || mode === "all") {
      setAcademic({ publicationYearMode: mode });
    }
  };

  const toggleField = (fieldId: string) => {
    const next = new Set(selectedFields);
    if (next.has(fieldId)) next.delete(fieldId);
    else next.add(fieldId);
    setAcademic({ fieldOfStudyIds: [...next] });
  };

  const qnorm = fieldQuery.trim().toLowerCase();
  const matchesField = (label: string) => !qnorm || label.toLowerCase().includes(qnorm);
  const selectedCount = selectedFields.size;

  return (
    <div className="flex flex-col gap-4 font-sans">
      {showTopDivider ? <Separator /> : null}
      <p className="text-xs font-semibold text-foreground">Academic papers</p>

      <FieldSet>
        <FieldLegend id={ids.legend} variant="label">
          Publication year
        </FieldLegend>
        <RadioGroup aria-labelledby={ids.legend} value={yearMode} onValueChange={setYearMode}>
          <Field orientation="horizontal">
            <RadioGroupItem value="all" id={ids.all} />
            <FieldLabel htmlFor={ids.all}>All years</FieldLabel>
          </Field>

          <div className="flex flex-col gap-2">
            <Field orientation="horizontal">
              <RadioGroupItem value="lastN" id={ids.lastN} />
              <FieldLabel htmlFor={ids.lastN}>Last N years</FieldLabel>
            </Field>
            <div className="pl-7">
              <Field orientation="horizontal" data-disabled={yearMode !== "lastN"}>
                <FieldLabel htmlFor={ids.years}>Years</FieldLabel>
                <Input
                  id={ids.years}
                  type="number"
                  inputMode="numeric"
                  min={LAST_N_YEARS_MIN}
                  max={LAST_N_YEARS_MAX}
                  disabled={yearMode !== "lastN"}
                  value={academic.lastNYears ?? LAST_N_YEARS_DEFAULT}
                  onChange={(e) =>
                    setAcademic({
                      lastNYears: clampLastNYears(
                        Number.parseInt(e.target.value, 10) || LAST_N_YEARS_MIN
                      ),
                    })
                  }
                  className="w-20"
                />
              </Field>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Field orientation="horizontal">
              <RadioGroupItem value="custom" id={ids.custom} />
              <FieldLabel htmlFor={ids.custom}>Custom range</FieldLabel>
            </Field>
            <div className="flex flex-col gap-2 pl-7">
              <div className="grid grid-cols-2 gap-2">
                <Field data-disabled={yearMode !== "custom"} data-invalid={rangeInvalid}>
                  <FieldLabel htmlFor={ids.from}>From</FieldLabel>
                  <Input
                    id={ids.from}
                    type="number"
                    inputMode="numeric"
                    disabled={yearMode !== "custom"}
                    aria-invalid={rangeInvalid || undefined}
                    aria-describedby={rangeInvalid ? ids.rangeError : undefined}
                    value={academic.customYearFrom ?? ""}
                    onChange={(e) =>
                      setAcademic({ customYearFrom: parseOptionalInt(e.target.value) })
                    }
                  />
                </Field>
                <Field data-disabled={yearMode !== "custom"} data-invalid={rangeInvalid}>
                  <FieldLabel htmlFor={ids.to}>To</FieldLabel>
                  <Input
                    id={ids.to}
                    type="number"
                    inputMode="numeric"
                    disabled={yearMode !== "custom"}
                    aria-invalid={rangeInvalid || undefined}
                    aria-describedby={rangeInvalid ? ids.rangeError : undefined}
                    value={academic.customYearTo ?? ""}
                    onChange={(e) =>
                      setAcademic({ customYearTo: parseOptionalInt(e.target.value) })
                    }
                  />
                </Field>
              </div>
              {rangeInvalid ? (
                <FieldError id={ids.rangeError}>From must be before To</FieldError>
              ) : null}
            </div>
          </div>
        </RadioGroup>
      </FieldSet>

      <div className="flex flex-col gap-3">
        <Field orientation="horizontal">
          <Checkbox
            id={ids.pdf}
            checked={Boolean(academic.hasFullText)}
            onCheckedChange={(v) => setAcademic({ hasFullText: v === true || undefined })}
          />
          <FieldLabel htmlFor={ids.pdf}>Has PDF</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={ids.openAccess}
            checked={Boolean(academic.openAccessOnly)}
            onCheckedChange={(v) => setAcademic({ openAccessOnly: v === true || undefined })}
          />
          <FieldLabel htmlFor={ids.openAccess}>Open access</FieldLabel>
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor={ids.minCitations}>Minimum citations</FieldLabel>
        <Input
          id={ids.minCitations}
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Any"
          value={academic.minCitations ?? ""}
          onChange={(e) => {
            const n = parseOptionalInt(e.target.value);
            setAcademic({ minCitations: n == null ? undefined : Math.max(0, n) });
          }}
        />
      </Field>

      <Collapsible open={fieldsOpen} onOpenChange={setFieldsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group/fields w-full justify-between"
          >
            <span>
              Field of study
              {selectedCount > 0 ? (
                <span className="text-muted-foreground"> · {selectedCount} selected</span>
              ) : null}
            </span>
            <ChevronDown
              aria-hidden
              className="text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]/fields:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 pt-2">
            <InputGroup>
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Filter fields"
                placeholder="Search fields"
                value={fieldQuery}
                onChange={(e) => setFieldQuery(e.target.value)}
              />
            </InputGroup>
            <div className="flex max-h-52 flex-col gap-4 overflow-y-auto p-1">
              {ACADEMIC_FIELD_GROUPS.map((group) => {
                const more = group.moreItems ?? [];
                const moreOpen = moreOpenByGroup[group.id] ?? false;
                const mainShown = group.items.filter((it) => matchesField(it.label));
                const extraShown = moreOpen ? more.filter((it) => matchesField(it.label)) : [];
                const showSeeMore =
                  more.length > 0 &&
                  !moreOpen &&
                  (!qnorm || more.some((it) => matchesField(it.label)));
                const showLess = more.length > 0 && moreOpen;

                if (mainShown.length === 0 && extraShown.length === 0 && !showSeeMore) return null;

                return (
                  <div key={group.id} className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                    {[...mainShown, ...extraShown].map((it) => {
                      const checkboxId = `${id}-field-${it.id}`;
                      return (
                        <Field key={it.id} orientation="horizontal">
                          <Checkbox
                            id={checkboxId}
                            checked={selectedFields.has(it.id)}
                            onCheckedChange={() => toggleField(it.id)}
                          />
                          <FieldLabel htmlFor={checkboxId}>{it.label}</FieldLabel>
                        </Field>
                      );
                    })}
                    {showSeeMore || showLess ? (
                      <div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            setMoreOpenByGroup((m) => ({ ...m, [group.id]: !moreOpen }))
                          }
                        >
                          {moreOpen ? "Show less" : `Show ${more.length} more`}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
