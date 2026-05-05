# Academic Research Filters Design

## Overview

Add comprehensive academic paper filtering capabilities to both the **Discover Sources modal** and the **Chat input area**. These filters only appear when the "Academic" source type is active, providing researchers with precise control over paper databases, publication criteria, field of study, and journal quality metrics.

## Goals

1. Allow users to filter academic papers by database (All Papers, PubMed, ArXiv)
2. Provide publication year filtering (All, Last N years, Custom range)
3. Add toggles for PDF availability and Open Access status
4. Enable minimum citation count filtering
5. Support field-of-study multi-select with hierarchical categories
6. Include journal quality filtering via SJR quartiles

## Architecture

A reusable `AcademicFilters` component will be created in `apps/web/src/features/sources/components/`. This component manages its own state and renders a filter panel that can be used as a sidebar (in DiscoverSourcesModal) or a dropdown/popover (in ChatInput). The component is conditionally rendered in both parent components only when "academic" is in the active source types.

### Data Flow

```
DiscoverSourcesModal / ChatInput
    ├── Checks if "academic" is active
    ├── Renders AcademicFilters component
    │   ├── Manages internal filter state
    │   ├── Renders filter UI
    │   └── Calls onChange when filters are applied
    └── Receives filter state for API calls
```

## Data Model

### AcademicFilterState

```typescript
interface AcademicFilterState {
  // Database selection
  database: "all" | "pubmed" | "arxiv";
  
  // Publication year
  yearFilter: "all" | "last-n" | "custom";
  yearCount?: number;  // for "last-n" mode
  yearStart?: number;  // for "custom" mode
  yearEnd?: number;    // for "custom" mode
  
  // Toggles
  hasPdf: boolean;
  openAccess: boolean;
  
  // Citations
  minCitations?: number;
  
  // Field of study (multi-select)
  fieldsOfStudy: string[];
  
  // Journal rating
  minSjrQuartile?: 1 | 2 | 3 | 4; // Q1=1, Q2+=2, Q3+=3, Q4+=4
}
```

### Field of Study Categories

```typescript
const FIELDS_OF_STUDY = {
  "Physical Sciences": [
    "Physics and Astronomy",
    "Chemistry",
    "Earth and Planetary Sciences",
    "Environmental Science",
    "Energy",
    "Materials Science",
    "Mathematics"
  ],
  "Social Sciences": [
    "Social Sciences",
    "Psychology",
    "Economics, Econometrics and Finance",
    "Business, Management and Accounting",
    "Decision Sciences"
  ],
  "Formal Sciences": [
    "Mathematics",
    "Computer Science"
  ],
  "Engineering": [
    "Engineering",
    "Chemical Engineering"
  ],
  "Arts & Humanities": [
    "Arts and Humanities"
  ],
  "Life Sciences": [
    "Agricultural and Biological Sciences",
    "Biochemistry, Genetics and Molecular Biology",
    "Immunology and Microbiology",
    "Neuroscience"
  ],
  "Health Sciences": [
    "Medicine",
    "Nursing",
    "Pharmacology, Toxicology and Pharmaceutics",
    "Dentistry",
    "Health Professions"
  ]
} as const;
```

## Component Design

### AcademicFilters Component

**Location:** `apps/web/src/features/sources/components/AcademicFilters.tsx`

**Props:**
```typescript
interface AcademicFiltersProps {
  filters: AcademicFilterState;
  onChange: (filters: AcademicFilterState) => void;
  variant: "sidebar" | "dropdown";
  onApply?: () => void; // For dropdown variant - closes the popover
}
```

**Layout (sidebar variant - DiscoverSourcesModal):**
- Full-height panel on the left or right side of the modal
- Scrollable if content overflows
- Each filter section is collapsible/expandable
- "Apply Filters" button at the bottom
- "Reset" button at the bottom

**Layout (dropdown variant - ChatInput):**
- Dropdown/popover attached to a filter button
- Compact layout with collapsed sections by default
- "Apply" button to confirm and close

**Sections:**

1. **Database Selection** (radio group)
   - All Papers (with description: "Search from 200M+ research papers")
   - PubMed ("39M+ biomedical and life-science literature")
   - ArXiv ("Explore research preprints from arXiv")

2. **Publication Year**
   - Radio: All Years
   - Radio: Last [input] Years
   - Radio: Custom [start] - [end]

3. **Toggles**
   - Has PDF (toggle switch)
   - Open Access (toggle switch)

4. **Citations**
   - Label: "Citations ≥"
   - Number input with placeholder "Min 1"

5. **Field of Study**
   - Search input to filter fields
   - Grouped by category:
     - Physical Sciences
     - Social Sciences
     - Formal Sciences
     - Engineering
     - Arts & Humanities
     - Life Sciences
     - Health Sciences
   - "See 1 more..." expand button for groups with many items
   - Checkboxes for each field

