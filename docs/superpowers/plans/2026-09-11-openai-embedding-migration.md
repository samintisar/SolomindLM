# OpenAI Embedding Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deprecated Together AI embedding model (`intfloat/multilingual-e5-large-instruct`, removed from serverless 2026-09-14) with OpenAI `text-embedding-3-small` at 1536 dimensions, consolidate the two duplicated Together-calling implementations into one client, and revectorize every row in `documentChunks` on dev.

**Architecture:** A new `convex/_lib/embeddingConfig.ts` holds model/dimension/chunk-size constants. A new `convex/_services/ai/embeddingClient.ts` holds one shared `callOpenAIEmbeddings` fetch function, used by both an `EmbeddingService` class (direct use in `"use node"` actions) and Convex's cacheable action layer (`generateEmbedding`/`generateEmbeddingsBatch`, wrapped by `@convex-dev/action-cache`). `documentChunks` gains an `embeddingModel` field so the re-embed migration can tell old vectors from new ones by provenance instead of by vector length (both are 1536 dims... actually 1024 old vs 1536 new, but provenance tracking is still the robust fix going forward).

**Tech Stack:** Convex (schema, actions, mutations), TypeScript, vitest, raw `fetch` against `https://api.openai.com/v1/embeddings` (no new npm dependency).

---

## Task 1: Widen `documentChunks` schema

**Files:**
- Modify: `convex/schema.ts:164-197`

- [ ] **Step 1: Add the `embeddingModel` field and bump the vector index dimension**

In `convex/schema.ts`, the `documentChunks` table definition currently reads:

```typescript
  documentChunks: defineTable({
    documentId: v.id("documents"),
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.optional(v.array(v.float64())),
    metadata: v.optional(v.any()),
```

Change it to:

```typescript
  documentChunks: defineTable({
    documentId: v.id("documents"),
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.optional(v.array(v.float64())),
    /** Which model produced `embedding`. Used by the re-embed migration to tell old vectors from new ones by provenance rather than by vector length (which can coincide across models). Unset on rows embedded before this field existed. */
    embeddingModel: v.optional(v.string()),
    metadata: v.optional(v.any()),
```

Then find the vector index further down in the same table definition:

```typescript
    .vectorIndex("by_embedding", {
      dimensions: 1024, // NOTE: dimensions (plural), not dimension - updated for Together AI intfloat/multilingual-e5-large-instruct
      vectorField: "embedding",
      filterFields: ["userId", "notebookId"],
    })
```

Change it to:

```typescript
    .vectorIndex("by_embedding", {
      dimensions: 1536, // NOTE: dimensions (plural), not dimension - OpenAI text-embedding-3-small, native size (not truncated)
      vectorField: "embedding",
      filterFields: ["userId", "notebookId"],
    })
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS (schema changes are additive/type-level only at this point; no code reads `embeddingModel` yet)

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): add documentChunks.embeddingModel, bump vector index to 1536 dims"
```

---

## Task 2: `convex/_lib/embeddingConfig.ts` (replaces `e5Embedding.ts`)

**Files:**
- Create: `convex/_lib/embeddingConfig.ts`
- Test: `convex/_lib/embeddingConfig.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/_lib/embeddingConfig.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  RAG_CHUNK_OVERLAP_TOKENS,
  RAG_CHUNK_SIZE_TOKENS,
} from "./embeddingConfig";

describe("embeddingConfig", () => {
  it("targets OpenAI text-embedding-3-small at 1536 native dimensions", () => {
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it("keeps chunk sizing below the model's context window with room for overlap", () => {
    expect(RAG_CHUNK_SIZE_TOKENS).toBeGreaterThan(0);
    expect(RAG_CHUNK_OVERLAP_TOKENS).toBeGreaterThan(0);
    expect(RAG_CHUNK_OVERLAP_TOKENS).toBeLessThan(RAG_CHUNK_SIZE_TOKENS);
  });

  it("batches multiple chunks per embeddings API call", () => {
    expect(EMBEDDING_BATCH_SIZE).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run convex/_lib/embeddingConfig.test.ts`
Expected: FAIL with "Cannot find module './embeddingConfig'"

- [ ] **Step 3: Write the implementation**

Create `convex/_lib/embeddingConfig.ts`:

```typescript
/**
 * OpenAI embedding model used across ingestion, chat/search retrieval, and RAG.
 * @see convex/_services/ai/embeddingClient.ts
 */
export const EMBEDDING_MODEL = "text-embedding-3-small" as const;

/**
 * Requested explicitly on every API call (not left as OpenAI's implicit
 * default) so a future provider-side default change can't silently resize
 * vectors out from under the `documentChunks.by_embedding` index.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * RAG chunk sizing, carried over unchanged from the prior Together E5
 * migration. Re-tuning chunk granularity to exploit OpenAI's larger context
 * window is a separate retrieval-quality decision, not part of this
 * deprecation-driven provider swap.
 */
export const RAG_CHUNK_SIZE_TOKENS = 220;
export const RAG_CHUNK_OVERLAP_TOKENS = 55;

/** Chunks per embeddings API call (array `input`). Fewer HTTP round-trips than one-per-chunk. */
export const EMBEDDING_BATCH_SIZE = 64;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run convex/_lib/embeddingConfig.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add convex/_lib/embeddingConfig.ts convex/_lib/embeddingConfig.test.ts
git commit -m "feat(lib): add embeddingConfig for OpenAI text-embedding-3-small"
```

