# Source Guide Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-generated "Source guide" (summary + topic chips) to each source in the SourceViewer, with topic chips that send discussion messages to chat.

**Architecture:** Lazy generation with Convex DB caching. A new `sourceGuide` field on `documents` stores the generated summary and topics. A Convex action calls the fast LLM on first view, and a React hook coordinates the query/action flow. A new `SourceGuide` UI component renders in `SourceViewer`.

**Tech Stack:** Convex (TypeScript), React 19, Tailwind CSS, Together AI LLM (`uncachedLlmCall`)

---

## File Structure

| File                                                        | Responsibility                                    |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `convex/schema.ts`                                          | Add `sourceGuide` field to `documents` table      |
| `convex/documents/sourceGuide.ts`                           | LLM prompt, JSON parsing, generation action       |
| `convex/documents/index.ts`                                 | `getSourceGuide` query, `setSourceGuide` mutation |
| `apps/web/src/features/sources/hooks/useSourceGuide.ts`     | React hook: query + action trigger                |
| `apps/web/src/features/sources/components/SourceGuide.tsx`  | UI: accordion, summary, chips                     |
| `apps/web/src/features/sources/components/SourceViewer.tsx` | Mount `SourceGuide` above content                 |
| `apps/web/src/features/sources/components/SourcesPanel.tsx` | Wire `onTopicClick` → chat send                   |

---

## Dependencies

This plan assumes the following already exist (verified by project exploration):

- `uncachedLlmCall` in `convex/_agents/_shared/cachedLlm.ts`
- `useChatStreamingContext` in `apps/web/src/features/chat/useChatStreaming.ts`
- `env.FAST_LLM` / `env.SMART_LLM` in `convex/_lib/env.ts`
- `parseSuggestionsPayload` / `repairJsonObjectText` patterns in `convex/_agents/chat/sourceSuggestions.ts`
- `useQuery`, `useAction` from `convex/react`

---

### Task 1: Schema — Add `sourceGuide` to documents table

**Files:**

- Modify: `convex/schema.ts`

- [ ] **Step 1: Add `sourceGuide` field**

In `convex/schema.ts`, inside the `documents` table definition (after `ingestionStatus` and before `createdAt`), add:

```ts
    /** AI-generated source guide (lazy-cached): summary + topic chips */
    sourceGuide: v.optional(
      v.object({
        summary: v.string(),
        topics: v.array(v.string()),
        generatedAt: v.number(),
      })
    ),
```

- [ ] **Step 2: Verify schema compiles**

Run: `bun run typecheck:convex`
Expected: No type errors

---

### Task 2: Backend — Create `convex/documents/sourceGuide.ts`

**Files:**

- Create: `convex/documents/sourceGuide.ts`

This file contains the LLM generation logic. It follows the exact same pattern as `convex/_agents/chat/sourceSuggestions.ts`.

- [ ] **Step 1: Write the generation action**

````ts
"use node";
/**
 * Source Guide Generator
 *
 * Generates a per-document summary + topic chips using the fast LLM.
 * Falls back to smart LLM on parse failure.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { uncachedLlmCall } from "../_agents/_shared/cachedLlm";
import { env } from "../_lib/env";

/** Best-effort fixes before JSON.parse (models sometimes emit trailing commas). */
function repairJsonObjectText(json: string): string {
  return json.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
}

function parseSourceGuidePayload(raw: string): {
  summary: string;
  topics: string[];
} {
  let text = raw.trim();
  if (!text) {
    throw new Error("empty LLM content");
  }

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    text = fence[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("no JSON object in LLM output");
  }
  text = text.slice(start, end + 1);

  let parsed: { summary?: unknown; topics?: unknown };
  try {
    parsed = JSON.parse(text) as { summary?: unknown; topics?: unknown };
  } catch {
    parsed = JSON.parse(repairJsonObjectText(text)) as {
      summary?: unknown;
      topics?: unknown;
    };
  }

  if (!parsed.summary || !Array.isArray(parsed.topics)) {
    throw new Error("Invalid response structure");
  }

  return {
    summary: String(parsed.summary),
    topics: parsed.topics.map(String).filter(Boolean),
  };
}