6. **Journal Rating - SJR**
   - Expandable section
   - Q1 (green badge + checkbox)
   - Q2 & Up (orange badge + checkbox)
   - Q3 & Up (orange badge + checkbox)
   - Q4 & Up (red badge + checkbox)
   - Only one quartile can be selected at a time (radio behavior)

### Integration Points

**DiscoverSourcesModal:**
- When `filters.sourceTypes.includes("academic")`, show AcademicFilters sidebar
- Position: Left side of the results area
- AcademicFilters state stored in `FilterState.academic.advancedFilters`
- Applied to the `discover` API call

**ChatInput:**
- In the "+" menu dropup, when "Academic" source type is active
- Show "Academic Filters" button that opens a popover
- Position: Next to the source type filters or as a separate button
- Filter state stored in component state or passed via props
- Applied when sending messages (via `sourceFilters` or similar mechanism)

## UI/UX Details

### Styling
- Follow existing design system (Tailwind, shadcn components)
- Use existing color tokens: primary, muted-foreground, border, etc.
- Use existing components: Checkbox, Radio, Toggle, Input from shadcn
- Section headers: `text-sm font-medium text-foreground`
- Labels: `text-xs text-muted-foreground`
- Group labels: `text-xs font-medium uppercase tracking-wide text-muted-foreground`

### Interactions
- Checkboxes for multi-select (fields of study)
- Radio buttons for mutually exclusive options (database, year filter)
- Toggle switches for boolean options (has PDF, open access)
- Number input for citations
- Expand/collapse for sections with many options
- "Apply Filters" button commits changes
- "Reset" button returns to defaults
- Dropdown variant auto-applies on close (optional)

### Accessibility
- Proper labeling for all inputs
- Keyboard navigation support
- Focus management in dropdown variant
- Screen reader friendly section headers

## File Structure

```
apps/web/src/features/sources/
├── components/
│   ├── AcademicFilters.tsx           # New: Main filter component
│   ├── AcademicFilters.types.ts      # New: Type definitions
│   ├── AcademicFilters.utils.ts      # New: Utility functions
│   ├── DiscoverSourcesModal.tsx      # Modified: Add sidebar integration
│   └── ChatInput.tsx                 # Modified: Add dropdown integration
├── hooks/
│   └── useAcademicFilters.ts         # New: Shared filter state hook (optional)
└── services/
    └── documentsApi.ts               # Modified: Pass filters to API
```

## API Changes

The `discover` API (in `documentsApi.ts`) needs to accept the new academic filter state:

```typescript
interface DiscoveryParams {
  query: string;
  sourceTypes: ("web" | "news" | "academic" | "finance")[];
  timeRange?: "day" | "week" | "month" | "year";
  academicFilters?: AcademicFilterState;  // NEW
  maxResults: number;
  sortBy: "relevance" | "date" | "citations";
}
```

**Note:** Not all filters may be supported by the backend immediately. Phase 1 can include UI-only changes with UI state management, while Phase 2 wires them to the actual backend.

## Testing Considerations

1. **Unit tests for AcademicFilters:**
   - State management works correctly
   - Filter application triggers onChange
   - Reset returns to defaults
   - Section expand/collapse works

2. **Integration tests:**
   - Filters appear only when academic is selected
   - Filters are applied to API calls
   - Filter state persists (sessionStorage for DiscoverSourcesModal)

3. **E2E tests:**
   - User can open filters in both locations
   - User can select and apply filters
   - Results are filtered correctly

## Open Questions

1. Should we persist academic filter state separately from general discovery filters?
2. Do we need to show active filter count/badge on the filter button?
3. Should the backend support all these filters immediately, or is UI-only Phase 1 acceptable?

## Phase Breakdown

**Phase 1 (UI):**
- Create AcademicFilters component with all UI elements
- Integrate into DiscoverSourcesModal as sidebar
- Integrate into ChatInput as dropdown
- Store state in component/session state

**Phase 2 (Backend):**
- Update API to accept academic filter parameters
- Implement filtering logic in backend services
- Wire frontend state to API calls

## Spec Self-Review

- **Placeholder scan:** No TBDs or TODOs
- **Internal consistency:** Filter state interface matches UI sections
- **Scope check:** Focused on UI component + integration, not backend implementation
- **Ambiguity check:** Clear which filters are radio vs checkbox vs toggle
- **File paths:** All paths follow existing conventions

## Approval Status

✅ User approved Approach 2 (Separate AcademicFilters component)
✅ User confirmed filters only show when Academic source type is selected

Ready for implementation plan.