---

## Task 3: `convex/_services/ai/embeddingClient.ts` (consolidated client)

**Files:**
- Create: `convex/_services/ai/embeddingClient.ts`
- Test: `convex/_services/ai/embeddingClient.test.ts`

This replaces both `convex/_services/processing/EmbeddingServiceClient.ts` and the raw-fetch bodies in `convex/_services/ai/embeddings.ts` with one implementation. The Convex action definitions (`generateEmbeddingInternal`, `generateEmbeddingsBatchInternal`, `generateEmbedding`, `generateEmbeddingsBatch`) move into this same file since they must remain real `FunctionReference`s for `@convex-dev/action-cache` to wrap.

- [ ] **Step 1: Write the failing test for `callOpenAIEmbeddings`**

Create `convex/_services/ai/embeddingClient.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOpenAIEmbeddings, EmbeddingService } from "./embeddingClient";

function mockOpenAIResponse(vectors: number[][]) {
  return {
    ok: true,
    text: async () =>
      JSON.stringify({
        data: vectors.map((embedding, index) => ({ index, embedding, object: "embedding" })),
      }),
    json: async () => ({
      data: vectors.map((embedding, index) => ({ index, embedding, object: "embedding" })),
    }),
  };
}

describe("callOpenAIEmbeddings", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty array without calling fetch for empty input", async () => {
    const result = await callOpenAIEmbeddings([], "test-key");
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends model, dimensions, and input, and returns vectors in request order", async () => {
    fetchMock.mockResolvedValue(mockOpenAIResponse([[0.1, 0.2], [0.3, 0.4]]));

    const result = await callOpenAIEmbeddings(["first", "second"], "test-key");

    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      model: "text-embedding-3-small",
      input: ["first", "second"],
      dimensions: 1536,
    });
    expect(init.headers.Authorization).toBe("Bearer test-key");
  });

  it("re-sorts out-of-order response items back to request order", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "",
      json: async () => ({
        data: [
          { index: 1, embedding: [0.9, 0.9] },
          { index: 0, embedding: [0.1, 0.1] },
        ],
      }),
    });

    const result = await callOpenAIEmbeddings(["a", "b"], "test-key");
    expect(result).toEqual([[0.1, 0.1], [0.9, 0.9]]);
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid api key",
    });

    await expect(callOpenAIEmbeddings(["x"], "bad-key")).rejects.toThrow();
  });

  it("throws when the response vector count doesn't match the request count", async () => {
    fetchMock.mockResolvedValue(mockOpenAIResponse([[0.1, 0.1]]));

    await expect(callOpenAIEmbeddings(["a", "b"], "test-key")).rejects.toThrow(/expected 2/);
  });
});

describe("EmbeddingService", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("embedText trims input and returns a single vector", async () => {
    fetchMock.mockResolvedValue(mockOpenAIResponse([[0.5, 0.5]]));
    const service = new EmbeddingService("test-key");

    const result = await service.embedText("  hello world  ");

    expect(result).toEqual([0.5, 0.5]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toEqual(["hello world"]);
  });

  it("embedBatch splits large inputs across multiple calls at the configured batch size", async () => {
    const texts = Array.from({ length: 70 }, (_, i) => `chunk-${i}`);
    fetchMock
      .mockResolvedValueOnce(mockOpenAIResponse(Array.from({ length: 64 }, () => [1])))
      .mockResolvedValueOnce(mockOpenAIResponse(Array.from({ length: 6 }, () => [2])));

    const service = new EmbeddingService("test-key");
    const result = await service.embedBatch(texts);

    expect(result).toHaveLength(70);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run convex/_services/ai/embeddingClient.test.ts`
Expected: FAIL with "Cannot find module './embeddingClient'"

- [ ] **Step 3: Write the implementation**

Create `convex/_services/ai/embeddingClient.ts`:

