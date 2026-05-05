# Source Guide Feature Design

**Date:** 2026-05-04
**Feature:** Source Guide for Notebook Sources
**Approach:** Lazy Generation with Caching (B)

## Overview

When a user opens a source in the SourceViewer panel, they see an AI-generated "Source guide" at the top — a collapsible accordion containing:

- A 2-3 sentence summary of the document's key concepts
- A horizontal row of topic chips extracted from the document

Clicking any topic chip sends a message to the chat: `Discuss {topic}`.

The guide is generated lazily (on first open) using the fast LLM, cached in the database, and reused on subsequent views.

## Schema Changes

### `documents` Table

Add an optional `sourceGuide` object field to the `documents` table in `convex/schema.ts`:

```ts
sourceGuide: v.optional(v.object({
  summary: v.string(),
  topics: v.array(v.string()),
  generatedAt: v.number(),
})),
```

**Rationale:** Keeping the guide data inline with the document avoids an extra table and index. The field is optional so existing documents gracefully upgrade. `generatedAt` allows future TTL-based regeneration if needed.

## Backend (Convex)

### 1. `generateSourceGuide` — Internal Action

**File:** `convex/documents/sourceGuide.ts` (new)

- **Args:** `documentId: v.id("documents")`, `userId: v.id("users")`
- **Flow:**
  1. Fetch document by ID (verify ownership)
  2. Get `extractedMarkdown` (fallback to chunk stitching if not available)
  3. Truncate content to ~8000 tokens (fast LLM context limit)
  4. Call `uncachedLlmCall` with `env.FAST_LLM` (fallback to `env.SMART_LLM`)
  5. Parse JSON response with the same `parseSuggestionsPayload` / `repairJsonObjectText` pattern used in `convex/_agents/chat/sourceSuggestions.ts`
  6. Store result via `internal.documents.index.setSourceGuide`

**LLM Prompt:**

```
You are an AI study assistant analyzing a source document. Given the document content below, generate a JSON response with exactly these keys:
- "summary": A concise 2-3 sentence overview of the document, highlighting the most important concepts and takeaways. Use bold formatting (markdown **bold**) for key terms.
- "topics": An array of 4-6 specific topics, concepts, or themes covered in the document. Each topic should be 2-4 words, highly specific, and useful as a discussion prompt.

Document content:
{truncatedContent}

Output ONLY a single JSON object. No markdown fences, no explanation.
```

**Error Handling:**

- If document is not `completed` status → return early (no-op)
- If LLM call fails or JSON parse fails → log warning, return without caching (user sees no guide, no retry storm)
- If guide already exists → return early (idempotent)

### 2. `getSourceGuide` — Query

**File:** `convex/documents/index.ts`

- **Args:** `documentId: v.id("documents")`
- **Returns:** `{ summary: string | null; topics: string[] | null; isGenerating: boolean }`
- **Logic:**
  1. Return cached `sourceGuide` if present
  2. If document is `completed` and no guide exists, return `isGenerating: true` to trigger frontend action call

### 3. `setSourceGuide` — Internal Mutation

**File:** `convex/documents/index.ts`

- **Args:** `documentId: v.id("documents")`, `summary: v.string()`, `topics: v.array(v.string())`
- **Logic:** Patches the document row with the `sourceGuide` object and `generatedAt: Date.now()`

## Frontend

### 1. `SourceGuide` Component

**File:** `apps/web/src/features/sources/components/SourceGuide.tsx` (new)

**Props:**

```ts
interface SourceGuideProps {
  documentId: string;
  onTopicClick: (topic: string) => void;
}
```

**UI:**

- Collapsible accordion (ChevronUp/ChevronDown icons)
- Header: Sparkle icon + "Source guide" text
- Expanded state shows:
  - Summary paragraph (renders markdown bold using `<strong>`)
  - Horizontal row of topic chips (flex wrap, gap-2)
- Loading state: skeleton shimmer for summary + 4 chip skeletons
- Empty/error state: gracefully collapses or shows minimal fallback

**Chip styling:**

