# Literature Review & Deep Research Enhancement — Design Document

**Date:** 2026-05-09  
**Status:** Approved  
**Goal:** Reverse-engineer Paperguide's literature review feature — structured comparison tables, formal academic reports with citations, and step-by-step research progress display. Enhance the existing research agent and build a dedicated literature review agent.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Model](#data-model)
4. [Agent Design](#agent-design)
5. [Citation Engine](#citation-engine)
6. [Frontend Design](#frontend-design)
7. [Implementation Phases](#implementation-phases)
8. [Future Extensibility](#future-extensibility)

---

## Overview

### Problem

Users need a dedicated research mode that:

- Searches external academic sources (arXiv, Semantic Scholar, PubMed)
- Produces structured comparison tables with configurable columns
- Generates formal academic reports with proper citations
- Shows transparent step-by-step progress (searching → ranking → screening → extracting → reporting)
- Supports multiple citation styles (APA, MLA, Chicago, etc.)

### Solution

Build two complementary systems:

1. **Enhanced Research Agent** — Add step tracking + artifact generation to existing `convex/_agents/research/`
2. **Literature Review Agent** — New `convex/_agents/literature_review/` with systematic review workflow

Both agents produce:

- `literatureTables` — Structured comparison tables
- `literatureReports` — Formal academic reports with citations

### Non-Goals (v1)

- Collaborative editing of tables/reports
- Real-time collaboration on research sessions
- Automatic PDF ingestion from search results
- Advanced PRISMA flowchart generation
- Citation network analysis

---

## Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
├─────────────────────────────────────────────────────────────────┤
│  ResearchModeToggle    ResearchSteps    LiteratureTableView    │
│  LiteratureReportView  CitationStylePicker                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      CONVEX BACKEND                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Research Agent  │  │ LiteratureReview │  │  Citation     │  │
│  │  (enhanced)     │  │     Agent        │  │   Engine      │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           │                    │                    │          │
│  ┌────────▼────────┐  ┌────────▼─────────┐  ┌───────▼───────┐  │
│  │  AcademicSearch │  │  AcademicSearch  │  │  Citation     │  │
│  │    Service      │  │    Service       │  │   Formatter   │  │
│  └─────────────────┘  └──────────────────┘  └───────────────┘  │
│           │                    │                               │
│  ┌────────▼────────────────────▼───────────────┐              │
│  │          SHARED INFRASTRUCTURE              │              │
│  │  DiscoveryService  TavilySearchService     │              │
│  │  ZeroEntropy Rerank  AcademicLoaderService │              │
│  └─────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      DATABASE                                   │
├─────────────────────────────────────────────────────────────────┤
│  citations  │  literatureTables  │  literatureReports          │
│  researchSteps │  (existing tables: reports, spreadsheets...) │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                   | Responsibility                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Research Agent**          | External search, sub-question planning, source discovery. Enhanced with step tracking and artifact generation.                 |
| **Literature Review Agent** | Systematic review workflow: plan → search → dedup → rank → screen → extract → table → report                                   |
| **Citation Engine**         | Format citations in multiple styles. Generate inline markers and reference lists. Pure utility, no external calls.             |
| **AcademicSearchService**   | Search arXiv, Semantic Scholar, PubMed. Already exists at `convex/_services/search/AcademicSearchService.ts`.                  |
| **DiscoveryService**        | Unified source discovery (web, news, academic). Already exists at `convex/_services/search/DiscoveryService.ts`.               |
| **ZeroEntropy**             | Rerank search results by relevance. Already integrated.                                                                        |
| **Workflow**                | `@convex-dev/workflow` — durable orchestration for long-running multi-step agents with checkpoints, retry, and crash recovery. |

### Orchestration: `@convex-dev/workflow`

The official `@convex-dev/workflow` component is the **primary orchestration layer** for the Literature Review Agent. It replaces hand-rolled checkpointing with durable, crash-safe execution.

**Key primitives used:**

| Primitive                        | Purpose                                                  | Replaces                                      |
| -------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| `step.runAction()`               | Execute non-deterministic work (LLM calls, API searches) | Direct action calls                           |
| `step.awaitEvent()`              | Pause indefinitely for user input (column confirmation)  | `literatureReviewSessions` + `ctx.scheduler`  |
| `restart({ from: stepName })`    | Resume from a specific step after failure                | Manual `currentNode` tracking + resume action |
| `step.runAction(..., { retry })` | Per-step retry with backoff                              | Manual `Promise.allSettled()` + retry logic   |
| `Promise.all([...])`             | Parallel execution with automatic limit                  | Manual batching                               |
| `getStatus()`                    | Reactive progress querying                               | `researchSteps` polling (coarser granularity) |

**Workflow handler structure:**

```typescript
export const literatureReviewWorkflow = workflow.defineHandler({
  args: { query: v.string(), notebookId: v.id("notebooks"), ... },
  handler: async (step, args) => {
    // planReview: LLM suggests columns
    const suggestedColumns = await step.runAction(
      internal.agents.literature_review.planReview,
      { query: args.query }
    );

    // Checkpoint: await user column confirmation
    const columnsEvent = defineEvent({
      name: "columnsConfirmed",
      validator: v.object({ confirmedColumns: v.array(columnValidator) }),
    });
    const { confirmedColumns } = await step.awaitEvent(columnsEvent);

    // searchPapers: parallel search across sources
    const [arxiv, semantic, pubmed] = await Promise.all([
      step.runAction(internal.search.searchArxiv, { query: args.query }),
      step.runAction(internal.search.searchSemanticScholar, { query: args.query }),
      step.runAction(internal.search.searchPubmed, { query: args.query }),
    ]);

    // ... remaining nodes
  },
});
```

**Determinism constraint:** The workflow handler itself must be deterministic. All non-deterministic work (LLM calls, API searches, randomness) must be wrapped in `step.runAction()`. This is already how the node-based design is structured.

**Event confirmation from mutation:**

```typescript
export const confirmLiteratureReviewColumns = mutation({
  args: { sessionId: v.string(), confirmedColumns: v.array(columnValidator) },
  handler: async (ctx, args) => {
    await sendEvent(ctx, components.workflow, {
      ...columnsEvent,
      workflowId: args.sessionId,
      value: { confirmedColumns: args.confirmedColumns },
    });
  },
});
```

**Retry from UI:**

```typescript
// User clicks "Retry from last step"
await restart(ctx, components.workflow, workflowId, {
  from: internal.agents.literature_review.extractData,
});
```

---

## Data Model

### New Tables

#### `citations`

Deduplicated, reusable paper metadata. Referenced by both `literatureTables` and `literatureReports`.

```typescript
citations: defineTable({
  paperId: v.string(), // External ID: arXiv ID, DOI, etc.
  title: v.string(),
  authors: v.array(v.string()),
  year: v.optional(v.number()),
  doi: v.optional(v.string()),
  url: v.string(),
  pdfUrl: v.optional(v.string()),
  sourceApi: v.union(v.literal("arxiv"), v.literal("semantic_scholar"), v.literal("pubmed")),
  citationCount: v.optional(v.number()),
  abstract: v.optional(v.string()),
  citationKey: v.string(), // e.g., "Smith2024" for inline refs
})
  .index("by_paperId", ["paperId"])
  .index("by_citationKey", ["citationKey"]);
```

**Rationale:** Citations are first-class data. A paper found in multiple research sessions gets one row. Enables future features: citation networks, bibliometrics, cross-reference validation.

**Citation key generation:** `citationKey` must be unique. Strategy:

1. Base key: `FirstAuthorLastName + Year` (e.g., "Smith2024")
2. On collision, append lowercase letter suffix: "Smith2024a", "Smith2024b", etc.
3. Enforce uniqueness at write time via index check, not at query time
4. If first author is unavailable, use first 3 chars of title + year

#### `literatureTables`

Structured comparison tables with configurable columns and extracted cell data.

```typescript
literatureTables: defineTable({
  title: v.string(), // e.g., "Reliability of LLM Evaluation Benchmarks"
  description: v.optional(v.string()),
  notebookId: v.id("notebooks"),
  userId: v.id("users"),
  status: v.union(v.literal("generating"), v.literal("completed"), v.literal("failed")),
  columns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      type: v.union(
        v.literal("paper_title"), // System column: paper title
        v.literal("authors"), // System column: authors
        v.literal("year"), // System column: publication year
        v.literal("study_type"), // System column: study design/type
        v.literal("custom") // User-defined column
      ),
      instructions: v.optional(v.string()), // For custom columns: LLM extraction prompt
      isVisible: v.boolean(),
      isSystem: v.boolean(), // true for paper_title, authors, year (non-removable)
      order: v.number(),
    })
  ),
  papers: v.array(
    v.object({
      citationId: v.id("citations"),
      rowData: v.record(v.string(), v.string()), // columnId -> extracted content
      includeReason: v.optional(v.string()), // Screening decision reasoning
      isIncluded: v.boolean(),
    })
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_notebook", ["notebookId"])
  .index("by_user", ["userId"]);
```

**Rationale:** Stores both table structure (columns) and content (cell data). Column definitions include extraction instructions so the LLM knows what to extract. Screening decisions are stored per paper for transparency.

**Scaling note:** `papers` is an embedded array. This works for 20-30 papers but becomes problematic at 100+ (Convex document size limits, patch conflicts). Consider a `literatureTablePapers` junction table as a follow-up for v2. For v1 the array is acceptable.

#### `literatureReports`

Formal academic reports with inline citations and configurable citation style.

```typescript
literatureReports: defineTable({
  title: v.string(),
  notebookId: v.id("notebooks"),
  userId: v.id("users"),
  status: v.union(v.literal("generating"), v.literal("completed"), v.literal("failed")),
  content: v.string(), // Markdown with inline citation markers [Smith2024]
  citationStyle: v.string(), // "apa7", "apa6", "mla9", "chicago17", etc.
  sections: v.array(
    v.object({
      heading: v.string(),
      content: v.string(),
    })
  ),
  citationIds: v.array(v.id("citations")), // Referenced citations
  tableId: v.optional(v.id("literatureTables")), // Link to companion table
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_notebook", ["notebookId"])
  .index("by_table", ["tableId"]);
```

**Rationale:** Content stored as markdown for flexibility. Sections array enables structured rendering (Abstract, Introduction, Methods, etc.). Citation style is configurable per report.

#### `researchSteps`

Track agent progress for step display UI. Used by both Research Agent and Literature Review Agent.

```typescript
researchSteps: defineTable({
  researchId: v.string(), // Generic ID: workflow ID, conversation ID, etc.
  agentType: v.union(
    v.literal("research"), // Enhanced research agent
    v.literal("literature_review") // Literature review agent
  ),
  stepType: v.union(
    v.literal("searching"),
    v.literal("deduplicating"),
    v.literal("ranking"),
    v.literal("screening"),
    v.literal("extracting"),
    v.literal("populating"),
    v.literal("generating_report"),
    v.literal("awaiting_user_input") // For checkpoint: user confirms columns
  ),
  status: v.union(
    v.literal("pending"),
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("failed")
  ),
  details: v.optional(v.string()), // e.g., "Found 100 papers", "Ranked by relevance"
  metadata: v.optional(
    v.object({
      queryCount: v.optional(v.number()),
      paperCount: v.optional(v.number()),
      includedCount: v.optional(v.number()),
      excludedCount: v.optional(v.number()),
    })
  ),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  order: v.number(),
}).index("by_research", ["researchId"]);
```

**Rationale:** Enables real-time progress display for both agents. `agentType` discriminator allows both Research Agent and Literature Review Agent to use the same table. Metadata captures counts for UI summaries. `awaiting_user_input` status supports the checkpoint pattern.

#### `literatureReviewSessions`

**UI state only.** Stores the user's view of the literature review session — NOT the workflow's durability layer. Workflow handles its own checkpointing internally.

```typescript
literatureReviewSessions: defineTable({
  query: v.string(),
  notebookId: v.id("notebooks"),
  userId: v.id("users"),
  workflowId: v.string(), // Links to @convex-dev/workflow instance
  status: v.union(
    v.literal("planning"),
    v.literal("awaiting_columns"),
    v.literal("searching"),
    v.literal("processing"),
    v.literal("completed"),
    v.literal("failed")
  ),
  suggestedColumns: v.optional(
    v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        instructions: v.optional(v.string()),
      })
    )
  ),
  confirmedColumns: v.optional(
    v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        instructions: v.optional(v.string()),
        isVisible: v.boolean(),
      })
    )
  ),
  error: v.optional(v.string()),
  tableId: v.optional(v.id("literatureTables")),
  reportId: v.optional(v.id("literatureReports")),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_notebook", ["notebookId"])
  .index("by_user", ["userId"]);
```

**Rationale:** Provides a stable row for the frontend to poll/query. The Workflow component handles its own durability internally — this table is purely for UI state and linking generated artifacts.

#### `literatureTableDrafts`

Stores extracted data incrementally as batches complete. One row per paper.

```typescript
literatureTableDrafts: defineTable({
  sessionId: v.id("literatureReviewSessions"),
  citationId: v.id("citations"),
  rowData: v.record(v.string(), v.string()), // columnId -> extracted content
  includeReason: v.optional(v.string()),
  isIncluded: v.boolean(),
  batchNumber: v.number(), // For ordering and resumption
  createdAt: v.number(),
})
  .index("by_session", ["sessionId"])
  .index("by_session_batch", ["sessionId", "batchNumber"]);
```

**Rationale:** Avoids the 1 MiB document size limit on `literatureReviewSessions`. Enables partial resumption by reading already-extracted batches from the database.

---

## Agent Design

### Part A: Enhanced Research Agent

**Location:** `convex/_agents/research/` (existing, enhanced)

**New capabilities:**

1. **Step Tracking**
   - Add `ResearchStepType` enum to track phases
   - After each node completes, upsert `researchSteps` row
   - Frontend polls for steps via Convex query

2. **Artifact Generation**
   - After research completes, new final node: `generateArtifacts`
   - Creates both `literatureTable` and `literatureReport` rows
   - Table gets auto-generated columns based on research findings
   - Report synthesizes findings with inline citations

**Updated node flow:**

```
START → planResearch → discoverSources → gatherEvidence →
  synthesizeFindings → generateArtifacts → END
```

### Part B: Literature Review Agent

**Location:** `convex/_agents/literature_review/` (new)

**LangGraph State:**

```typescript
interface LiteratureReviewState {
  query: string;
  suggestedColumns: TableColumn[];
  userConfirmedColumns: boolean;
  papers: AcademicPaper[];
  rankedPapers: AcademicPaper[];
  screenedPapers: ScreenedPaper[];
  extractedData: Record<string, Record<string, string>>; // paperId -> columnId -> content
  tableColumns: TableColumn[];
  tableId: Id<"literatureTables"> | null;
  reportId: Id<"literatureReports"> | null;
  citations: Citation[];
  progress: { phase: string; percentage: number; message: string };
  error?: string;
}
```

**⚠️ State persistence boundary:** `extractedData` exists in memory during a single workflow action run. It is **NOT persisted to the session document** — that document stores only UI state (`literatureReviewSessions`). On workflow resume, `extractedData` is rebuilt from `literatureTableDrafts` rows. Do NOT attempt to serialize the full state to the session document on every node transition — this re-introduces the 1 MiB document size problem.

**Node Flow:**

```
START → planReview → [checkpoint] → searchPapers → deduplicatePapers →
  rankPapers → screenPapers → extractData → generateTable → generateReport → END
```

#### Node Details

**`planReview`**

- **Purpose:** LLM plans search strategy and suggests column definitions
- **Input:** User research question
- **Output:** Search queries, suggested columns with names and extraction instructions
- **Prompt:** Decompose question into sub-questions, suggest 4-6 relevant columns
- **Next:** Human-in-the-loop checkpoint

**`searchPapers`**

- **Purpose:** Search external academic sources
- **Implementation:** Parallel calls to `AcademicSearchService` (arXiv, Semantic Scholar, PubMed)
- **Output:** Array of `AcademicPaper` objects
- **Step tracking:** Update `researchSteps` with "searching" status + paper count

**`deduplicatePapers`**

- **Purpose:** Remove duplicate papers from multiple sources
- **Implementation:**
  1. Match by DOI (exact)
  2. Fuzzy match by normalized title (Levenshtein distance < 0.15)
  3. Keep highest-scoring duplicate
- **Output:** Deduplicated paper list
- **Step tracking:** Update with dedup count

**`rankPapers`**

- **Purpose:** Rank papers by relevance to research question
- **Implementation:** ZeroEntropy reranking (NOT LLM scoring)
- **Why ZeroEntropy:** LLM scoring 50+ papers is expensive and slow. ZeroEntropy is already integrated and optimized for this.
- **Output:** Ranked paper list
- **Step tracking:** Update with ranking complete

**`screenPapers`**

- **Purpose:** PRISMA-style eligibility screening
- **Implementation:** Batch 5 papers per LLM call with structured output:
  ```typescript
  {
    decisions: [{ paperId, isIncluded, reason }];
  }
  ```
  This cuts calls by 5× vs. one call per paper with minimal quality loss since each decision is independent.
- **Threshold:** Screen top 30 ranked papers (not a score cutoff — score distributions vary too much across queries)
- **Output:** `ScreenedPaper[]` with `isIncluded` and `includeReason`
- **Step tracking:** Update with included/excluded counts
- **UI:** Show screening results with include/exclude badges

**`extractData`**

- **Purpose:** Extract data for each column per paper
- **Implementation:** Batched parallel extraction via Workflow's built-in parallelism
  - Each batch is a `step.runAction()` call with per-step retry config:
    ```typescript
    await step.runAction(internal.agents.literature_review.extractBatch, args, {
      retry: { maxAttempts: 3, initialBackoffMs: 500, base: 2 },
    });
    ```
  - Workflow automatically caps parallelism at `maxParallelism` (default 10)
  - Batch size: **5 papers per batch** (start here; validate with performance spike)
- **Persistence:** After each batch completes, write results to `literatureTableDrafts` (one row per paper). This serves as a write-through cache for live extraction progress and enables partial resumption.
- **Performance validation:** Before full implementation, run a performance spike with batch sizes of 3, 5, and 10. Measure latency + error rate. Actions have 10-minute timeout.
- **Output:** `extractedData` map (in-memory during workflow execution)
- **Step tracking:** Update `researchSteps` with extraction progress
- **Note:** `extractedData` exists in memory during a single workflow run. It is **NOT persisted to `literatureReviewSessions`** — that document stores only UI state. On resume, rebuilt from `literatureTableDrafts`.

**`generateTable`**

- **Purpose:** Create `literatureTables` row
- **Implementation:** Pure DB write, NO LLM inference
- **Read path:** Read extracted data from `literatureTableDrafts` by `sessionId`, NOT from in-memory state (state doesn't survive checkpoint boundaries)
- **Steps:**
  1. Read all `literatureTableDrafts` rows for this session
  2. Save papers to `citations` table (deduplicated)
  3. Create `literatureTables` row with columns + extracted data from drafts
  4. Set status to "completed"
- **Output:** `tableId`

**`generateReport`**

- **Purpose:** Synthesize formal academic report
- **Implementation:** Section-by-section generation (400-600 words per section)
  - Generate each section as a separate LLM call: Abstract → Introduction → Methods → Results → Discussion → Conclusion
  - Each section receives relevant extracted data subset
  - Better quality than single 3000-word prompt (avoids truncation and quality degradation)
  - Easier to retry individual failed sections
- **Prompt:** Generate section with inline citations using citation keys
- **Output:** Markdown content, sections array
- **Steps:**
  1. Generate each section sequentially
  2. Combine into full report
  3. Extract unique citation keys
  4. Create `literatureReports` row
  5. Link to `tableId`

#### Checkpoint Pattern

Between `planReview` and `searchPapers`, the agent pauses for user input. **Workflow implementation using `step.awaitEvent()`:**

1. `planReview` step completes → returns suggested columns
2. Workflow calls `step.awaitEvent(columnsEvent)` — **pauses indefinitely, zero resource consumption**
3. Frontend polls `literatureReviewSessions`, sees `awaiting_columns` status
4. User accepts/edits columns → calls `confirmLiteratureReviewColumns` mutation
5. Mutation calls `sendEvent(ctx, components.workflow, { ...columnsEvent, workflowId, value: { confirmedColumns } })`
6. Workflow **resumes automatically** from `step.awaitEvent`, continues to `searchPapers`

**Why this pattern:** `step.awaitEvent` is purpose-built for human-in-the-loop checkpoints. Unlike `ctx.scheduler.runAfter()`, it requires no manual scheduling, supports indefinite waits (hours or days), and resumes automatically when the event arrives. The Workflow component handles all durability internally.

**⚠️ No manual scheduling needed:** With Workflow, you do NOT use `ctx.scheduler.runAfter()` for resumption. The event delivery triggers automatic resume. This eliminates the "at most once" retry complexity of scheduled actions.

#### Error Recovery / Partial Resumption

The literature review workflow is long (6+ nodes, many LLM calls). If `extractData` fails on batch 3 of 6, the user loses all prior work unless we support partial resumption.

**Workflow `restart()` strategy:**

1. On failure, Workflow marks the workflow as failed
2. Update `literatureReviewSessions` with `status: "failed"` and `error` message for UI display
3. Provide `retryLiteratureReview` mutation that calls:
   ```typescript
   await restart(ctx, components.workflow, workflowId, {
     from: internal.agents.literature_review.extractData,
   });
   ```
4. Workflow restarts from the specified step, deleting all subsequent history
5. The restarted step reads already-extracted data from `literatureTableDrafts` to avoid re-processing

**Example:** If `extractData` fails on batch 3:

- `literatureTableDrafts`: contains batches 1-2
- User clicks "Retry from last step"
- `restart({ from: extractData })` restarts the workflow from the `extractData` step
- `extractData` reads already-extracted batches from `literatureTableDrafts`
- Continues from batch 3, skipping batches 1-2

**UI:** Show "Retry from last step" button in the step tracker when a step fails. Don't force the user to start over.

**Per-step retry config:** Each `extractData` batch uses Workflow's built-in retry:

```typescript
await step.runAction(internal.agents.literature_review.extractBatch, args, {
  retry: { maxAttempts: 3, initialBackoffMs: 500, base: 2 },
});
```

**⚠️ Workflow handles transient failures automatically.** Unlike scheduled actions, Workflow steps with retry config are retried up to `maxAttempts` times before surfacing as a workflow failure. This eliminates the need for manual retry logic on transient errors (API timeouts, rate limits).

---

## Citation Engine

**Location:** `convex/_utils/CitationEngine.ts`

**Design principle:** Pure formatting utility. No external API calls. Reusable across all artifact types.

### Interface

```typescript
interface Citation {
  paperId: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  url: string;
  sourceApi: "arxiv" | "semantic_scholar" | "pubmed";
}

interface CitationEngine {
  // Format inline citation: (Smith et al., 2024) or [1]
  formatInline(citation: Citation, style: string): string;

  // Format full reference for bibliography
  formatReference(citation: Citation, style: string): string;

  // Generate sorted reference list
  generateReferenceList(citations: Citation[], style: string): string;

  // Parse raw citation string into structured Citation
  // SCOPE: Only parses citations generated by this engine (your own format).
  // Parsing arbitrary user-input citations (BibTeX, RIS, etc.) is out of scope for v1.
  parseCitation(raw: string): Citation | null;
}
```

### Supported Styles (v1)

| Style      | Inline Example       | Reference Example                                                                                                 |
| ---------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| APA 7      | (Smith et al., 2024) | Smith, J., Jones, A., & Brown, K. (2024). Title of paper. _Journal Name_, 10(2), 123-145. https://doi.org/10.xxxx |
| MLA 9      | (Smith 45)           | Smith, John, et al. "Title of Paper." _Journal Name_, vol. 10, no. 2, 2024, pp. 123-145.                          |
| Chicago 17 | (Smith 2024, 45)     | Smith, John, Alice Jones, and Kevin Brown. 2024. "Title of Paper." _Journal Name_ 10, no. 2: 123-145.             |

**Source-aware formatting:** `formatReference` must branch on `sourceApi`, not just style. For example, APA 7 for arXiv preprints:

```
Smith, J. (2024). Title. arXiv. https://arxiv.org/abs/2401.12345
```

This differs from journal article format. Since primary sources are arXiv/Semantic Scholar/PubMed, this branching matters immediately.

**Extensibility:** New styles added by implementing format functions. No schema changes needed.

---

## Frontend Design

### Component Overview

| Component              | File                                                        | Purpose                                     |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| `ResearchModeToggle`   | `features/chat/components/ResearchModeToggle.tsx`           | Toggle Chat / Deep Research mode            |
| `ResearchSteps`        | `features/chat/components/ResearchSteps.tsx`                | Paperguide-style step tracker               |
| `LiteratureTableView`  | `features/studio/components/views/LiteratureTableView.tsx`  | Table with column management                |
| `LiteratureReportView` | `features/studio/components/views/LiteratureReportView.tsx` | Report with citations                       |
| `CitationStylePicker`  | `features/studio/components/CitationStylePicker.tsx`        | Dropdown for citation styles                |
| `ColumnManager`        | `features/studio/components/ColumnManager.tsx`              | Sidebar for column toggles + custom columns |

### ResearchSteps Component

Paperguide-style collapsible step tracker:

```typescript
interface ResearchStepUI {
  type:
    | "searching"
    | "deduplicating"
    | "ranking"
    | "screening"
    | "extracting"
    | "populating"
    | "generating_report"
    | "awaiting_user_input";
  status: "pending" | "in_progress" | "completed" | "failed";
  title: string; // e.g., "Searching relevant studies"
  description: string; // e.g., "Run structured searches based on the question"
  details?: string; // e.g., "Found 100 papers"
  metadata?: {
    queryCount?: number;
    paperCount?: number;
    includedCount?: number;
    excludedCount?: number;
  };
  papers?: ScreenedPaperPreview[]; // For screening step
  columns?: ColumnSuggestion[]; // For awaiting_user_input step
}
```

**UI Behavior:**

- Steps shown as vertical timeline with connecting line
- Completed: green checkmark, expandable for details
- In-progress: spinner, live-updating details
- Failed: red X with error message
- `awaiting_user_input`: Shows column suggestions with:
  - Clear distinction between AI-suggested vs. user-added columns
  - Expandable "instruction" chip per column showing the extraction prompt
  - Accept/Edit/Delete buttons per column
  - "Add custom column" button
- `screening`: Shows paper list with include/exclude badges

### LiteratureTableView Component

**Layout:**

- **Desktop:** Left panel (paper list) + right scrollable table
- **Mobile/Tablet:** Horizontal scroll with sticky first column (paper title). Collapsed sidebar accessed via "Manage Columns" button. Table is inherently wide — horizontal scroll is unavoidable, but sticky first column preserves context.
- Top bar: Title, Add Papers, Manage Columns, Save, Export

**Column Management Sidebar:**

- **Suggested Columns** (AI-generated, toggle on/off):
  - Predictive Validity
  - Benchmark Limitations
  - Notable Results & Trends
  - Study Design & Evaluation
- **Default Columns** (toggle on/off):
  - Insights, TL;DR, Summary, Research Question, Methodology, Key Findings, Primary Outcomes, Limitations, Interventions, Conclusion, Research Gaps, Funding Source, Introduction Summary, Discussion Summary, Hypotheses Tested, Future Research, Dependent Variables, Independent Variables, Study design, Objectives
- **Custom Columns**: "Create custom column" button → modal with name + instructions prompt
- **Saved Columns**: Save current config as preset

**Cell Content:**

- Text extracted by LLM (may be long)
- Expandable/collapsible
- Editable inline

**Actions:**

- Add Papers: Search dialog to find and add more papers
- Manage Columns: Open sidebar
- Save Table: Save to `literatureTables`
- Export: CSV, Excel, or copy to clipboard

### LiteratureReportView Component

**Layout:**

- Full-width document view
- Top bar: Title, Citation Style picker, Copy with citations, Export PDF, Save & Edit

**Features:**

- Render markdown with inline citations
- Citation style picker dropdown (APA 7, MLA 9, Chicago 17, etc.)
- Inline citation hover: Show paper preview popup
- References section: Auto-generated at bottom, formatted per selected style
- Export: PDF (reuse existing export infrastructure)

**Citation Rendering:**

- Parse markdown for citation markers: `[Smith2024]` or `(Smith et al., 2024)`
- Replace with styled links
- On hover: Show tooltip with paper title, authors, year
- **Graceful degradation:** If `citationId` can't be resolved (deleted citation, orphaned key), show fallback with just the key string — don't crash or show empty popup

### Research Mode Toggle

**Integration with Chat UI:**

- Toggle button in chat input area
- When "Deep Research" is active:
  - Input placeholder: "Ask a research question..."
  - On submit: Trigger research agent instead of chat agent
  - Show `ResearchSteps` component below input
  - After completion: Display artifact cards (Table + Report) with "Open" buttons

---

## Implementation Phases

### Phase 1: Foundation

- [ ] Create database schema (`citations`, `literatureTables`, `literatureReports`, `researchSteps`, `literatureReviewSessions`, `literatureTableDrafts`)
- [ ] **Install and configure `@convex-dev/workflow`** component
- [ ] Build `CitationEngine` utility (`convex/_utils/CitationEngine.ts`)
- [ ] Add Convex queries/mutations for CRUD operations
- [ ] **Write comprehensive unit tests for CitationEngine** — this is load-bearing. The engine is shared across both agents and the report view. If formatting is buggy, it corrupts every downstream artifact. Invest time here before Phase 2.

### Phase 2: Research Agent Enhancement

- [ ] Add step tracking to existing research agent
- [ ] Create `ResearchSteps` frontend component
- [ ] Add artifact generation (table + report) to research agent completion
- [ ] Integrate with chat UI (ResearchModeToggle)

### Phase 3: Literature Review Agent

- [ ] Build `LiteratureReviewGraph` LangGraph agent
- [ ] Wrap agent in `@convex-dev/workflow` handler (`literatureReviewWorkflow`)
- [ ] Implement nodes: planReview, searchPapers, deduplicatePapers, rankPapers, screenPapers
- [ ] **Performance spike:** Validate `extractData` batching before full implementation. Run 20 papers × 6 columns with batch sizes of 3, 5, and 10. Measure latency + error rate. Actions have 10-minute timeout.
- [ ] Implement batched extractData node (batch size: 5, based on spike results)
  - Each batch is a `step.runAction()` call with retry config
  - Persist results to `literatureTableDrafts` after each batch
- [ ] Implement generateTable and generateReport nodes
- [ ] Add checkpoint pattern using `step.awaitEvent` for column confirmation
- [ ] Implement error recovery using `restart({ from: stepName })`
- [ ] Write agent tests

### Phase 4: Frontend Artifacts

- [ ] Build `LiteratureTableView` component
- [ ] Build `LiteratureReportView` component
- [ ] Build `ColumnManager` sidebar
- [ ] Build `CitationStylePicker` component
- [ ] Add export functionality (CSV, PDF)
- [ ] Integrate with studio navigation

### Phase 5: Integration & Polish

- [ ] End-to-end testing
- [ ] Performance optimization (batch sizes, caching)
- [ ] Error handling and retry logic
- [ ] UI/UX polish
- [ ] Documentation

---

## Future Extensibility

### Near-term (Post-v1)

1. **Citations for existing Reports** — Add citation toggle to `reports` table. Reuse `CitationEngine`.
2. **Collaboration** — Share literature reviews between notebook members.
3. **More export formats** — BibTeX, RIS, EndNote.
4. **PRISMA flowchart** — Auto-generate PRISMA diagram from screening data.
5. **Saved searches** — Re-run literature review with updated sources.

### Long-term

1. **Citation network analysis** — Visualize paper relationships.
2. **Automatic PDF download** — Fetch full-text PDFs from search results.
3. **Multi-language support** — Search and cite non-English papers.
4. **Integration with reference managers** — Zotero, Mendeley import/export.

---

## Open Questions — Answered

| Question                            | Decision                                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Batch size for extraction**       | Start at **5** papers per batch. Validate with performance spike (test 3, 5, 10) before full implementation. Workflow's built-in retry handles transient failures automatically.                             |
| **Screening threshold**             | Screen **top 30 ranked papers**. Do not use a score cutoff — score distributions vary too much across queries for a fixed threshold to be reliable.                                                          |
| **Column suggestion quality**       | Instrument acceptance rate from day 1. Log which suggested columns users delete vs. keep. This is the primary feedback signal for iterative refinement.                                                      |
| **Report length**                   | **Section-by-section generation**, 400-600 words per section (Abstract → Introduction → Methods → Results → Discussion → Conclusion). Better quality and easier to retry individual failed sections.         |
| **Checkpoint/resumption mechanism** | Use `@convex-dev/workflow` with `step.awaitEvent()` for human-in-the-loop pauses and `restart({ from: stepName })` for partial resumption. Replaces hand-rolled `literatureReviewSessions` durability layer. |

---

## References

- Paperguide literature review feature (reverse-engineered from screenshots)
- Existing agent patterns: `convex/_agents/report/`, `convex/_agents/research/`
- Existing search infrastructure: `convex/_services/search/`
- LangGraph checkpoint pattern: `convex/_agents/_shared/graph_builder.ts`