```typescript
"use node";

import { v } from "convex/values";
import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { internal } from "../../_generated/api";
import { action, internalAction } from "../../_generated/server";
import { EMBEDDING_BATCH_SIZE, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../../_lib/embeddingConfig";
import { createExternalServiceErrorFromResponse } from "../../_lib/errors";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { getAuthUserId } from "../../auth";
import { CACHE_TTL } from "../cache/cache";
import { createCachedAction } from "../cache/cachedAgent";

/**
 * The one implementation of "call OpenAI's embeddings endpoint." Everything
 * else in this file (the direct-use class and the cacheable Convex actions)
 * calls into this. Returns vectors in the same order as `inputs`.
 */
export async function callOpenAIEmbeddings(
  inputs: string[],
  apiKey: string
): Promise<number[][]> {
  if (inputs.length === 0) {
    return [];
  }

  return await invokeWithHttpRetry(async () => {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw createExternalServiceErrorFromResponse(
        "openai",
        response.status,
        "/v1/embeddings",
        errBody.slice(0, 400)
      );
    }

    const data = (await response.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
    };
    if (!Array.isArray(data.data) || data.data.length !== inputs.length) {
      throw new Error(
        `embeddings API returned ${data.data?.length ?? 0} vectors, expected ${inputs.length}`
      );
    }
    return [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }, "openai_embedding");
}

/** Direct-use client for `"use node"` actions (chat, search, research, migrations). */
export class EmbeddingService {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embedText(text: string): Promise<number[]> {
    const [vector] = await callOpenAIEmbeddings([text.trim()], this.apiKey);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE).map((t) => t.trim());
      embeddings.push(...(await callOpenAIEmbeddings(batch, this.apiKey)));
    }
    return embeddings;
  }
}

// ============================================================
// Convex action layer — kept as real actions because
// @convex-dev/action-cache wraps a FunctionReference, not a
// plain function.
// ============================================================

export const generateEmbeddingInternal = internalAction({
  args: { text: v.string() },
  handler: async (_, { text }): Promise<number[]> => {
    const logger = createServiceLogger("openai", "generateEmbeddingInternal");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error("OPENAI_API_KEY is not set");
      throw new Error("OPENAI_API_KEY is not set");
    }
    logger.operationStart({ inputChars: text.length });
    try {
      const [embedding] = await callOpenAIEmbeddings([text], apiKey);
      logger.operationComplete({ dims: embedding.length });
      return embedding;
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  },
});

export const generateEmbeddingsBatchInternal = internalAction({
  args: { texts: v.array(v.string()) },
  handler: async (_, { texts }): Promise<number[][]> => {
    if (texts.length === 0) {
      return [];
    }
    const logger = createServiceLogger("openai", "generateEmbeddingsBatchInternal");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error("OPENAI_API_KEY is not set");
      throw new Error("OPENAI_API_KEY is not set");
    }
    logger.operationStart({ batchSize: texts.length });
    try {
      const vectors = await callOpenAIEmbeddings(texts, apiKey);
      logger.operationComplete({ count: vectors.length, dims: vectors[0]?.length });
      return vectors;
    } catch (error) {
      logger.operationError(error);
      throw error;
    }
  },
});

const embeddingCache = createCachedAction(internal._services.ai.embeddingClient.generateEmbeddingInternal, {
  ttl: CACHE_TTL.embedding,
  // Bumped from the E5-era "embeddingsV4-e5-900cap" so no stale E5-cached
  // vector can leak through this cache path after the provider cutover.
  name: "embeddingsV5-openai-3small-1536",
});

export const generateEmbedding = action({
  args: { text: v.string() },
  handler: async (ctx, args): Promise<number[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const normalizedText = args.text.trim();
    const result = await embeddingCache.fetch(ctx, { text: normalizedText });
    return result as number[];
  },
});

export const generateEmbeddingsBatch = action({
  args: { texts: v.array(v.string()) },
  handler: async (ctx, args): Promise<number[][]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated");
    }
    const normalizedTexts = args.texts.map((text) => text.trim());
    const uniqueTexts = Array.from(new Set(normalizedTexts));

    const textToIndex = new Map<string, number[]>();
    normalizedTexts.forEach((text, idx) => {
      if (!textToIndex.has(text)) {
        textToIndex.set(text, []);
      }
      textToIndex.get(text)!.push(idx);
    });

    const uniqueEmbeddings: number[][] = [];
    for (let off = 0; off < uniqueTexts.length; off += EMBEDDING_BATCH_SIZE) {
      const batch = uniqueTexts.slice(off, off + EMBEDDING_BATCH_SIZE);
      const part = await ctx.runAction(
        internal._services.ai.embeddingClient.generateEmbeddingsBatchInternal,
        { texts: batch }
      );
      uniqueEmbeddings.push(...part);
    }

    if (uniqueEmbeddings.length !== uniqueTexts.length) {
      throw new Error(
        `embeddings length mismatch: got ${uniqueEmbeddings.length}, expected ${uniqueTexts.length}`
      );
    }

    const results: number[][] = new Array(normalizedTexts.length);
    uniqueTexts.forEach((text, uniqueIdx) => {
      const originalIndices = textToIndex.get(text)!;
      const embedding = uniqueEmbeddings[uniqueIdx]!;
      originalIndices.forEach((idx) => {
        results[idx] = embedding;
      });
    });

    return results;
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run convex/_services/ai/embeddingClient.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add convex/_services/ai/embeddingClient.ts convex/_services/ai/embeddingClient.test.ts
git commit -m "feat(embeddings): add consolidated OpenAI embedding client"
```

---

## Task 4: Add `OPENAI_API_KEY` to `convex/_lib/env.ts`

**Files:**
- Modify: `convex/_lib/env.ts:8-10`

- [ ] **Step 1: Add the env entry**

In `convex/_lib/env.ts`, currently:

```typescript
export const env = {
  // Together AI
  TOGETHER_AI_API_KEY: process.env.TOGETHER_AI_API_KEY || "",
```

Change to:

```typescript
export const env = {
  // Together AI
  TOGETHER_AI_API_KEY: process.env.TOGETHER_AI_API_KEY || "",

  // OpenAI (embeddings)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/_lib/env.ts
git commit -m "feat(env): add OPENAI_API_KEY"
```

