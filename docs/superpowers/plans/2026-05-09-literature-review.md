# Literature Review & Deep Research Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Literature Review agent with step tracking, structured comparison tables, formal academic reports with citations, and enhance the existing Research Agent to display steps and generate artifacts.

**Architecture:** Uses `@convex-dev/workflow` for durable orchestration of the multi-step literature review pipeline. Citation engine as a reusable utility. LangGraph agents for LLM reasoning. Frontend components for table/report views with column management.

**Tech Stack:** Convex, TypeScript, LangGraph, React, Tailwind, @convex-dev/workflow

---

## File Structure

### New Files

```
convex/
  _utils/
    CitationEngine.ts              # Citation formatting utility
    CitationEngine.test.ts         # Unit tests
  _agents/literature_review/
    LiteratureReviewGraph.ts       # Main workflow handler
    state.ts                       # LangGraph state definition
    nodes/
      planReview.ts                # Plan search strategy + suggest columns
      searchPapers.ts              # Search academic sources
      deduplicatePapers.ts         # Remove duplicates
      rankPapers.ts                # ZeroEntropy reranking
      screenPapers.ts              # PRISMA-style screening
      extractData.ts               # Batched data extraction
      generateTable.ts             # Create literature table
      generateReport.ts            # Generate formal report
    prompts.ts                     # LLM prompts
    types.ts                       # Type definitions
  studio/literature_tables/
    index.ts                       # CRUD operations
    scheduling.ts                  # Workflow scheduling
  studio/literature_reports/
    index.ts                       # CRUD operations
  schema.ts                        # Add new tables

apps/web/src/features/studio/components/views/
  LiteratureTableView.tsx          # Table with column management
  LiteratureReportView.tsx         # Report with citations
  CitationStylePicker.tsx          # Citation style dropdown

apps/web/src/features/chat/components/
  ResearchModeToggle.tsx           # Chat/Research toggle
  ResearchSteps.tsx                # Step tracker UI
```

### Modified Files

```
convex/
  schema.ts                        # Add citations, literatureTables, etc.
  _agents/research/
    nodes.ts                       # Add step tracking + artifact generation
  _services/search/
    AcademicSearchService.ts       # May need adjustments

apps/web/src/features/chat/
  ChatInput.tsx                    # Add mode toggle
  ChatContainer.tsx                # Show step tracker
```

---

## Phase 1: Foundation