```
rounded-full px-3 py-1.5 text-xs font-medium
bg-muted/80 border border-border/60 hover:bg-accent hover:border-primary/30
transition-colors cursor-pointer truncate max-w-[160px]
```

### 2. Integration into `SourceViewer`

**File:** `apps/web/src/features/sources/components/SourceViewer.tsx`

Insert `<SourceGuide />` between the header section (type/date + Included toggle) and the PDF/Markdown toggle. The guide sits in a container with subtle background:

```
bg-muted/30 rounded-xl border border-border/40 p-4 mb-4
```

### 3. `SourcesPanel` — Wiring

**File:** `apps/web/src/features/sources/components/SourcesPanel.tsx`

- Pass `onTopicClick` handler down to `SourceViewer`
- Handler implementation:

```ts
const handleTopicClick = useCallback((topic: string) => {
  // Find chat send function from context
  const chatContext = useChatStreamingContext(); // already available at notebook level
  chatContext.onSendMessage(`Discuss ${topic}`);
}, []);
```

**Note:** `SourcesPanel` is inside the same tree as `ChatPanel` under `NotebookView`. The `ChatStreamingProvider` wraps both, so `useChatStreamingContext()` is accessible.

### 4. Hook: `useSourceGuide`

**File:** `apps/web/src/features/sources/hooks/useSourceGuide.ts` (new)

Encapsulates the query + action logic:

```ts
function useSourceGuide(documentId: string | null) {
  const guide = useQuery(api.documents.index.getSourceGuide, documentId ? { documentId } : "skip");
  const generateGuide = useAction(api.documents.index.generateSourceGuide);

  useEffect(() => {
    if (guide?.isGenerating && documentId) {
      generateGuide({ documentId });
    }
  }, [guide?.isGenerating, documentId, generateGuide]);

  return {
    summary: guide?.summary,
    topics: guide?.topics,
    isLoading: guide?.isGenerating ?? false,
  };
}
```

## Data Flow

```
User clicks source in list
  → SourcesPanel sets viewingSourceId
    → SourceViewer mounts with documentId
      → SourceGuide component mounts
        → useSourceGuide(documentId) queries getSourceGuide
          → [Cache miss + completed] → returns isGenerating: true
            → useEffect triggers generateSourceGuide action
              → Convex action: fetch doc → LLM call → setSourceGuide mutation
                → React query revalidates → renders summary + chips
          → [Cache hit] → renders immediately
```

## Error Handling

| Scenario                                    | Behavior                                                        |
| ------------------------------------------- | --------------------------------------------------------------- |
| Document still processing                   | SourceGuide not shown (hidden)                                  |
| LLM API error                               | Logs warning; user sees collapsed guide with no content         |
| JSON parse error                            | Same as above; no retry loop                                    |
| Content too short (<100 chars)              | Skip generation; not useful for guide                           |
| User clicks chip but no conversation active | Message queued in default conversation (existing chat behavior) |

## Testing

- **Unit:** `convex/documents/sourceGuide.test.ts` — mock LLM call, verify JSON parsing, verify caching
- **UI:** Playwright — open source viewer, verify guide loads, verify chip click sends message
- **Typecheck:** Run `bun run typecheck:convex` + `bun run typecheck:web` after changes

## Files Changed

| File                                                        | Change                                            |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `convex/schema.ts`                                          | Add `sourceGuide` to `documents` table            |
| `convex/documents/sourceGuide.ts`                           | New: generateSourceGuide action                   |
| `convex/documents/index.ts`                                 | Add getSourceGuide query, setSourceGuide mutation |
| `apps/web/src/features/sources/components/SourceGuide.tsx`  | New: UI component                                 |
| `apps/web/src/features/sources/components/SourceViewer.tsx` | Add SourceGuide                                   |
| `apps/web/src/features/sources/components/SourcesPanel.tsx` | Wire onTopicClick                                 |
| `apps/web/src/features/sources/hooks/useSourceGuide.ts`     | New: hook                                         |

## Open Questions

None — design approved.