---

## Task 5: `storeChunk` accepts and stores `embeddingModel`

**Files:**
- Modify: `convex/documents/chunks.ts:87-147`

- [ ] **Step 1: Add the arg**

In `convex/documents/chunks.ts`, the `storeChunk` args currently start:

```typescript
export const storeChunk = internalMutation({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.array(v.float64()),
    metadata: v.optional(
```

Add `embeddingModel` right after `embedding`:

```typescript
export const storeChunk = internalMutation({
  args: {
    documentId: v.id("documents"),
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.array(v.float64()),
    embeddingModel: v.optional(v.string()),
    metadata: v.optional(
```

- [ ] **Step 2: Stamp it onto the inserted row**

Find:

```typescript
  handler: async (ctx, args) => {
    const chunkData: any = {
      documentId: args.documentId,
      userId: args.userId,
      notebookId: args.notebookId,
      content: args.content,
      chunkIndex: args.chunkIndex,
      embedding: args.embedding,
      createdAt: Date.now(),
    };
```

Change to:

```typescript
  handler: async (ctx, args) => {
    const chunkData: any = {
      documentId: args.documentId,
      userId: args.userId,
      notebookId: args.notebookId,
      content: args.content,
      chunkIndex: args.chunkIndex,
      embedding: args.embedding,
      embeddingModel: args.embeddingModel,
      createdAt: Date.now(),
    };
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add convex/documents/chunks.ts
git commit -m "feat(documents): storeChunk accepts and stores embeddingModel"
```

---

## Task 6: Update `convex/documents/embeddingJob.ts` (ingestion)

**Files:**
- Modify: `convex/documents/embeddingJob.ts:6-10, 339-345, 409-420, 434-460`

- [ ] **Step 1: Swap the config import**

Currently:

```typescript
import {
  E5_RAG_CHUNK_OVERLAP_TOKENS,
  E5_RAG_CHUNK_SIZE_TOKENS,
  E5_TOGETHER_EMBED_BATCH_SIZE,
} from "../_lib/e5Embedding";
```

Change to:

```typescript
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_MODEL,
  RAG_CHUNK_OVERLAP_TOKENS,
  RAG_CHUNK_SIZE_TOKENS,
} from "../_lib/embeddingConfig";
```

- [ ] **Step 2: Update the chunker call**

Currently:

```typescript
      // E5 (Together) max ~512 real tokens; chunk below that so RAG index matches embed input (see e5Embedding)
      const chunker = new StructuralChunker();
      const chunksWithMetadata = await chunker.chunk(
        extractedText,
        E5_RAG_CHUNK_SIZE_TOKENS,
        E5_RAG_CHUNK_OVERLAP_TOKENS
      );
```

Change to:

```typescript
      // Chunk sizing kept from the prior Together E5 migration — see embeddingConfig.ts
      const chunker = new StructuralChunker();
      const chunksWithMetadata = await chunker.chunk(
        extractedText,
        RAG_CHUNK_SIZE_TOKENS,
        RAG_CHUNK_OVERLAP_TOKENS
      );
```

- [ ] **Step 3: Update the embedding call**

Currently:

```typescript
      // Together E5: batched `input: string[]` (fewer HTTP calls than one-per-chunk) + sequential batches to avoid 429s
      const chunkTexts = chunksWithMetadata.map((c) => c.content);
      const embeddingVectors: number[][] = [];
      for (let off = 0; off < chunkTexts.length; off += E5_TOGETHER_EMBED_BATCH_SIZE) {
        const batch = chunkTexts.slice(off, off + E5_TOGETHER_EMBED_BATCH_SIZE);
        const part = await ctx.runAction(
          internal._services.ai.embeddings.generateEmbeddingsBatchInternal,
          { texts: batch, inputType: "passage" }
        );
        embeddingVectors.push(...part);
      }
```

Change to:

```typescript
      // Batched `input: string[]` (fewer HTTP calls than one-per-chunk) + sequential batches to avoid 429s
      const chunkTexts = chunksWithMetadata.map((c) => c.content);
      const embeddingVectors: number[][] = [];
      for (let off = 0; off < chunkTexts.length; off += EMBEDDING_BATCH_SIZE) {
        const batch = chunkTexts.slice(off, off + EMBEDDING_BATCH_SIZE);
        const part = await ctx.runAction(
          internal._services.ai.embeddingClient.generateEmbeddingsBatchInternal,
          { texts: batch }
        );
        embeddingVectors.push(...part);
      }
```

- [ ] **Step 4: Stamp `embeddingModel` on every stored chunk**

Currently:

```typescript
        await ctx.runMutation(internal.documents.chunks.storeChunk, {
          documentId,
          userId: chunkUserId as any,
          notebookId,
          content: chunk.content,
          chunkIndex: chunk.metadata.chunkIndex,
          embedding: embeddingVectors[i],
          metadata: {
```

Change to:

```typescript
        await ctx.runMutation(internal.documents.chunks.storeChunk, {
          documentId,
          userId: chunkUserId as any,
          notebookId,
          content: chunk.content,
          chunkIndex: chunk.metadata.chunkIndex,
          embedding: embeddingVectors[i],
          embeddingModel: EMBEDDING_MODEL,
          metadata: {
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add convex/documents/embeddingJob.ts
git commit -m "feat(documents): embeddingJob uses OpenAI embeddings, stamps embeddingModel"
```

---

## Task 7: Fix the re-embed migration's skip logic and switch it to OpenAI

**Files:**
- Modify: `convex/_migration/reembedChunks.ts`
- Modify: `convex/_migration/reembedBatchesWorker.ts`

This is the correctness-critical task: the current skip check (`embedding.length !== 1024`) cannot distinguish an old E5 1024-dim vector from anything else once the new model's own dimension also happens to differ — the actual bug is that provenance was never tracked, only length was, and length alone is not a reliable signal across arbitrary model changes. `embeddingModel` fixes this for good.

- [ ] **Step 1: Update `reembedChunks.ts`'s import and `updateChunkEmbedding` mutation**

Currently:

```typescript
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
```

Change to:

```typescript
import { EmbeddingService } from "../_services/ai/embeddingClient";
```

Currently:

```typescript
export const updateChunkEmbedding = internalMutation({
  args: {
    chunkId: v.id("documentChunks"),
    newEmbedding: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const { chunkId, newEmbedding } = args;

    // Verify the chunk exists
    const chunk = await ctx.db.get(chunkId);
    if (!chunk) {
      throw new Error(`Chunk ${chunkId} not found`);
    }

    // Update with new embedding
    await ctx.db.patch(chunkId, {
      embedding: newEmbedding,
    });

    return { success: true, chunkId };
  },
});
```

Change to:

```typescript
export const updateChunkEmbedding = internalMutation({
  args: {
    chunkId: v.id("documentChunks"),
    newEmbedding: v.array(v.number()),
    embeddingModel: v.string(),
  },
  handler: async (ctx, args) => {
    const { chunkId, newEmbedding, embeddingModel } = args;

    // Verify the chunk exists
    const chunk = await ctx.db.get(chunkId);
    if (!chunk) {
      throw new Error(`Chunk ${chunkId} not found`);
    }

    // Update with new embedding and its provenance
    await ctx.db.patch(chunkId, {
      embedding: newEmbedding,
      embeddingModel,
    });

    return { success: true, chunkId };
  },
});
```

- [ ] **Step 2: Update `reembedDocumentChunks`'s API key and mutation call**

Currently:

```typescript
export const reembedDocumentChunks = internalAction({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args): Promise<{ total: number; processed: number; errors: number }> => {
    "use node";

    const togetherApiKey = process.env.TOGETHER_AI_API_KEY;
    if (!togetherApiKey) {
      throw new Error("TOGETHER_AI_API_KEY environment variable not set");
    }

    const embeddingService = new EmbeddingService(togetherApiKey);
```

Change to:

```typescript
export const reembedDocumentChunks = internalAction({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args): Promise<{ total: number; processed: number; errors: number }> => {
    "use node";

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY environment variable not set");
    }

    const embeddingService = new EmbeddingService(openaiApiKey);
```

A few lines further down in the same function, currently:

```typescript
    // Update chunks
    let processed = 0;
    for (let i = 0; i < chunks.length; i++) {
      await ctx.runMutation(internal._migration.reembedChunks.updateChunkEmbedding, {
        chunkId: chunks[i]._id,
        newEmbedding: newEmbeddings[i],
      });
      processed++;
    }
```

Change to:

```typescript
    // Update chunks
    let processed = 0;
    for (let i = 0; i < chunks.length; i++) {
      await ctx.runMutation(internal._migration.reembedChunks.updateChunkEmbedding, {
        chunkId: chunks[i]._id,
        newEmbedding: newEmbeddings[i],
        embeddingModel: EMBEDDING_MODEL,
      });
      processed++;
    }
```

Add the import for `EMBEDDING_MODEL` at the top of the file, alongside the existing imports:

```typescript
import { EMBEDDING_MODEL } from "../_lib/embeddingConfig";
```

- [ ] **Step 3: Update the module doc comment**

Currently:

```typescript
/**
 * Migration: Re-embed all document chunks with Together AI
 *
 * This script migrates from OpenAI text-embedding-3-small (1536 dimensions)
 * to Together AI intfloat/multilingual-e5-large-instruct (1024 dimensions)
 *
 * Run batched migration: npx convex run _migration/reembedChunks:reembedAllChunks
 *
 * Production: uses scheduled batches to avoid action timeouts and large .collect() reads.
 */
```

Change to:

```typescript
/**
 * Migration: Re-embed all document chunks with OpenAI
 *
 * This script migrates from Together AI intfloat/multilingual-e5-large-instruct
 * (1024 dimensions, deprecated 2026-09-14) to OpenAI text-embedding-3-small
 * (1536 dimensions, native — not truncated).
 *
 * Run batched migration: npx convex run _migration/reembedChunks:reembedAllChunks
 *
 * Production: uses scheduled batches to avoid action timeouts and large .collect() reads.
 */
```