### Task 1: Database Schema

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/_utils/CitationEngine.ts`

- [ ] **Step 1: Add new tables to schema**

Add after the existing tables in `convex/schema.ts`:

```typescript
  // Literature Review & Citation tables
  citations: defineTable({
    paperId: v.string(),
    title: v.string(),
    authors: v.array(v.string()),
    year: v.optional(v.number()),
    doi: v.optional(v.string()),
    url: v.string(),
    pdfUrl: v.optional(v.string()),
    sourceApi: v.union(v.literal("arxiv"), v.literal("semantic_scholar"), v.literal("pubmed")),
    citationCount: v.optional(v.number()),
    abstract: v.optional(v.string()),
    citationKey: v.string(),
  })
    .index("by_paperId", ["paperId"])
    .index("by_citationKey", ["citationKey"]),

  literatureTables: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    status: v.union(v.literal("generating"), v.literal("completed"), v.literal("failed")),
    columns: v.array(v.object({
      id: v.string(),
      name: v.string(),
      type: v.union(v.literal("paper_title"), v.literal("authors"), v.literal("year"), v.literal("study_type"), v.literal("custom")),
      instructions: v.optional(v.string()),
      isVisible: v.boolean(),
      isSystem: v.boolean(),
      order: v.number(),
    })),
    papers: v.array(v.object({
      citationId: v.id("citations"),
      rowData: v.record(v.string(), v.string()),
      includeReason: v.optional(v.string()),
      isIncluded: v.boolean(),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"]),

  literatureReports: defineTable({
    title: v.string(),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    status: v.union(v.literal("generating"), v.literal("completed"), v.literal("failed")),
    content: v.string(),
    citationStyle: v.string(),
    sections: v.array(v.object({
      heading: v.string(),
      content: v.string(),
    })),
    citationIds: v.array(v.id("citations")),
    tableId: v.optional(v.id("literatureTables")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_table", ["tableId"]),

  researchSteps: defineTable({
    researchId: v.string(),
    agentType: v.union(v.literal("research"), v.literal("literature_review")),
    stepType: v.union(
      v.literal("searching"), v.literal("deduplicating"), v.literal("ranking"),
      v.literal("screening"), v.literal("extracting"), v.literal("populating"),
      v.literal("generating_report"), v.literal("awaiting_user_input")
    ),
    status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed"), v.literal("failed")),
    details: v.optional(v.string()),
    metadata: v.optional(v.object({
      queryCount: v.optional(v.number()),
      paperCount: v.optional(v.number()),
      includedCount: v.optional(v.number()),
      excludedCount: v.optional(v.number()),
    })),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    order: v.number(),
  })
    .index("by_research", ["researchId"]),

  literatureReviewSessions: defineTable({
    query: v.string(),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    workflowId: v.string(),
    status: v.union(v.literal("planning"), v.literal("awaiting_columns"), v.literal("searching"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
    suggestedColumns: v.optional(v.array(v.object({
      id: v.string(), name: v.string(), instructions: v.optional(v.string()),
    }))),
    confirmedColumns: v.optional(v.array(v.object({
      id: v.string(), name: v.string(), instructions: v.optional(v.string()), isVisible: v.boolean(),
    }))),
    error: v.optional(v.string()),
    tableId: v.optional(v.id("literatureTables")),
    reportId: v.optional(v.id("literatureReports")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"]),

  literatureTableDrafts: defineTable({
    sessionId: v.id("literatureReviewSessions"),
    citationId: v.id("citations"),
    rowData: v.record(v.string(), v.string()),
    includeReason: v.optional(v.string()),
    isIncluded: v.boolean(),
    batchNumber: v.number(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_batch", ["sessionId", "batchNumber"]),
```

- [ ] **Step 2: Run typecheck to verify schema**

Run: `bun run typecheck:convex`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add literature review and citation tables"
```

---

### Task 2: CitationEngine Utility

**Files:**
- Create: `convex/_utils/CitationEngine.ts`
- Create: `convex/_utils/CitationEngine.test.ts`

- [ ] **Step 1: Create CitationEngine interface and types**

```typescript
// convex/_utils/CitationEngine.ts

export interface Citation {
  paperId: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  url: string;
  sourceApi: "arxiv" | "semantic_scholar" | "pubmed";
}

export interface CitationEngine {
  formatInline(citation: Citation, style: string): string;
  formatReference(citation: Citation, style: string): string;
  generateReferenceList(citations: Citation[], style: string): string;
  parseCitation(raw: string): Citation | null;
}

export const SUPPORTED_STYLES = [
  "apa7", "apa6", "mla9", "mla8", "chicago17", "chicago17_notes",
  "ama11", "ama10", "acs", "ieee", "vancouver", "harvard"
] as const;

export type CitationStyle = typeof SUPPORTED_STYLES[number];
```

- [ ] **Step 2: Implement citation key generation**

```typescript
export function generateCitationKey(
  citation: Omit<Citation, "citationKey">,
  existingKeys: Set<string>
): string {
  const base = citation.authors.length > 0
    ? citation.authors[0].split(" ").pop() + (citation.year || "")
    : citation.title.slice(0, 3) + (citation.year || "");
  
  let key = base;
  let suffix = "a";
  while (existingKeys.has(key)) {
    key = base + suffix;
    suffix = String.fromCharCode(suffix.charCodeAt(0) + 1);
  }
  return key;
}
```

- [ ] **Step 3: Implement APA 7 formatter**

```typescript
function formatAPA7(citation: Citation): string {
  const authors = citation.authors.map((a, i) => {
    if (i === citation.authors.length - 1 && citation.authors.length > 1) {
      return "& " + a;
    }
    return a;
  }).join(", ");
  
  if (citation.sourceApi === "arxiv") {
    return `${authors}. (${citation.year || "n.d."}). ${citation.title}. arXiv. ${citation.url}`;
  }
  
  return `${authors}. (${citation.year || "n.d."}). ${citation.title}. ${citation.doi ? `https://doi.org/${citation.doi}` : citation.url}`;
}

function formatInlineAPA7(citation: Citation): string {
  const author = citation.authors[0]?.split(" ").pop() || "Unknown";
  if (citation.authors.length > 2) {
    return `(${author} et al., ${citation.year || "n.d."})`;
  } else if (citation.authors.length === 2) {
    const author2 = citation.authors[1]?.split(" ").pop() || "Unknown";
    return `(${author} & ${author2}, ${citation.year || "n.d."})`;
  }
  return `(${author}, ${citation.year || "n.d."})`;
}
```

- [ ] **Step 4: Implement main CitationEngine**

```typescript
export function createCitationEngine(): CitationEngine {
  return {
    formatInline(citation, style) {
      switch (style) {
        case "apa7": return formatInlineAPA7(citation);
        // Add other styles as needed
        default: return formatInlineAPA7(citation);
      }
    },
    
    formatReference(citation, style) {
      switch (style) {
        case "apa7": return formatAPA7(citation);
        default: return formatAPA7(citation);
      }
    },
    
    generateReferenceList(citations, style) {
      return citations
        .sort((a, b) => (a.authors[0] || "").localeCompare(b.authors[0] || ""))
        .map(c => this.formatReference(c, style))
        .join("\n\n");
    },
    
    parseCitation(raw) {
      // Scope: only parse citations generated by this engine
      // Implementation for internal format only
      return null;
    }
  };
}
```

- [ ] **Step 5: Write tests**

```typescript
// convex/_utils/CitationEngine.test.ts
import { describe, it, expect } from "vitest";
import { createCitationEngine, generateCitationKey } from "./CitationEngine";

describe("CitationEngine", () => {
  const engine = createCitationEngine();
  
  const mockCitation = {
    paperId: "arxiv.2401.12345",
    title: "Test Paper Title",
    authors: ["John Smith", "Alice Jones"],
    year: 2024,
    doi: "10.1234/test",
    url: "https://arxiv.org/abs/2401.12345",
    sourceApi: "arxiv" as const,
  };

  it("formats APA 7 inline citation", () => {
    const result = engine.formatInline(mockCitation, "apa7");
    expect(result).toBe("(Smith & Jones, 2024)");
  });

  it("formats APA 7 reference for arXiv", () => {
    const result = engine.formatReference(mockCitation, "apa7");
    expect(result).toContain("Smith, J., & Jones, A.");
    expect(result).toContain("arXiv");
  });

  it("generates unique citation keys", () => {
    const keys = new Set<string>();
    const key1 = generateCitationKey(mockCitation, keys);
    expect(key1).toBe("Smith2024");
    keys.add(key1);
    
    const key2 = generateCitationKey(mockCitation, keys);
    expect(key2).toBe("Smith2024a");
  });
});
```

- [ ] **Step 6: Run tests**

Run: `bun run test:convex`
Expected: CitationEngine tests PASS

- [ ] **Step 7: Commit**

```bash
git add convex/_utils/CitationEngine.ts convex/_utils/CitationEngine.test.ts
git commit -m "feat: add citation engine with APA7 support and tests"
```

---

## Phase 2: Research Agent Enhancement

### Task 3: Add Step Tracking to Research Agent

**Files:**
- Modify: `convex/_agents/research/nodes.ts`
- Create: `convex/_agents/research/steps.ts`

- [ ] **Step 1: Create step tracking utility**

```typescript
// convex/_agents/research/steps.ts
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { action } from "../../_generated/server";

export const researchStepTypes = [
  "searching", "deduplicating", "ranking", "screening",
  "extracting", "populating", "generating_report", "awaiting_user_input"
] as const;

export async function trackResearchStep(
  ctx: any,
  researchId: string,
  agentType: "research" | "literature_review",
  stepType: typeof researchStepTypes[number],
  status: "pending" | "in_progress" | "completed" | "failed",
  details?: string,
  metadata?: Record<string, number>
) {
  await ctx.runMutation(internal.researchSteps.upsert, {
    researchId,
    agentType,
    stepType,
    status,
    details,
    metadata,
    order: researchStepTypes.indexOf(stepType),
  });
}
```

- [ ] **Step 2: Add step tracking calls to research nodes**

Modify `convex/_agents/research/nodes.ts` to call `trackResearchStep` at the start and end of each major operation.

- [ ] **Step 3: Commit**

```bash
git add convex/_agents/research/steps.ts convex/_agents/research/nodes.ts
git commit -m "feat: add step tracking to research agent"
```

---

## Phase 3: Literature Review Agent

### Task 4: Install Workflow Component

**Files:**
- Modify: `package.json`
- Modify: `convex.json` (or equivalent config)

- [ ] **Step 1: Install @convex-dev/workflow**

```bash
bun add @convex-dev/workflow
```

- [ ] **Step 2: Configure workflow component**

Follow the Convex Workflow setup guide to register the component.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "deps: add @convex-dev/workflow component"
```

---

### Task 5: Implement Literature Review Nodes

**Files:**
- Create: `convex/_agents/literature_review/state.ts`
- Create: `convex/_agents/literature_review/types.ts`
- Create: `convex/_agents/literature_review/prompts.ts`
- Create: `convex/_agents/literature_review/nodes/planReview.ts`
- Create: `convex/_agents/literature_review/nodes/searchPapers.ts`
- Create: `convex/_agents/literature_review/nodes/deduplicatePapers.ts`
- Create: `convex/_agents/literature_review/nodes/rankPapers.ts`
- Create: `convex/_agents/literature_review/nodes/screenPapers.ts`
- Create: `convex/_agents/literature_review/nodes/extractData.ts`
- Create: `convex/_agents/literature_review/nodes/generateTable.ts`
- Create: `convex/_agents/literature_review/nodes/generateReport.ts`

- [ ] **Step 1: Define state and types**

```typescript
// convex/_agents/literature_review/state.ts
import { Annotation } from "@langchain/langgraph";

export const LiteratureReviewState = Annotation.Root({
  query: Annotation<string>(),
  suggestedColumns: Annotation<any[]>({ default: () => [] }),
  confirmedColumns: Annotation<any[]>({ default: () => [] }),
  papers: Annotation<any[]>({ default: () => [] }),
  rankedPapers: Annotation<any[]>({ default: () => [] }),
  screenedPapers: Annotation<any[]>({ default: () => [] }),
  extractedData: Annotation<Record<string, Record<string, string>>>({ default: () => ({}) }),
  tableColumns: Annotation<any[]>({ default: () => [] }),
  citations: Annotation<any[]>({ default: () => [] }),
  progress: Annotation<{ phase: string; percentage: number; message: string }>(),
  error: Annotation<string | undefined>(),
});
```

- [ ] **Step 2: Implement each node**

Follow the design doc for each node's implementation. Key points:
- `planReview`: Returns search queries + suggested columns
- `searchPapers`: Calls AcademicSearchService (parallel arXiv, Semantic Scholar, PubMed)
- `deduplicatePapers`: Match by DOI, then fuzzy title match
- `rankPapers`: Use ZeroEntropy reranking
- `screenPapers`: Batch 5 papers per LLM call
- `extractData`: Batch 5 papers, write to `literatureTableDrafts` after each batch
- `generateTable`: Read from `literatureTableDrafts`, write to `literatureTables`
- `generateReport`: Section-by-section generation (400-600 words each)

- [ ] **Step 3: Commit**

```bash
git add convex/_agents/literature_review/
git commit -m "feat: implement literature review agent nodes"
```

---

### Task 6: Create Workflow Handler

**Files:**
- Create: `convex/_agents/literature_review/LiteratureReviewGraph.ts`

- [ ] **Step 1: Implement workflow handler**

```typescript
// convex/_agents/literature_review/LiteratureReviewGraph.ts
import { workflow } from "@convex-dev/workflow";

export const literatureReviewWorkflow = workflow.defineHandler({
  args: {
    query: v.string(),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
  },
  handler: async (step, args) => {
    // planReview
    const plan = await step.runAction(internal.agents.literature_review.planReview, {
      query: args.query,
    });
    
    // Checkpoint: await user column confirmation
    const columnsEvent = defineEvent({
      name: "columnsConfirmed",
      validator: v.object({
        confirmedColumns: v.array(v.object({
          id: v.string(),
          name: v.string(),
          instructions: v.optional(v.string()),
          isVisible: v.boolean(),
        })),
      }),
    });
    
    const { confirmedColumns } = await step.awaitEvent(columnsEvent);
    
    // searchPapers (parallel)
    const [arxivResults, ssResults, pubmedResults] = await Promise.all([
      step.runAction(internal.search.searchArxiv, { query: args.query }),
      step.runAction(internal.search.searchSemanticScholar, { query: args.query }),
      step.runAction(internal.search.searchPubmed, { query: args.query }),
    ]);
    
    // ... remaining nodes
    
    return { tableId, reportId };
  },
});
```

- [ ] **Step 2: Create mutation to confirm columns**

```typescript
export const confirmLiteratureReviewColumns = mutation({
  args: {
    sessionId: v.string(),
    confirmedColumns: v.array(v.object({
      id: v.string(),
      name: v.string(),
      instructions: v.optional(v.string()),
      isVisible: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    await sendEvent(ctx, components.workflow, {
      ...columnsEvent,
      workflowId: args.sessionId,
      value: { confirmedColumns: args.confirmedColumns },
    });
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add convex/_agents/literature_review/LiteratureReviewGraph.ts
git commit -m "feat: add workflow handler for literature review agent"
```

---

## Phase 4: Frontend Components

### Task 7: Create ResearchSteps Component

**Files:**
- Create: `apps/web/src/features/chat/components/ResearchSteps.tsx`

- [ ] **Step 1: Implement step tracker UI**

```tsx
// apps/web/src/features/chat/components/ResearchSteps.tsx
import React from "react";

interface ResearchStep {
  type: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  title: string;
  description: string;
  details?: string;
}

export function ResearchSteps({ steps }: { steps: ResearchStep[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={index} className="flex items-start gap-3">
          <div className="mt-1">
            {step.status === "completed" && <CheckCircle className="w-5 h-5 text-green-500" />}
            {step.status === "in_progress" && <Loader className="w-5 h-5 animate-spin" />}
            {step.status === "failed" && <XCircle className="w-5 h-5 text-red-500" />}
            {step.status === "pending" && <Circle className="w-5 h-5 text-gray-300" />}
          </div>
          <div>
            <h4 className="font-medium">{step.title}</h4>
            <p className="text-sm text-gray-600">{step.description}</p>
            {step.details && (
              <p className="text-sm text-gray-500 mt-1">{step.details}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/chat/components/ResearchSteps.tsx
git commit -m "feat: add ResearchSteps UI component"
```

---

### Task 8: Create LiteratureTableView

**Files:**
- Create: `apps/web/src/features/studio/components/views/LiteratureTableView.tsx`

- [ ] **Step 1: Implement table view with column management**

Follow the design doc for:
- Left panel: Paper list
- Right: Scrollable table
- Top bar: Title, Add Papers, Manage Columns, Save, Export
- Column sidebar: Suggested, Default, Custom columns

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/studio/components/views/LiteratureTableView.tsx
git commit -m "feat: add LiteratureTableView with column management"
```

---

### Task 9: Create LiteratureReportView

**Files:**
- Create: `apps/web/src/features/studio/components/views/LiteratureReportView.tsx`
- Create: `apps/web/src/features/studio/components/CitationStylePicker.tsx`

- [ ] **Step 1: Implement report view**

Follow the design doc for:
- Full-width document view
- Citation style picker
- Inline citation hover
- References section
- Export PDF

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/studio/components/views/LiteratureReportView.tsx
git add apps/web/src/features/studio/components/CitationStylePicker.tsx
git commit -m "feat: add LiteratureReportView with citation support"
```

---

## Phase 5: Integration

### Task 10: Wire Up Research Mode Toggle

**Files:**
- Modify: `apps/web/src/features/chat/ChatInput.tsx`
- Modify: `apps/web/src/features/chat/ChatContainer.tsx`

- [ ] **Step 1: Add mode toggle to chat input**

- [ ] **Step 2: Show step tracker in chat container**

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/chat/
git commit -m "feat: integrate research mode toggle and step tracking"
```

---

### Task 11: End-to-End Testing

- [ ] **Step 1: Test full literature review flow**

1. Start a literature review
2. Verify column suggestions appear
3. Confirm columns
4. Verify steps progress through searching → ranking → screening → extracting
5. Verify table and report are generated
6. Verify citations are formatted correctly

- [ ] **Step 2: Test error recovery**

1. Induce a failure in extractData
2. Verify "Retry" button appears
3. Click retry
4. Verify workflow resumes from failed batch

- [ ] **Step 3: Run full test suite**

Run: `bun run test:convex`
Run: `bun run test:web`
Expected: ALL PASS

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck:convex`
Run: `bun run typecheck:web`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: add e2e tests for literature review flow"
```

---

## Spec Coverage Check

| Spec Requirement | Implementing Task |
|---|---|
| `citations` table | Task 1 |
| `literatureTables` table | Task 1 |
| `literatureReports` table | Task 1 |
| `researchSteps` table | Task 1 |
| `literatureReviewSessions` table | Task 1 |
| `literatureTableDrafts` table | Task 1 |
| CitationEngine with APA7 | Task 2 |
| Citation key generation | Task 2 |
| Step tracking for Research Agent | Task 3 |
| Workflow component installation | Task 4 |
| planReview node | Task 5 |
| searchPapers node | Task 5 |
| deduplicatePapers node | Task 5 |
| rankPapers node (ZeroEntropy) | Task 5 |
| screenPapers node (batched) | Task 5 |
| extractData node (batched, retry) | Task 5 |
| generateTable node | Task 5 |
| generateReport node (section-by-section) | Task 5 |
| Workflow handler with awaitEvent | Task 6 |
| Column confirmation mutation | Task 6 |
| ResearchSteps UI | Task 7 |
| LiteratureTableView | Task 8 |
| LiteratureReportView | Task 9 |
| CitationStylePicker | Task 9 |
| Research mode toggle | Task 10 |
| End-to-end testing | Task 11 |

---

## Open Issues

1. **@convex-dev/workflow integration** — Verify the exact API matches the design doc before implementation
2. **ZeroEntropy reranking** — Confirm the API supports batch reranking of academic papers
3. **Mobile table layout** — The table is inherently wide; test horizontal scroll with sticky first column

---

## Risk Mitigation

1. **Workflow component compatibility** — Test with a simple workflow first before implementing the full literature review pipeline
2. **Document size limits** — `literatureTableDrafts` prevents 1 MiB limit, but monitor for edge cases with very long extractions
3. **Action timeout** — Batch size of 5 should stay under 10-minute timeout, but validate with performance spike
4. **Citation style completeness** — Start with APA7, add others incrementally to avoid blocking the release