async function generateSourceGuideWithModel(
  model: string,
  prompt: string
): Promise<{ summary: string; topics: string[] }> {
  const response = await uncachedLlmCall({
    model,
    messages: [
      {
        role: "system",
        content:
          "You output only a single JSON object. Keys: summary (string, 2-3 sentences), topics (string array, 4-6 items, 2-4 words each). Escape quotes inside strings with backslash. No tools, no markdown, no explanation.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    maxTokens: 512,
    responseFormat: { type: "json_object" },
    reasoningEnabled: false,
    toolChoice: "none",
  });

  const parsed = parseSourceGuidePayload(response.content);
  if (parsed.topics.length === 0) {
    throw new Error("Invalid response structure");
  }
  return parsed;
}

export const generateSourceGuide = internalAction({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify document exists and is completed
    const document = await ctx.runQuery(internal.documents.index.getDocumentInternal, {
      documentId: args.documentId,
      userId: args.userId,
    });

    if (!document) {
      console.warn("[sourceGuide] Document not found:", args.documentId);
      return;
    }

    if (document.status !== "completed") {
      console.warn("[sourceGuide] Document not completed:", args.documentId);
      return;
    }

    // Skip if already generated
    if (document.sourceGuide) {
      return;
    }

    // Get content
    let content = document.extractedMarkdown || "";
    if (!content) {
      // Fallback: stitch chunks
      const chunks = await ctx.runQuery(internal.documents.index.getDocumentChunksInternal, {
        documentId: args.documentId,
        userId: args.userId,
      });
      content = chunks.map((c: { content: string }) => c.content).join("\n\n");
    }

    if (content.length < 100) {
      console.warn("[sourceGuide] Content too short, skipping:", args.documentId);
      return;
    }

    // Truncate to avoid exceeding context window (~8000 chars is safe)
    const truncatedContent = content.slice(0, 8000);

    const prompt = `You are an AI study assistant analyzing a source document. Given the document content below, generate a JSON response with exactly these keys:
- "summary": A concise 2-3 sentence overview of the document, highlighting the most important concepts and takeaways. Use bold formatting (markdown **bold**) for key terms.
- "topics": An array of 4-6 specific topics, concepts, or themes covered in the document. Each topic should be 2-4 words, highly specific, and useful as a discussion prompt.

Document content:
${truncatedContent}

Output ONLY a single JSON object. No markdown fences, no explanation.`;

    try {
      let parsed: { summary: string; topics: string[] };
      try {
        parsed = await generateSourceGuideWithModel(env.FAST_LLM, prompt);
      } catch (firstError) {
        if (env.SMART_LLM !== env.FAST_LLM) {
          console.warn("[sourceGuide] fast model failed, retrying with smart model:", firstError);
          parsed = await generateSourceGuideWithModel(env.SMART_LLM, prompt);
        } else {
          throw firstError;
        }
      }

      await ctx.runMutation(internal.documents.index.setSourceGuide, {
        documentId: args.documentId,
        summary: parsed.summary.slice(0, 500),
        topics: parsed.topics.slice(0, 6),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("LLM API error:")) {
        console.warn("[sourceGuide] LLM API request failed:", error);
      } else {
        console.warn("[sourceGuide] LLM output parse failed:", error);
      }
      // Intentionally do not throw — failing to generate a guide is not a critical error
    }
  },
});
````

- [ ] **Step 2: Create helper queries/mutations in `convex/documents/index.ts`**

Add these to `convex/documents/index.ts`:

**Query — `getDocumentInternal`:**

```ts
export const getDocumentInternal = internalQuery({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document || document.userId !== args.userId) return null;
    return document;
  },
});
```

**Query — `getDocumentChunksInternal`:**

```ts
export const getDocumentChunksInternal = internalQuery({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .take(100);
    return chunks.filter((c) => c.userId === args.userId);
  },
});
```

**Query — `getSourceGuide`:**

```ts
export const getSourceGuide = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const document = await ctx.db.get(args.documentId);
    if (!document || document.userId !== identity.subject) return null;

    if (document.sourceGuide) {
      return {
        summary: document.sourceGuide.summary,
        topics: document.sourceGuide.topics,
        isGenerating: false,
      };
    }

    // Signal that generation should start
    if (document.status === "completed") {
      return { summary: null, topics: null, isGenerating: true };
    }

    return { summary: null, topics: null, isGenerating: false };
  },
});
```

**Mutation — `setSourceGuide`:**

```ts
export const setSourceGuide = internalMutation({
  args: {
    documentId: v.id("documents"),
    summary: v.string(),
    topics: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) return;

    // Idempotent: skip if already set
    if (document.sourceGuide) return;

    await ctx.db.patch(args.documentId, {
      sourceGuide: {
        summary: args.summary,
        topics: args.topics,
        generatedAt: Date.now(),
      },
    });
  },
});
```

- [ ] **Step 3: Verify Convex types compile**

Run: `bun run typecheck:convex`
Expected: No type errors

---

### Task 3: Frontend Hook — `useSourceGuide`

**Files:**

- Create: `apps/web/src/features/sources/hooks/useSourceGuide.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useEffect } from "react";

export function useSourceGuide(documentId: string | null) {
  const guide = useQuery(
    api.documents.index.getSourceGuide,
    documentId ? { documentId: documentId as any } : "skip"
  );
  const generateGuide = useAction(api.documents.index.generateSourceGuide as any);

  useEffect(() => {
    if (guide?.isGenerating && documentId) {
      generateGuide({ documentId: documentId as any });
    }
  }, [guide?.isGenerating, documentId, generateGuide]);

  return {
    summary: guide?.summary ?? null,
    topics: guide?.topics ?? null,
    isLoading: guide?.isGenerating ?? false,
  };
}
```

**Note:** The `as any` casts are needed because Convex's generated API types may not immediately recognize the new endpoints until after a dev server re-sync. This is a known pattern in the codebase.

- [ ] **Step 2: Verify web types**

Run: `bun run typecheck:web`
Expected: No type errors (may need to restart `bun run dev:web` for Convex codegen to pick up new endpoints)

---

### Task 4: Frontend Component — `SourceGuide`

**Files:**

- Create: `apps/web/src/features/sources/components/SourceGuide.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React, { useState } from "react";
import { Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import { useSourceGuide } from "../hooks/useSourceGuide";

interface SourceGuideProps {
  documentId: string;
  onTopicClick: (topic: string) => void;
}

export const SourceGuide: React.FC<SourceGuideProps> = ({ documentId, onTopicClick }) => {
  const { summary, topics, isLoading } = useSourceGuide(documentId);
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isLoading && !summary && !topics) {
    return null;
  }

  return (
    <div className="bg-muted/30 rounded-xl border border-border/40 p-4 mb-4">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between w-full text-left group"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">Source guide</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {isLoading ? (
            <>
              <div className="space-y-2">
                <div className="h-3 bg-secondary/50 rounded w-full animate-pulse" />
                <div className="h-3 bg-secondary/50 rounded w-5/6 animate-pulse" />
                <div className="h-3 bg-secondary/50 rounded w-4/6 animate-pulse" />
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-7 w-24 bg-secondary/50 rounded-full animate-pulse" />
                ))}
              </div>
            </>
          ) : (
            <>
              {summary && (
                <p
                  className="text-sm text-foreground/90 leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: summary
                      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                      .replace(/\n/g, "<br/>"),
                  }}
                />
              )}
              {topics && topics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => onTopicClick(topic)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium bg-muted/80 border border-border/60 hover:bg-accent hover:border-primary/30 transition-colors cursor-pointer truncate max-w-[160px]"
                      title={topic}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
```

**Note on `dangerouslySetInnerHTML`:** The summary comes from a trusted LLM system prompt. We only allow `<strong>` and `<br/>` tags (transformed from markdown). No user input is rendered.

- [ ] **Step 2: Verify web types**

Run: `bun run typecheck:web`
Expected: No type errors

---

### Task 5: Integrate into `SourceViewer`

**Files:**

- Modify: `apps/web/src/features/sources/components/SourceViewer.tsx`

- [ ] **Step 1: Import and add `SourceGuide`**

Add import at the top:

```tsx
import { SourceGuide } from "./SourceGuide";
```

Add props to `SourceViewerProps`:

```ts
interface SourceViewerProps {
  source: Source;
  onToggle: (id: string) => void;
  content: string | undefined;
  pdfStorageId?: string | null;
  isLoading: boolean;
  error: string | undefined;
  onTopicClick: (topic: string) => void; // NEW
}
```

Update destructuring:

```ts
export const SourceViewer: React.FC<SourceViewerProps> = ({
  source,
  onToggle,
  content,
  pdfStorageId,
  isLoading,
  error,
  onTopicClick, // NEW
}) => {
```

Insert `<SourceGuide />` after the header section and before the error/loading states. Place it after the `</div>` that closes the header (around line 91):

```tsx
{
  /* Source Guide */
}
{
  source.status === "completed" && (
    <SourceGuide documentId={source.id} onTopicClick={onTopicClick} />
  );
}
```

- [ ] **Step 2: Verify web types**

Run: `bun run typecheck:web`
Expected: No type errors

---

### Task 6: Wire `onTopicClick` in `SourcesPanel`

**Files:**

- Modify: `apps/web/src/features/sources/components/SourcesPanel.tsx`

- [ ] **Step 1: Import chat context and create handler**

Add import at the top:

```tsx
import { useChatStreamingContext } from "../../chat/useChatStreaming";
```

Inside `SourcesPanel` component (after the existing hooks, before `useEffect`), add:

```tsx
const chatContext = useChatStreamingContext();

const handleTopicClick = useCallback(
  (topic: string) => {
    if (!chatContext.onSendMessage) return;
    chatContext.onSendMessage(`Discuss ${topic}`);
  },
  [chatContext]
);
```

- [ ] **Step 2: Pass handler to `SourceViewer`**

Find the `<SourceViewer ... />` JSX and add the prop:

```tsx
<SourceViewer
  source={viewingSource}
  onToggle={handleToggleSource}
  content={markdownContent}
  pdfStorageId={viewingSource?.type === "PDF" ? viewingDocument?.storageId : undefined}
  isLoading={sourceContent.isLoading(viewingSourceId ?? "")}
  error={sourceContent.hasError(viewingSourceId ?? "") ? "Failed to load content" : undefined}
  onTopicClick={handleTopicClick} // NEW
/>
```

- [ ] **Step 3: Verify web types**

Run: `bun run typecheck:web`
Expected: No type errors

---

### Task 7: Lint and Final Verification

- [ ] **Step 1: Run linter**

Run: `bun run lint`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 2: Run typechecks**

Run: `bun run typecheck:convex`
Run: `bun run typecheck:web`
Expected: Both pass

- [ ] **Step 3: Run tests (if applicable)**

Run: `bun run test:convex`
Expected: Pass (or only pre-existing failures)

- [ ] **Step 4: Format code**

Run: `bun run format`
Expected: Formats modified files

---

## Spec Coverage Checklist

| Spec Requirement                                      | Task          |
| ----------------------------------------------------- | ------------- |
| Schema: `sourceGuide` field on `documents`            | Task 1        |
| `generateSourceGuide` action with fast LLM + fallback | Task 2        |
| `getSourceGuide` query with `isGenerating` signal     | Task 2        |
| `setSourceGuide` mutation (idempotent)                | Task 2        |
| Lazy generation: first view triggers action           | Task 3 (hook) |
| Collapsible accordion UI                              | Task 4        |
| Summary with bold formatting                          | Task 4        |
| Topic chips (4-6, 2-4 words)                          | Task 4        |
| Chip click → `Discuss {topic}` to chat                | Task 5, 6     |
| Loading skeleton                                      | Task 4        |
| Hidden for processing/failed documents                | Task 4, 5     |
| Content truncation (~8000 chars)                      | Task 2        |
| Error handling (log, no throw)                        | Task 2        |

---

## Post-Implementation Notes

- **Convex Codegen:** After modifying `convex/schema.ts` and adding new functions, the Convex dev server (`bun x convex dev`) must be running to regenerate `convex/_generated/api.d.ts`. If type errors persist, restart the dev server.
- **Vite Cache:** If frontend types are out of sync after Convex changes, run:
  ```bash
  rm -rf apps/web/node_modules/.vite
  ```
  Then hard-refresh the browser (Ctrl+Shift+R).
- **Testing the Feature:**
  1. Open a notebook with completed sources
  2. Click a source to open SourceViewer
  3. Observe "Source guide" accordion (loading → then summary + chips)
  4. Click a chip → verify chat receives `Discuss {topic}` message

## Open Questions / Future Work

- **TTL Regeneration:** The `generatedAt` field allows future implementation of automatic re-generation after N days (e.g., if document content is refreshed).
- **Topic Limit:** Currently capped at 6 topics. Could make this dynamic based on document length.
- **Chip Click Behavior:** Currently sends directly to chat. Could be extended to also auto-select the source or create a new conversation.
