# Academic Research Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable AcademicFilters component and integrate it into both the DiscoverSourcesModal (as a sidebar) and ChatInput (as a dropdown), showing only when Academic source type is active.

**Architecture:** A dedicated AcademicFilters component manages academic-specific filter state (database, year, toggles, citations, fields, SJR). It's conditionally rendered in DiscoverSourcesModal (sidebar panel) and ChatInput (dropdown from "+" menu). Filter state is managed locally within each parent component.

**Tech Stack:** React 19.2, TypeScript, Tailwind CSS v4, shadcn/ui, Lucide icons, existing patterns from DiscoverSourcesModal and ChatInput.

---

## File Structure

**New files:**
- `apps/web/src/features/sources/components/AcademicFilters.tsx` — Main reusable filter component
- `apps/web/src/features/sources/components/AcademicFilters.types.ts` — TypeScript interfaces
- `apps/web/src/features/sources/components/AcademicFilters.utils.ts` — Helper functions and constants

**Modified files:**
- `apps/web/src/features/sources/components/DiscoverSourcesModal.tsx` — Add sidebar integration
- `apps/web/src/features/chat/components/ChatInput.tsx` — Add dropdown integration

---

## Task 1: Create Academic Filter Types

**Files:**
- Create: `apps/web/src/features/sources/components/AcademicFilters.types.ts`

- [ ] **Step 1: Write the types file**

```typescript
export interface AcademicFilterState {
  database: "all" | "pubmed" | "arxiv";
  yearFilter: "all" | "last-n" | "custom";
  yearCount: number;
  yearStart?: number;
  yearEnd?: number;
  hasPdf: boolean;
  openAccess: boolean;
  minCitations?: number;
  fieldsOfStudy: string[];
  minSjrQuartile?: 1 | 2 | 3 | 4;
}

export interface FieldOfStudyCategory {
  name: string;
  fields: string[];
}

export interface AcademicFiltersProps {
  filters: AcademicFilterState;
  onChange: (filters: AcademicFilterState) => void;
  variant: "sidebar" | "dropdown";
  onApply?: () => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/sources/components/AcademicFilters.types.ts
git commit -m "feat: add academic filter types"
```

---

## Task 2: Create Academic Filter Utilities

**Files:**
- Create: `apps/web/src/features/sources/components/AcademicFilters.utils.ts`

- [ ] **Step 1: Write the utilities file**

```typescript
import { AcademicFilterState, FieldOfStudyCategory } from "./AcademicFilters.types";

export const DEFAULT_ACADEMIC_FILTERS: AcademicFilterState = {
  database: "all",
  yearFilter: "all",
  yearCount: 2,
  hasPdf: false,
  openAccess: false,
  fieldsOfStudy: [],
};

export const DATABASE_OPTIONS = [
  {
    value: "all" as const,
    label: "All Papers",
    description: "Search from 200M+ research papers",
    icon: "BookOpen",
  },
  {
    value: "pubmed" as const,
    label: "PubMed",
    description: "39M+ biomedical and life-science literature",
    icon: "FileText",
  },
  {
    value: "arxiv" as const,
    label: "ArXiv",
    description: "Explore research preprints from arXiv",
    icon: "Atom",
  },
];

export const FIELDS_OF_STUDY: FieldOfStudyCategory[] = [
  {
    name: "Physical Sciences",
    fields: [
      "Physics and Astronomy",
      "Chemistry",
      "Earth and Planetary Sciences",
      "Environmental Science",
      "Energy",
      "Materials Science",
    ],
  },
  {
    name: "Social Sciences",
    fields: [
      "Social Sciences",
      "Psychology",
      "Economics, Econometrics and Finance",
      "Business, Management and Accounting",
      "Decision Sciences",
    ],
  },
  {
    name: "Formal Sciences",
    fields: ["Mathematics", "Computer Science"],
  },
  {
    name: "Engineering",
    fields: ["Engineering", "Chemical Engineering"],
  },
  {
    name: "Arts \u0026 Humanities",
    fields: ["Arts and Humanities"],
  },
  {
    name: "Life Sciences",
    fields: [
      "Agricultural and Biological Sciences",
      "Biochemistry, Genetics and Molecular Biology",
      "Immunology and Microbiology",
      "Neuroscience",
    ],
  },
  {
    name: "Health Sciences",
    fields: [
      "Medicine",
      "Nursing",
      "Pharmacology, Toxicology and Pharmaceutics",
      "Dentistry",
      "Health Professions",
    ],
  },
];

export const SJR_QUARTILES = [
  { value: 1 as const, label: "Q1", color: "bg-green-100 text-green-950 border-green-300", barColor: "bg-green-500" },
  { value: 2 as const, label: "Q2 \u0026 Up", color: "bg-amber-100 text-amber-950 border-amber-300", barColor: "bg-amber-500" },
  { value: 3 as const, label: "Q3 \u0026 Up", color: "bg-orange-100 text-orange-950 border-orange-300", barColor: "bg-orange-500" },
  { value: 4 as const, label: "Q4 \u0026 Up", color: "bg-red-100 text-red-950 border-red-300", barColor: "bg-red-500" },
];
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/sources/components/AcademicFilters.utils.ts
git commit -m "feat: add academic filter utilities and constants"
```

