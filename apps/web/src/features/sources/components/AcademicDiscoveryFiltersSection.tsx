import { Check, ChevronDown, ChevronRight, Search } from "lucide-react";
import React, { useMemo, useState } from "react";
import {
  ACADEMIC_FIELD_GROUPS,
  ACADEMIC_SJR_TIERS,
  type AcademicSjrWorstAllowed,
  collectFieldSearchTerms,
} from "../constants/academicFieldTaxonomy";

export type PublicationYearMode = "all" | "lastN" | "custom";

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
    const n = Math.max(1, Math.min(80, academic.lastNYears ?? 2));
    publicationYearFrom = cy - n + 1;
    publicationYearTo = cy;
  } else if (mode === "custom") {
    if (academic.customYearFrom != null) publicationYearFrom = academic.customYearFrom;
    if (academic.customYearTo != null) publicationYearTo = academic.customYearTo;
    else if (academic.customYearFrom != null) publicationYearTo = cy;
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

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "relative h-7 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          checked ? "bg-primary" : "bg-muted-foreground/25",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-card shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

interface AcademicDiscoveryFiltersSectionProps {
  academic: DiscoveryAcademicFilterState;
  setAcademic: (patch: Partial<DiscoveryAcademicFilterState>) => void;
  /** Top divider when stacked under source-channel filters. Omit for standalone panels. */
  showTopDivider?: boolean;
}

export const AcademicDiscoveryFiltersSection: React.FC<AcademicDiscoveryFiltersSectionProps> = ({
  academic,
  setAcademic,
  showTopDivider = true,
}) => {
  const [expanded, setExpanded] = useState<null | "field" | "sjr">(null);
  const [fieldQuery, setFieldQuery] = useState("");
  const [moreOpenByGroup, setMoreOpenByGroup] = useState<Record<string, boolean>>({});

  const yearMode = academic.publicationYearMode ?? "all";
  const selectedFields = useMemo(
    () => new Set(academic.fieldOfStudyIds ?? []),
    [academic.fieldOfStudyIds]
  );
  const worstQ = academic.worstAllowedJournalQuartile ?? 4;

  const toggleField = (id: string) => {
    const next = new Set(selectedFields);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAcademic({ fieldOfStudyIds: [...next] });
  };

  const qnorm = fieldQuery.trim().toLowerCase();
  const matchesField = (label: string) => !qnorm || label.toLowerCase().includes(qnorm);

  return (
    <div
      className={["space-y-1", showTopDivider ? "mt-1 border-t border-border/50 pt-3" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-xs font-semibold text-foreground">Academic papers</p>

      <div className="space-y-2 pt-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Publication year
        </p>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg py-1 text-sm">
          <input
            type="radio"
            name="pub-year-mode"
            className="mt-1"
            checked={yearMode === "all"}
            onChange={() => setAcademic({ publicationYearMode: "all" })}
          />
          <span>All years</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg py-1 text-sm">
          <input
            type="radio"
            name="pub-year-mode"
            className="mt-1"
            checked={yearMode === "lastN"}
            onChange={() =>
              setAcademic({ publicationYearMode: "lastN", lastNYears: academic.lastNYears ?? 2 })
            }
          />
          <span className="flex flex-1 flex-wrap items-center gap-2">
            <span>Last</span>
            <input
              type="number"
              min={1}
              max={80}
              disabled={yearMode !== "lastN"}
              value={academic.lastNYears ?? 2}
              onChange={(e) =>
                setAcademic({
                  lastNYears: Math.max(1, Math.min(80, parseInt(e.target.value, 10) || 1)),
                })
              }
              className="w-14 rounded-md border border-border bg-background px-2 py-1 text-center text-sm disabled:opacity-50"
            />
            <span>years</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg py-1 text-sm">
          <input
            type="radio"
            name="pub-year-mode"
            className="mt-1"
            checked={yearMode === "custom"}
            onChange={() => setAcademic({ publicationYearMode: "custom" })}
          />
          <span className="grid flex-1 grid-cols-2 gap-2">
            <span className="col-span-2">Custom</span>
            <input
              type="number"
              placeholder="From"
              disabled={yearMode !== "custom"}
              value={academic.customYearFrom ?? ""}
              onChange={(e) =>
                setAcademic({
                  customYearFrom: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })
              }
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
            />
            <input
              type="number"
              placeholder="To"
              disabled={yearMode !== "custom"}
              value={academic.customYearTo ?? ""}
              onChange={(e) =>
                setAcademic({
                  customYearTo: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })
              }
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
            />
          </span>
        </label>
      </div>

      <div className="border-t border-border/40 pt-1">
        <FilterToggle
          label="Has PDF"
          checked={Boolean(academic.hasFullText)}
          onChange={(v) => setAcademic({ hasFullText: v || undefined })}
        />
        <FilterToggle
          label="Open access"
          checked={Boolean(academic.openAccessOnly)}
          onChange={(v) => setAcademic({ openAccessOnly: v || undefined })}
        />
      </div>

      <div className="space-y-1.5 border-t border-border/40 pt-3">
        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Citations ≥
        </label>
        <input
          type="number"
          min={0}
          placeholder="Min 1"
          value={academic.minCitations ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            if (!raw) {
              setAcademic({ minCitations: undefined });
              return;
            }
            const n = parseInt(raw, 10);
            setAcademic({ minCitations: Number.isNaN(n) ? undefined : Math.max(0, n) });
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      <div className="border-t border-border/40">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 py-3 text-left text-sm font-medium text-foreground"
          onClick={() => setExpanded((e) => (e === "field" ? null : "field"))}
        >
          Field of Study
          {expanded === "field" ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {expanded === "field" && (
          <div className="pb-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search fields"
                value={fieldQuery}
                onChange={(e) => setFieldQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="max-h-52 space-y-3 overflow-y-auto pr-0.5">
              {ACADEMIC_FIELD_GROUPS.map((group) => {
                const more = group.moreItems ?? [];
                const moreOpen = moreOpenByGroup[group.id] ?? false;
                const mainShown = group.items.filter((it) => matchesField(it.label));
                const extraShown = moreOpen ? more.filter((it) => matchesField(it.label)) : [];
                const showSeeMore =
                  more.length > 0 &&
                  !moreOpen &&
                  (!qnorm || more.some((it) => matchesField(it.label)));

                if (mainShown.length === 0 && extraShown.length === 0 && !showSeeMore) return null;

                return (
                  <div key={group.id}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {mainShown.map((it) => (
                        <label
                          key={it.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            className="size-3.5 rounded border-border"
                            checked={selectedFields.has(it.id)}
                            onChange={() => toggleField(it.id)}
                          />
                          <span className="leading-snug">{it.label}</span>
                        </label>
                      ))}
                      {extraShown.map((it) => (
                        <label
                          key={it.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            className="size-3.5 rounded border-border"
                            checked={selectedFields.has(it.id)}
                            onChange={() => toggleField(it.id)}
                          />
                          <span className="leading-snug">{it.label}</span>
                        </label>
                      ))}
                      {showSeeMore && (
                        <button
                          type="button"
                          className="px-1 pt-0.5 text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          onClick={() =>
                            setMoreOpenByGroup((m) => ({
                              ...m,
                              [group.id]: true,
                            }))
                          }
                        >
                          See {more.length} more…
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border/40">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 py-3 text-left text-sm font-medium text-foreground"
          onClick={() => setExpanded((e) => (e === "sjr" ? null : "sjr"))}
        >
          Journal Rating - SJR
          {expanded === "sjr" ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {expanded === "sjr" && (
          <div className="space-y-2 pb-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Tier preference is saved for this session. Journal-level filtering will apply when
              venue metrics are available in discovery results.
            </p>
            {ACADEMIC_SJR_TIERS.map((tier) => {
              const selected = worstQ === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setAcademic({ worstAllowedJournalQuartile: tier.id })}
                  className={[
                    "flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors",
                    selected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/70 bg-card hover:bg-muted/40",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex size-6 shrink-0 items-center justify-center rounded-md border",
                      selected
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border/80 bg-muted/30",
                    ].join(" ")}
                  >
                    {selected ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                  </span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tier.pillClass}`}
                  >
                    {tier.label}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div
                      className={`h-2 shrink-0 self-stretch rounded-full ${tier.barClass} ${tier.barWidth}`}
                    />
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {tier.subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