- [ ] **Step 4: Rewrite `reembedBatchesWorker.ts`'s skip logic and API key**

Currently:

```typescript
"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";

const TARGET_DIM = 1024;
const BATCH_SIZE = 40;

/**
 * Worker: processes one page of chunks, skips ones already at 1024 dims, then reschedules until done.
 */
export const reembedBatchesWorker = internalAction({
  args: {
    cursor: v.union(v.string(), v.null()),
    processed: v.number(),
    errors: v.number(),
  },
  handler: async (ctx, args) => {
    const togetherApiKey = process.env.TOGETHER_AI_API_KEY;
    if (!togetherApiKey) {
      throw new Error("TOGETHER_AI_API_KEY environment variable not set");
    }

    const embeddingService = new EmbeddingService(togetherApiKey);

    const page = (await ctx.runQuery(internal._migration.reembedChunks.listDocumentChunksPage, {
      paginationOpts: { numItems: BATCH_SIZE, cursor: args.cursor },
    })) as {
      page: Array<Doc<"documentChunks"> & { embedding?: number[] }>;
      isDone: boolean;
      continueCursor: string;
    };

    let processed = args.processed;
    let errors = args.errors;

    const toUpdate = page.page.filter((chunk: { embedding?: number[] }) => {
      const len = chunk.embedding?.length ?? 0;
      return len !== TARGET_DIM;
    });

    if (toUpdate.length > 0) {
      try {
        const texts = toUpdate.map((c: { content: string }) => c.content);
        const newEmbeddings = await embeddingService.embedBatch(texts);
        for (let j = 0; j < toUpdate.length; j++) {
          const chunk = toUpdate[j] as { _id: Id<"documentChunks"> };
          try {
            await ctx.runMutation(internal._migration.reembedChunks.updateChunkEmbedding, {
              chunkId: chunk._id,
              newEmbedding: newEmbeddings[j]!,
            });
            processed++;
          } catch (e) {
            console.error(`updateChunkEmbedding failed for ${chunk._id}:`, e);
            errors++;
          }
        }
      } catch (error) {
        console.error(`Batch embed failed at cursor ${args.cursor}:`, error);
        errors += toUpdate.length;
      }
    }
```

Change to:

```typescript
"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { EMBEDDING_MODEL } from "../_lib/embeddingConfig";
import { EmbeddingService } from "../_services/ai/embeddingClient";

const BATCH_SIZE = 40;

/**
 * Worker: processes one page of chunks, skips ones already stamped with
 * `embeddingModel === EMBEDDING_MODEL`, then reschedules until done.
 *
 * Filtering on `embeddingModel` (not vector length) is deliberate: two
 * different embedding models can coincidentally produce vectors of the same
 * length, so length alone can't reliably tell "already migrated" from "not
 * yet migrated." Provenance can.
 */
export const reembedBatchesWorker = internalAction({
  args: {
    cursor: v.union(v.string(), v.null()),
    processed: v.number(),
    errors: v.number(),
  },
  handler: async (ctx, args) => {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY environment variable not set");
    }

    const embeddingService = new EmbeddingService(openaiApiKey);

    const page = (await ctx.runQuery(internal._migration.reembedChunks.listDocumentChunksPage, {
      paginationOpts: { numItems: BATCH_SIZE, cursor: args.cursor },
    })) as {
      page: Array<Doc<"documentChunks"> & { embedding?: number[]; embeddingModel?: string }>;
      isDone: boolean;
      continueCursor: string;
    };

    let processed = args.processed;
    let errors = args.errors;

    const toUpdate = page.page.filter(
      (chunk: { embeddingModel?: string }) => chunk.embeddingModel !== EMBEDDING_MODEL
    );

    if (toUpdate.length > 0) {
      try {
        const texts = toUpdate.map((c: { content: string }) => c.content);
        const newEmbeddings = await embeddingService.embedBatch(texts);
        for (let j = 0; j < toUpdate.length; j++) {
          const chunk = toUpdate[j] as { _id: Id<"documentChunks"> };
          try {
            await ctx.runMutation(internal._migration.reembedChunks.updateChunkEmbedding, {
              chunkId: chunk._id,
              newEmbedding: newEmbeddings[j]!,
              embeddingModel: EMBEDDING_MODEL,
            });
            processed++;
          } catch (e) {
            console.error(`updateChunkEmbedding failed for ${chunk._id}:`, e);
            errors++;
          }
        }
      } catch (error) {
        console.error(`Batch embed failed at cursor ${args.cursor}:`, error);
        errors += toUpdate.length;
      }
    }
```

