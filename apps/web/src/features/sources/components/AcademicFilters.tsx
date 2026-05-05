import React, { useState } from "react";
import {
  BookOpen,
  FileText,
  Atom,
  ChevronDown,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { AcademicFiltersProps } from "./AcademicFilters.types";
import {
  DEFAULT_ACADEMIC_FILTERS,
  DATABASE_OPTIONS,
  FIELDS_OF_STUDY,
  SJR_QUARTILES,
} from "./AcademicFilters.utils";

const DB_ICONS: Record<string, React.ElementType> = {
  BookOpen,
  FileText,
  Atom,
};

export const AcademicFilters: React.FC<AcademicFiltersProps> = ({
  filters,
  onChange,
  variant,
  onApply,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["database", "year"])
  );
  const [fieldSearch, setFieldSearch] = useState("");

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const updateFilters = (updates: Partial<typeof filters>) => {
    onChange({ ...filters, ...updates });
  };

  const toggleField = (field: string) => {
    const current = filters.fieldsOfStudy;
    const next = current.includes(field)
      ? current.filter((f) => f !== field)
      : [...current, field];
    updateFilters({ fieldsOfStudy: next });
  };

  const filteredFields = FIELDS_OF_STUDY.map((category) => ({
    ...category,
    fields: category.fields.filter((f) =>
      f.toLowerCase().includes(fieldSearch.toLowerCase())
    ),
  })).filter((category) => category.fields.length > 0);

  const isSidebar = variant === "sidebar";
  const isEmbedded = variant === "embedded";
  const isModal = variant === "modal";

  const containerClass = isSidebar
    ? "h-full overflow-y-auto p-5 space-y-5 border-r border-border/50 bg-card/30"
    : isModal
      ? "w-full max-h-[min(70vh,28rem)] overflow-y-auto overflow-x-hidden space-y-4 py-1 pr-1"
      : isEmbedded
        ? "w-full max-h-[min(50vh,22rem)] overflow-y-auto overflow-x-hidden space-y-4 pr-0.5"
        : "w-80 max-h-[70vh] overflow-y-auto p-4 space-y-4 bg-card border border-border rounded-xl shadow-lg";

  return (
    <div className={containerClass}>
      {/* Header (hidden when embedded — parent panel owns the section label) */}
      {!isEmbedded && !isModal && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Academic Filters</h3>
          </div>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_ACADEMIC_FILTERS)}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Reset
          </button>
        </div>
      )}

      {/* Database Selection (composer exposes DB separately when academic is on) */}
      {variant !== "modal" && (
      <div>
        <button
          type="button"
          onClick={() => toggleSection("database")}
          className="flex items-center justify-between w-full text-sm font-medium mb-2"
        >
          Research Databases
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              expandedSections.has("database") ? "" : "-rotate-90"
            }`}
          />
        </button>
        {expandedSections.has("database") && (
          <div className="space-y-2">
            {DATABASE_OPTIONS.map((db) => {
              const Icon = DB_ICONS[db.icon] || BookOpen;
              const isActive = filters.database === db.value;
              return (
                <label
                  key={db.value}
                  className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? "bg-primary/5 border border-primary/20"
                      : "hover:bg-muted/50 border border-transparent"
                  }`}
                >
                  <input
                    type="radio"
                    name="database"
                    value={db.value}
                    checked={isActive}
                    onChange={() => updateFilters({ database: db.value })}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{db.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {db.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Publication Year */}
      <div>
        <button
          onClick={() => toggleSection("year")}
          className="flex items-center justify-between w-full text-sm font-medium mb-2"
        >
          Publication Year
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              expandedSections.has("year") ? "" : "-rotate-90"
            }`}
          />
        </button>
        {expandedSections.has("year") && (
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="yearFilter"
                checked={filters.yearFilter === "all"}
                onChange={() => updateFilters({ yearFilter: "all" })}
                className="shrink-0"
              />
              <span className="text-sm">All Years</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="yearFilter"
                checked={filters.yearFilter === "last-n"}
                onChange={() => updateFilters({ yearFilter: "last-n" })}
                className="shrink-0"
              />
              <span className="text-sm">Last</span>
              <input
                type="number"
                value={filters.yearCount}
                onChange={(e) =>
                  updateFilters({ yearCount: parseInt(e.target.value) || 1 })
                }
                disabled={filters.yearFilter !== "last-n"}
                className="w-16 px-2 py-1 text-sm border border-border rounded-md bg-background disabled:opacity-50"
                min={1}
                max={100}
              />
              <span className="text-sm">Years</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="yearFilter"
                checked={filters.yearFilter === "custom"}
                onChange={() => updateFilters({ yearFilter: "custom" })}
                className="shrink-0"
              />
              <span className="text-sm">Custom</span>
              {filters.yearFilter === "custom" && (
                <div className="flex items-center gap-2 ml-2">
                  <input
                    type="number"
                    placeholder="Start"
                    value={filters.yearStart || ""}
                    onChange={(e) =>
                      updateFilters({
                        yearStart: parseInt(e.target.value) || undefined,
                      })
                    }
                    className="w-20 px-2 py-1 text-sm border border-border rounded-md bg-background"
                  />
                  <span className="text-sm text-muted-foreground">-</span>
                  <input
                    type="number"
                    placeholder="End"
                    value={filters.yearEnd || ""}
                    onChange={(e) =>
                      updateFilters({
                        yearEnd: parseInt(e.target.value) || undefined,
                      })
                    }
                    className="w-20 px-2 py-1 text-sm border border-border rounded-md bg-background"
                  />
                </div>
              )}
            </label>
          </div>
        )}
      </div>

      {/* Toggles */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm">Has PDF</span>
          <button
            onClick={() => updateFilters({ hasPdf: !filters.hasPdf })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              filters.hasPdf ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                filters.hasPdf ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Open Access</span>
          <button
            onClick={() => updateFilters({ openAccess: !filters.openAccess })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              filters.openAccess ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                filters.openAccess ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Citations */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Citations ≥</label>
        <input
          type="number"
          value={filters.minCitations || ""}
          onChange={(e) =>
            updateFilters({
              minCitations: e.target.value
                ? parseInt(e.target.value)
                : undefined,
            })
          }
          placeholder="Min 1"
          min={0}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Field of Study */}
      <div>
        <button
          onClick={() => toggleSection("fields")}
          className="flex items-center justify-between w-full text-sm font-medium mb-2"
        >
          Field of Study
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              expandedSections.has("fields") ? "" : "-rotate-90"
            }`}
          />
        </button>
        {expandedSections.has("fields") && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="Search fields"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background placeholder:text-muted-foreground/50"
              />
            </div>
            {filteredFields.map((category) => (
              <div key={category.name}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  {category.name}
                </p>
                <div className="space-y-1">
                  {category.fields.map((field) => (
                    <label
                      key={field}
                      className="flex items-center gap-2 cursor-pointer py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={filters.fieldsOfStudy.includes(field)}
                        onChange={() => toggleField(field)}
                        className="rounded border-border"
                      />
                      <span className="text-sm">{field}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Journal Rating - SJR */}
      <div>
        <button
          onClick={() => toggleSection("sjr")}
          className="flex items-center justify-between w-full text-sm font-medium mb-2"
        >
          Journal Rating - SJR
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              expandedSections.has("sjr") ? "" : "-rotate-90"
            }`}
          />
        </button>
        {expandedSections.has("sjr") && (
          <div className="space-y-2">
            {SJR_QUARTILES.map((q) => {
              const isActive = filters.minSjrQuartile === q.value;
              return (
                <label
                  key={q.value}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors border ${
                    isActive
                      ? q.color
                      : "border-transparent hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="sjr"
                    value={q.value}
                    checked={isActive}
                    onChange={() => updateFilters({ minSjrQuartile: q.value })}
                    className="shrink-0"
                  />
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded ${q.color}`}
                  >
                    {q.label}
                  </span>
                  <div
                    className={`flex-1 h-1.5 rounded-full ${q.barColor} opacity-60`}
                  />
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Apply button (for dropdown variant) */}
      {!isSidebar && !isEmbedded && onApply && (
        <button
          onClick={onApply}
          type="button"
          className={`w-full py-3 text-sm font-semibold rounded-xl transition-colors ${
            isModal
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg py-2.5 font-medium"
          }`}
        >
          Apply Filters
        </button>
      )}
    </div>
  );
};