---

## Task 3: Create AcademicFilters Component

**Files:**
- Create: `apps/web/src/features/sources/components/AcademicFilters.tsx`

- [ ] **Step 1: Write the component file**

```typescript
import React, { useState } from "react";
import {
  BookOpen,
  FileText,
  Atom,
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
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

  const containerClass = isSidebar
    ? "h-full overflow-y-auto p-5 space-y-5 border-r border-border/50 bg-card/30"
    : "w-80 max-h-[70vh] overflow-y-auto p-4 space-y-4 bg-card border border-border rounded-xl shadow-lg";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Academic Filters</h3>
        </div>
        <button
          onClick={() => onChange(DEFAULT_ACADEMIC_FILTERS)}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Database Selection */}
      <div>
        <button
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
                    isActive ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/50 border border-transparent"
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
                    <p className="text-xs text-muted-foreground mt-0.5">{db.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

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
                onChange={(e) => updateFilters({ yearCount: parseInt(e.target.value) || 1 })}
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
                    onChange={(e) => updateFilters({ yearStart: parseInt(e.target.value) || undefined })}
                    className="w-20 px-2 py-1 text-sm border border-border rounded-md bg-background"
                  />
                  <span className="text-sm text-muted-foreground">-</span>
                  <input
                    type="number"
                    placeholder="End"
                    value={filters.yearEnd || ""}
                    onChange={(e) => updateFilters({ yearEnd: parseInt(e.target.value) || undefined })}
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
              minCitations: e.target.value ? parseInt(e.target.value) : undefined,
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
                    isActive ? q.color : "border-transparent hover:bg-muted/50"
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
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${q.color}`}>
                    {q.label}
                  </span>
                  <div className={`flex-1 h-1.5 rounded-full ${q.barColor} opacity-60`} />
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Apply button (for dropdown variant) */}
      {!isSidebar && onApply && (
        <button
          onClick={onApply}
          className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          Apply Filters
        </button>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/sources/components/AcademicFilters.tsx
git commit -m "feat: create AcademicFilters component with all filter sections"
```

---

## Task 4: Integrate AcademicFilters into DiscoverSourcesModal

**Files:**
- Modify: `apps/web/src/features/sources/components/DiscoverSourcesModal.tsx`

- [ ] **Step 1: Add imports**

Add to the existing imports at the top:
```typescript
import { AcademicFilters } from "./AcademicFilters";
import { AcademicFilterState } from "./AcademicFilters.types";
import { DEFAULT_ACADEMIC_FILTERS } from "./AcademicFilters.utils";
```

- [ ] **Step 2: Add academic filters to FilterState**

Modify the `FilterState` interface (around line 41):
```typescript
interface FilterState {
  sourceTypes: ("web" | "news" | "academic" | "finance")[];
  timeRange?: "day" | "week" | "month" | "year";
  academic: {
    minCitations?: number;
    openAccessOnly?: boolean;
    hasFullText?: boolean;
    advancedFilters?: AcademicFilterState;  // ADD THIS
  };
  sortBy: "relevance" | "date" | "citations";
  maxResults: number;
}
```

- [ ] **Step 3: Update DEFAULT_FILTERS**

Modify the default (around line 53):
```typescript
const DEFAULT_FILTERS: FilterState = {
  sourceTypes: ["web"],
  sortBy: "relevance",
  maxResults: 20,
  academic: {
    advancedFilters: DEFAULT_ACADEMIC_FILTERS,  // ADD THIS
  },
};
```

- [ ] **Step 4: Add state for academic filters sidebar**

Add inside the component (around line 244, after other state declarations):
```typescript
const [showAcademicFilters, setShowAcademicFilters] = useState(false);
```

- [ ] **Step 5: Add academic filters sidebar to layout**

Find the results area (around line 754) and wrap it with a conditional sidebar:

Replace:
```jsx
<div
  className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-card/50 px-6 md:px-10 ${selectedCount > 0 ? "pb-0" : "pb-6"}`}
>
```

With:
```jsx
<div className="flex flex-1 min-h-0 overflow-hidden">
  {/* Academic Filters Sidebar */}
  {filters.sourceTypes.includes("academic") && showAcademicFilters && (
    <div className="w-72 shrink-0 border-r border-border/50 overflow-y-auto">
      <AcademicFilters
        filters={filters.academic.advancedFilters || DEFAULT_ACADEMIC_FILTERS}
        onChange={(advancedFilters) =>
          setFilters((prev) => ({
            ...prev,
            academic: { ...prev.academic, advancedFilters },
          }))
        }
        variant="sidebar"
      />
    </div>
  )}
  
  <div
    className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-card/50 px-6 md:px-10 ${selectedCount > 0 ? "pb-0" : "pb-6"}`}
  >
```

And close the new div after the existing content (after line 809, before the closing `</div>` for the results area).

- [ ] **Step 6: Add toggle button for academic filters**

Add a button in the filter bar (around line 581, before the Filters button):
```jsx
{filters.sourceTypes.includes("academic") && (
  <button
    type="button"
    onClick={() => setShowAcademicFilters((prev) => !prev)}
    className={`inline-flex h-9 items-center gap-2 px-3 rounded-lg border text-sm font-medium transition-all ${
      showAcademicFilters
        ? "border-primary bg-primary/10 text-primary"
        : "border-transparent bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:border-border"
    }`}
  >
    <GraduationCap className="w-3.5 h-3.5 shrink-0" />
    Academic Filters
  </button>
)}
```

Note: Add `GraduationCap` to the imports from lucide-react.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/sources/components/DiscoverSourcesModal.tsx
git commit -m "feat: integrate AcademicFilters into DiscoverSourcesModal sidebar"
```

---

## Task 5: Integrate AcademicFilters into ChatInput

**Files:**
- Modify: `apps/web/src/features/chat/components/ChatInput.tsx`

- [ ] **Step 1: Add imports**

Add to existing imports:
```typescript
import { AcademicFilters } from "@/features/sources/components/AcademicFilters";
import { AcademicFilterState } from "@/features/sources/components/AcademicFilters.types";
import { DEFAULT_ACADEMIC_FILTERS } from "@/features/sources/components/AcademicFilters.utils";
```

- [ ] **Step 2: Add academic filter props**

Add to `ChatInputProps` (after line 62):
```typescript
academicFilters?: AcademicFilterState;
onAcademicFiltersChange?: (filters: AcademicFilterState) => void;
```

- [ ] **Step 3: Destructure new props**

Add to the destructured props (around line 86):
```typescript
academicFilters,
onAcademicFiltersChange,
```

- [ ] **Step 4: Add state for academic filter dropdown**

Add inside the component (after other state declarations):
```typescript
const [academicFiltersOpen, setAcademicFiltersOpen] = useState(false);
const academicFiltersRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 5: Add outside click handler**

Add useEffect for closing the dropdown (after other similar effects):
```typescript
useEffect(() => {
  if (!academicFiltersOpen) return;
  const handleClick = (e: MouseEvent) => {
    if (
      academicFiltersRef.current &&
      !academicFiltersRef.current.contains(e.target as Node)
    ) {
      setAcademicFiltersOpen(false);
    }
  };
  document.addEventListener("mousedown", handleClick);
  return () => document.removeEventListener("mousedown", handleClick);
}, [academicFiltersOpen]);
```

- [ ] **Step 6: Add academic filter button in source filters section**

In the dropup menu (around line 416, after the Source filters section), add:
```jsx
{activeFilters.includes("academic") && onAcademicFiltersChange && (
  <div className="mt-2 pt-2 border-t border-border">
    <div className="relative" ref={academicFiltersRef}>
      <button
        type="button"
        onClick={() => setAcademicFiltersOpen((prev) => !prev)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
          academicFiltersOpen
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted/80 text-foreground"
        }`}
      >
        <SlidersHorizontal className="w-4 h-4 shrink-0" />
        <span>Academic Filters</span>
        {academicFilters && academicFilters.database !== "all" && (
          <span className="ml-auto text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
            Active
          </span>
        )}
      </button>
      
      {academicFiltersOpen && (
        <div className="absolute bottom-full left-0 mb-2 z-50">
          <AcademicFilters
            filters={academicFilters || DEFAULT_ACADEMIC_FILTERS}
            onChange={(filters) => {
              onAcademicFiltersChange(filters);
            }}
            variant="dropdown"
            onApply={() => setAcademicFiltersOpen(false)}
          />
        </div>
      )}
    </div>
  </div>
)}
```

Note: Add `SlidersHorizontal` to the lucide-react imports.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/chat/components/ChatInput.tsx
git commit -m "feat: integrate AcademicFilters into ChatInput dropdown"
```

---

## Task 6: Wire up AcademicFilters in ChatPanel

**Files:**
- Modify: `apps/web/src/features/chat/components/ChatPanel.tsx`

- [ ] **Step 1: Add state for academic filters**

Add near other state declarations (around line 108):
```typescript
const [academicFilters, setAcademicFilters] = useState<AcademicFilterState>(DEFAULT_ACADEMIC_FILTERS);
```

- [ ] **Step 2: Pass academic filters to ChatInput**

Find where ChatInput is rendered (around line 880) and add:
```jsx
academicFilters={academicFilters}
onAcademicFiltersChange={setAcademicFilters}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/chat/components/ChatPanel.tsx
git commit -m "feat: wire up academic filters state in ChatPanel"
```

---

## Task 7: Type Checking and Verification

- [ ] **Step 1: Run web typecheck**

```bash
bun run typecheck:web
```

Expected: No TypeScript errors.

- [ ] **Step 2: Run lint**

```bash
bun run lint
```

Expected: No lint errors.

- [ ] **Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve typecheck and lint issues"
```

---

## Spec Coverage Check

- **Database selection (All/PubMed/ArXiv):** ✅ Task 3 (AcademicFilters component)
- **Publication Year filters:** ✅ Task 3
- **Has PDF toggle:** ✅ Task 3
- **Open Access toggle:** ✅ Task 3
- **Citations input:** ✅ Task 3
- **Field of Study checkboxes:** ✅ Task 3
- **SJR Quartile selection:** ✅ Task 3
- **DiscoverSourcesModal sidebar integration:** ✅ Task 4
- **ChatInput dropdown integration:** ✅ Task 5
- **ChatPanel state wiring:** ✅ Task 6

## Placeholder Scan

- No "TBD", "TODO", or "implement later" found ✅
- No vague requirements like "add appropriate error handling" ✅
- No "similar to Task N" references ✅
- All code blocks contain actual implementation ✅

## Type Consistency Check

- `AcademicFilterState` interface matches usage across all tasks ✅
- `variant` prop values are consistent ("sidebar" | "dropdown") ✅
- `onChange` callback signature matches everywhere ✅
- `DEFAULT_ACADEMIC_FILTERS` imported from utils in all files ✅

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-04-academic-filters.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach would you prefer?**
