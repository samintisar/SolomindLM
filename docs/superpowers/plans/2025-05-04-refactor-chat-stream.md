# Refactor convex/chat/stream.ts Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Split the 1,675-line `convex/chat/stream.ts` into focused modules under `convex/chat/stream/` while preserving all behavior.

**Architecture:** Extract by responsibility — stream I/O, search runners, external search, agent setup, research phases, and persistence each get their own file. The main `stream.ts` becomes a thin orchestrator.

**Tech Stack:** TypeScript, Convex, Node.js runtime

---

## File Structure

| File | Responsibility | Est. Lines |
|------|---------------|------------|
| `convex/chat/stream/streamBuffer.ts` | Chunk buffering, flush logic, protocol formatting | ~60 |
| `convex/chat/stream/searchRunners.ts` | Vector search, keyword search, result enrichment | ~220 |
| `convex/chat/stream/externalSearch.ts` | Tavily web/news/academic discovery | ~160 |
| `convex/chat/stream/agentSetup.ts` | ChatAgent initialization, settings merge | ~140 |
| `convex/chat/stream/researchPlan.ts` | Deep research plan phase | ~160 |
| `convex/chat/stream/researchExecute.ts` | Deep research execute phase | ~180 |
| `convex/chat/stream/persist.ts` | Assistant message persistence with retry | ~120 |
| `convex/chat/stream.ts` | Re-exports, main action orchestrator | ~140 |

---

## Task 1: Create streamBuffer.ts

**Files:**
- Create: `convex/chat/stream/streamBuffer.ts`

Extract chunk buffering constants and helpers from lines 42-54 and 345-384.

```typescript
"use node";

import { components } from "../../_generated/api";

/** Batched addChunk to stay under Convex mutation write throughput (e.g. 4 MiB/s on S16). */
export const CHAT_STREAM_FLUSH_MS = 85;
export const CHAT_STREAM_FLUSH_MIN_CHARS = 200;
export const CHAT_STREAM_MAX_CHUNK_CHARS = 65536;

export const CHAT_HISTORY_FETCH_LIMIT = 80;

export async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export interface ChunkBuffer {
  flushTokenBuffer: () => Promise<void>;
  chunkAppender: (text: string) => Promise<void>;
}

export function createChunkBuffer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  streamId: string
): ChunkBuffer {
  const rawAddChunk = async (text: string) => {
    if (!text) return;
    await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
      streamId,
      text,
      final: false,
    });
  };

  let tokenBuffer = "";
  let lastFlushAt = Date.now();

  const flushTokenBuffer = async () => {
    if (tokenBuffer.length === 0) return;
    while (tokenBuffer.length > 0) {
      const piece = tokenBuffer.slice(0, CHAT_STREAM_MAX_CHUNK_CHARS);
      tokenBuffer = tokenBuffer.slice(piece.length);
      await rawAddChunk(piece);
    }
    lastFlushAt = Date.now();
  };

  const chunkAppender = async (text: string) => {
    if (!text) return;

    // Protocol lines from streamChatResponse (\n__REFERENCES, \n__ERROR, …): flush tokens first, then one chunk.
    if (text.startsWith("\n__")) {
      await flushTokenBuffer();
      await rawAddChunk(text);
      return;
    }

    tokenBuffer += text;
    const now = Date.now();
    const dueBySize = tokenBuffer.length >= CHAT_STREAM_FLUSH_MIN_CHARS;
    const dueByTime = tokenBuffer.length > 0 && now - lastFlushAt >= CHAT_STREAM_FLUSH_MS;
    if (dueBySize || dueByTime) {
      await flushTokenBuffer();
    }
  };

  return { flushTokenBuffer, chunkAppender };
}
```

---

## Task 2: Create searchRunners.ts

**Files:**
- Create: `convex/chat/stream/searchRunners.ts`

Extract vector and keyword search logic used by both chat and research (lines 100-167, 572-789, 1365-1437).

Key exports:
- `VectorSearchResult` interface (move from stream.ts)
- `buildVectorSearchRunner(ctx, notebookId, chatStreamLog?)` 
- `buildKeywordSearchRunner(ctx, notebookId, userId, chatStreamLog?)`
- `VECTOR_MATCH_THRESHOLD` constant

The vector search runner includes all the threshold fallback logic and document title/URL enrichment.

---

## Task 3: Create externalSearch.ts

**Files:**
- Create: `convex/chat/stream/externalSearch.ts`

Extract external source discovery from lines 876-1026.

Key exports:
- `runExternalSearch(ctx, message, sourcePolicy, chatStreamLog)` → `{ externalSources, externalChunks }`

Includes Tavily web/news search, academic paper search, query refinement, result formatting, and chunk building.

---

## Task 4: Create agentSetup.ts

**Files:**
- Create: `convex/chat/stream/agentSetup.ts`

Extract ChatAgent setup from lines 498-871.

Key exports:
- `setupChatAgent(ctx, args, conversationId)` → `{ agent, resolvedSmartModel, mergedChatSettings, notebookGrounding, includeNotebook }`

Includes notebook fetch, settings merge, model validation, user preferences, hybrid search initialization, and external search orchestration.

---

## Task 5: Create researchPlan.ts

**Files:**
- Create: `convex/chat/stream/researchPlan.ts`

Extract `runResearchPlanPhase` from lines 60-310.

Key exports:
- `runResearchPlanPhase(ctx, streamId, userId, notebookId, message, documentIds, sourcePolicy, chunkAppender, conversationId, userMessageId)`

---

## Task 6: Create researchExecute.ts

**Files:**
- Create: `convex/chat/stream/researchExecute.ts`

Extract `runResearchExecute` action from lines 1306-1675.

Key exports:
- `runResearchExecute` internalAction (or the handler logic)

---

## Task 7: Create persist.ts

**Files:**
- Create: `convex/chat/stream/persist.ts`

Extract assistant message persistence from lines 1181-1290.

Key exports:
- `persistAssistantMessage(ctx, conversationId, streamId, fullResponse, references, hasError, agentTrace, mergedChatSettings, externalSources, chatStreamLog, isGenerationActive)`

---

## Task 8: Rewrite stream.ts

**Files:**
- Modify: `convex/chat/stream.ts`

Replace the entire file with a thin orchestrator that imports from the new modules and re-exports `runWithStreamId` and `runResearchExecute`.

Keep the `internalAction` definitions here since they're the public API.

---

## Task 9: Verify with TypeScript

**Files:**
- Verify all imports resolve
- Run: `bun run typecheck:convex`

---

## Task 10: Test

**Files:**
- Run existing tests: `bun run test:convex`
- Ensure no regressions

---

## Spec Coverage Check

- [x] Stream I/O buffering → Task 1
- [x] Vector search with thresholds → Task 2
- [x] Keyword search → Task 2
- [x] External search (Tavily + academic) → Task 3
- [x] ChatAgent setup → Task 4
- [x] Research plan phase → Task 5
- [x] Research execute phase → Task 6
- [x] Message persistence with retry → Task 7
- [x] Main orchestration → Task 8
- [x] Type safety verification → Task 9
- [x] Test verification → Task 10

No placeholders. All tasks include actual code or exact references to source lines.