The rest of the file (the rescheduling block and return statement) is unchanged.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add convex/_migration/reembedChunks.ts convex/_migration/reembedBatchesWorker.ts
git commit -m "fix(migration): track embeddingModel provenance instead of vector length; switch to OpenAI"
```

---

## Task 8: Update the 9 remaining call sites

**Files:**
- Modify: `convex/_agents/chat/ChatAgent.ts:12, 83`
- Modify: `convex/_agents/chat/vector_search.ts:12`
- Modify: `convex/_agents/chat/hybrid_search.ts:9`
- Modify: `convex/_agents/chat/grounding_validator.ts:10, 270-271`
- Modify: `convex/chat/_streamChatResponse.ts:11, 125`
- Modify: `convex/chat/_streamResearch.ts:11, 40`
- Modify: `convex/chat/_streamSearch.ts:12`
- Modify: `convex/eval/researchEvalAction.ts:19, 144, 151`
- Modify: `convex/eval/chatEvalAction.ts:26, 205`

Every one of these files imports `EmbeddingService` from the old path; most also construct it with `TOGETHER_AI_API_KEY` and a few pass the now-deleted `inputType` argument. None of these files' *other* Together usage (LLM calls, chat completions) changes — only the embedding-specific lines.

- [ ] **Step 1: `convex/_agents/chat/ChatAgent.ts`**

Import, currently:

```typescript
import { EmbeddingService } from "../../_services/processing/EmbeddingServiceClient";
```

Change to:

```typescript
import { EmbeddingService } from "../../_services/ai/embeddingClient";
```

Constructor, currently (note: the two `TOGETHER_AI_API_KEY` uses just above this line, for `ChatLLMWrapper`, must NOT change — only this line):

```typescript
    this.embeddingService = new EmbeddingService(env.TOGETHER_AI_API_KEY);
```

Change to:

```typescript
    this.embeddingService = new EmbeddingService(env.OPENAI_API_KEY);
```

- [ ] **Step 2: `convex/_agents/chat/vector_search.ts`**

Currently:

```typescript
import type { EmbeddingService } from "../../_services/processing/EmbeddingServiceClient";
```

Change to:

```typescript
import type { EmbeddingService } from "../../_services/ai/embeddingClient";
```

(No other change in this file — its `embedText(query)` call already omits `inputType`.)

- [ ] **Step 3: `convex/_agents/chat/hybrid_search.ts`**

Currently:

```typescript
import type { EmbeddingService } from "../../_services/processing/EmbeddingServiceClient";
```

Change to:

```typescript
import type { EmbeddingService } from "../../_services/ai/embeddingClient";
```

(No other change — its `embedText(query)` call already omits `inputType`.)

- [ ] **Step 4: `convex/_agents/chat/grounding_validator.ts`**

Import, currently:

```typescript
import type { EmbeddingService } from "../../_services/processing/EmbeddingServiceClient";
```

Change to:

```typescript
import type { EmbeddingService } from "../../_services/ai/embeddingClient";
```

Call site, currently:

```typescript
    const [responseEmbed, sourceEmbed] = await Promise.all([
      embeddingService.embedText(truncateForEmbedding(cleanResponse), "passage"),
      embeddingService.embedText(truncateForEmbedding(citedSourceText), "passage"),
    ]);
```

Change to:

```typescript
    const [responseEmbed, sourceEmbed] = await Promise.all([
      embeddingService.embedText(truncateForEmbedding(cleanResponse)),
      embeddingService.embedText(truncateForEmbedding(citedSourceText)),
    ]);
```

- [ ] **Step 5: `convex/chat/_streamChatResponse.ts`**

Import, currently:

```typescript
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
```

Change to:

```typescript
import { EmbeddingService } from "../_services/ai/embeddingClient";
```

Construction, currently:

```typescript
  const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY || "");
```

Change to:

```typescript
  const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY || "");
```

- [ ] **Step 6: `convex/chat/_streamResearch.ts`**

Import, currently:

```typescript
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
```

Change to:

```typescript
import { EmbeddingService } from "../_services/ai/embeddingClient";
```

Construction, currently (note: this file's `apiKey` config field passed into `deps` a few lines below is for the LLM and stays Together — only this line changes):

```typescript
  const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY ?? "");
```

Change to:

```typescript
  const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY ?? "");
```

- [ ] **Step 7: `convex/chat/_streamSearch.ts`**

Currently:

```typescript
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
```

Change to:

```typescript
import { EmbeddingService } from "../_services/ai/embeddingClient";
```

(This file only uses `EmbeddingService` as a type annotation — no construction here.)

- [ ] **Step 8: `convex/eval/researchEvalAction.ts`**

Import, currently:

```typescript
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
```

Change to:

```typescript
import { EmbeddingService } from "../_services/ai/embeddingClient";
```

Construction, currently (the `deps.apiKey` field on the next line is for the LLM and stays Together — only the `embeddingService` line changes):

```typescript
    const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY || "");

    // Build deps for ResearchAgent
    const deps = {
      apiKey: process.env.TOGETHER_AI_API_KEY || "",
      smartModel: env.SMART_LLM,
      runHybridSearch: async (query: string, docIds?: string[]) => {
        const embedding = await embeddingService.embedText(query, "query");
```

Change to:

```typescript
    const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY || "");

    // Build deps for ResearchAgent
    const deps = {
      apiKey: process.env.TOGETHER_AI_API_KEY || "",
      smartModel: env.SMART_LLM,
      runHybridSearch: async (query: string, docIds?: string[]) => {
        const embedding = await embeddingService.embedText(query);
```

- [ ] **Step 9: `convex/eval/chatEvalAction.ts`**

Import, currently:

```typescript
import { EmbeddingService } from "../_services/processing/EmbeddingServiceClient";
```

Change to:

```typescript
import { EmbeddingService } from "../_services/ai/embeddingClient";
```

Construction, currently:

```typescript
    const embeddingService = new EmbeddingService(process.env.TOGETHER_AI_API_KEY || "");
```

Change to:

```typescript
    const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY || "");
```

- [ ] **Step 10: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS. If any file still references `_services/processing/EmbeddingServiceClient` or passes an `inputType` argument, TypeScript will fail here — fix before continuing.

- [ ] **Step 11: Commit**

```bash
git add convex/_agents/chat/ChatAgent.ts convex/_agents/chat/vector_search.ts convex/_agents/chat/hybrid_search.ts convex/_agents/chat/grounding_validator.ts convex/chat/_streamChatResponse.ts convex/chat/_streamResearch.ts convex/chat/_streamSearch.ts convex/eval/researchEvalAction.ts convex/eval/chatEvalAction.ts
git commit -m "refactor: point all embedding call sites at the OpenAI client"
```

---

## Task 9: Delete the old E5/Together embedding files

**Files:**
- Delete: `convex/_lib/e5Embedding.ts`
- Delete: `convex/_lib/e5Embedding.test.ts` (if it exists — check first)
- Delete: `convex/_services/processing/EmbeddingServiceClient.ts`
- Delete: `convex/_services/ai/embeddings.ts`

By this point nothing imports from any of these three files — Tasks 2–3 created their replacements, and Tasks 6–8 repointed every consumer.

- [ ] **Step 1: Confirm nothing still references the old files**

Run:
```bash
grep -rn "e5Embedding\|EmbeddingServiceClient\|_services/ai/embeddings" convex --include=*.ts | grep -v "_generated/api.d.ts" | grep -v "embeddingClient"
```
Expected: no output (the generated `api.d.ts` will still mention the old path until the next `convex dev`/codegen run — that's fine, it's regenerated automatically and not hand-edited).

- [ ] **Step 2: Delete the files**

```bash
git rm convex/_lib/e5Embedding.ts convex/_services/processing/EmbeddingServiceClient.ts convex/_services/ai/embeddings.ts
```

(If `convex/_lib/e5Embedding.test.ts` exists, `git rm` it too — it doesn't per the file inventory taken while researching this plan, but verify with `ls convex/_lib/e5Embedding.test.ts` before assuming.)

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove superseded Together E5 embedding files"
```

---

## Task 10: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Web typecheck**

Run: `bun run typecheck:web`
Expected: PASS (no web files touched by this plan, but the workspace-wide `documentChunks` type shape changed, and some shared types may be re-exported to web)

- [ ] **Step 2: Convex typecheck**

Run: `bun run typecheck:convex`
Expected: PASS

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: PASS. If Biome flags anything, run `bun run lint:fix` and re-check.

- [ ] **Step 4: Convex test suite**

Run: `bun run test:convex`
Expected: PASS, including the new `embeddingConfig.test.ts` and `embeddingClient.test.ts`.

- [ ] **Step 5: Commit any lint-fix changes**

```bash
git add -A
git commit -m "chore: lint fixes"
```
(Skip this step if Step 3 found nothing to fix.)

---

## Task 11: Deploy to dev and run the revectorization

**Files:** none (operational — dev deployment only, per explicit scope decision; prod is a separate, later, explicitly-confirmed step)

- [ ] **Step 1: Confirm `OPENAI_API_KEY` is set on the dev Convex deployment**

Run: `npx convex env get OPENAI_API_KEY`
Expected: prints the key (already confirmed present before this plan was written — this step just re-verifies nothing changed).

- [ ] **Step 2: Deploy to dev**

Run: `npx convex dev --once`
Expected: deployment succeeds, schema push succeeds (the `documentChunks.by_embedding` vector index rebuild may take a moment).

- [ ] **Step 3: Kick off the re-embed migration**

Run: `npx convex run _migration/reembedChunks:reembedAllChunks`
Expected: `{ scheduled: true, message: "Re-embedding started; watch logs for reembedBatchesWorker progress." }`

- [ ] **Step 4: Monitor progress**

Run: `npx convex logs` (or watch the dashboard) and look for `reembedBatchesWorker complete: processed=<N>, errors=<N>` — the worker self-reschedules until `isDone`, so this may take a while depending on total chunk count. Confirm `errors` is 0 (or investigate any non-zero count before declaring done).

- [ ] **Step 5: Spot-check retrieval quality**

In the running dev app: run a chat/search query against a notebook with existing content, including at least one non-English source if available (OpenAI does not officially document multilingual retrieval quality for `text-embedding-3-small`, unlike E5 or Voyage). Confirm results look reasonable. If quality regresses noticeably on non-English content, the documented fallback is Voyage `voyage-4-lite` (see the design spec) — flag to the user rather than silently proceeding.

- [ ] **Step 6: Report cost**

Note the actual OpenAI usage/cost incurred by the migration (visible in the OpenAI dashboard) and report it back — this was an open validation item from the design spec, not something to silently absorb.

Prod deployment and prod revectorization are **not** part of this task — they require a separate, explicit go-ahead per the earlier scope decision.
