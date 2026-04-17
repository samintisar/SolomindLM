---
name: add-studio-feature
description: "Use this skill when adding or extending an AI-powered Studio tool in this repo (new generation types, Studio panel tools, or notebook artifacts like summaries, timelines, or study formats). Also use when wiring schema, Convex studio jobs, LangGraph agents under convex/_agents/, schedule* actions, frontend studio services, views, flows, or STUDIO_TOOLS. Reference implementation: flashcards (convex/_agents/flashcard/, convex/studio/flashcards/, apps/web flashcardsApi and FlashcardView)."
---

# Add a New Studio Feature — End-to-End

Use flashcards (`convex/_agents/flashcard/`, `convex/studio/flashcards/`) as the reference implementation.

---

## Step 1: Schema (`convex/schema.ts`)

Add a table following this pattern:

```typescript
myFeature: defineTable({
  userId: v.id("users"),
  notebookId: v.id("notebooks"),
  title: v.string(),
  status: v.string(), // 'draft' | 'generating' | 'completed' | 'failed'
  itemsData: v.optional(v.array(v.any())), // generated content
  metadata: v.optional(v.any()), // config params (topic, count, difficulty...)
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_notebook", ["notebookId"])
  .index("by_user", ["userId"])
  .index("by_status", ["status"]);
```

---

## Step 2: Agent (`convex/_agents/myfeature/`)

Create 4 files (use `_agents/flashcard/` as template):

**`state.ts`** — LangGraph Annotation state:

```typescript
export const OverallState = Annotation.Root({
  documentIds: Annotation<string[]>({ ... }),
  chunks: Annotation<string[]>({ ... }),
  mapOutputs: Annotation<MyItem[][]>({
    reducer: (x, y) => y ? x.concat(y) : x,  // aggregate parallel results
    default: () => [],
  }),
  finalOutput: Annotation<MyItem[]>({ ... }),
  // ... topic, count, other config
});
```

**`prompts.ts`** — Zod schemas + types + system prompts:

```typescript
export const MyItemSchema = z.object({ ... });
export const MyItemArraySchema = z.object({ items: z.array(MyItemSchema) });
export type MyItem = z.infer<typeof MyItemSchema>;
```

**`nodes.ts`** — `MyFeatureGraph` class with nodes:

- `splitChunksNode()` — partition docs into chunks
- `mapProcessNode()` — generate items for one chunk (uses fast LLM)
- `collapseNode()` — merge partial results
- `reduceNode()` — final selection/refinement (uses smart LLM)

**`MyFeatureGraph.ts`** (root of `_agents/`) — re-export the class.

---

## Step 3: Convex Job + Mutations (`convex/studio/myfeature/`)

### `index.ts` — Public + internal mutations/queries

```typescript
// Public (called from client)
export const list = query({ ... });   // list by notebook
export const get = query({ ... });    // single item
export const create = mutation({ ... });
export const update = mutation({ ... });
export const remove = mutation({ ... });

// Internal (called from jobs only)
export const createInternal = internalMutation({ ... });
export const updateStatus = internalMutation({ ... });
export const updateData = internalMutation({ ... });
export const getInternal = internalQuery({ ... });
```

### `job.ts` — Multi-phase internalActions (avoids timeouts)

```typescript
// Entry point — schedule from action
export const myFeatureGeneration = internalAction({
  handler: async (ctx, { myFeatureId, documentIds, ... }) => {
    // 1. Set status → generating
    // 2. Load + chunk documents
    // 3. Schedule map tasks per chunk via ctx.scheduler.runAfter(0, ...)
  }
});

export const processMyFeatureMapChunk = internalAction({ ... }); // one chunk
export const finalizeMyFeaturePhase = internalAction({ ... });   // combine + save
```

### `convex/studio/_shared.ts` — Add scheduling action

```typescript
export const scheduleMyFeature = action({
  args: { notebookId: v.id("notebooks"), documentIds: v.array(v.id("documents")), ... },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    // 1. Check rate limits
    // 2. Create DB record (status: 'draft')
    // 3. ctx.scheduler.runAfter(0, internal.studio.myfeature.job.myFeatureGeneration, {...})
    return { myFeatureId, status: "generating" };
  }
});
```

---

## Step 4: Model Layer (`convex/_model/myfeature.ts`)

CRUD helpers called by mutations — keeps `index.ts` clean:

```typescript
export async function createMyFeature(ctx, data) { ... }
export async function getMyFeature(ctx, id) { ... }
export async function updateMyFeature(ctx, id, patch) { ... }
export async function deleteMyFeature(ctx, id) { ... }
```

---

## Step 5: Frontend API Service (`apps/web/src/features/studio/services/myfeatureApi.ts`)

```typescript
// Type mapping from DB → UI Note type
function mapMyFeatureToNote(db: any): MyFeatureNote { ... }

// Hooks
export function useMyFeatures(notebookId) { return useQuery(api.studio.myfeature.index.list, ...) }
export function useMyFeature(id) { return useQuery(api.studio.myfeature.index.get, ...) }
export function useCreateMyFeature() { return useAction(api.studio._shared.scheduleMyFeature) }
export function useRenameMyFeature() { return useMutation(api.studio.myfeature.index.update).withOptimisticUpdate(...) }
export function useDeleteMyFeature() { return useMutation(api.studio.myfeature.index.remove).withOptimisticUpdate(...) }

// Polling helper
export async function pollMyFeatureStatus(getNote, onUpdate, maxAttempts = 180, interval = 2000) {
  // Poll every 2s until status === 'completed' | 'failed'
}
```

---

## Step 6: View Component (`apps/web/src/features/studio/components/views/MyFeatureView.tsx`)

```typescript
interface MyFeatureViewProps {
  note: MyFeatureNote;
  onBack?: () => void;
}

export function MyFeatureView({ note, onBack }: MyFeatureViewProps) {
  // Render generated content
  // Use <MarkdownRenderer> for text content
  // Restore progress from note.metadata if needed
}
```

---

## Step 7: Flow Hook (`apps/web/src/features/studio/hooks/flows/useCreateMyFeatureFlow.ts`)

```typescript
export function useCreateMyFeatureFlow(ctx: CreateFlowContext) {
  const createMyFeature = useCreateMyFeature();

  return useCallback(async (config: MyFeatureConfig) => {
    const selectedDocumentIds = ctx.sources.filter(s => s.selected).map(s => s.id);

    // 1. Create placeholder note in UI
    ctx.onAddNote({ id: tempId, status: 'generating', ... });

    // 2. Call backend
    const { myFeatureId } = await createMyFeature({ notebookId: ctx.noteId, documentIds: selectedDocumentIds, ... });

    // 3. Replace placeholder + poll until done
    ctx.onUpdateNoteFull(tempId, initialNote);
    pollMyFeatureStatus(
      () => ctx.notes.find(n => n.id === myFeatureId),
      (updated) => ctx.onUpdateNoteFull(myFeatureId, updated)
    );
  }, [ctx]);
}
```

Wire into `useStudioHandlers.ts`.

---

## Checklist

- [ ] `convex/schema.ts` — add table with status + data fields + indices
- [ ] `convex/_agents/myfeature/` — state, prompts, nodes, re-export
- [ ] `convex/_model/myfeature.ts` — CRUD helpers
- [ ] `convex/studio/myfeature/index.ts` — public + internal mutations/queries
- [ ] `convex/studio/myfeature/job.ts` — multi-phase internalActions
- [ ] `convex/studio/_shared.ts` — add `scheduleMyFeature` action
- [ ] `apps/web/src/features/studio/services/myfeatureApi.ts` — hooks + polling
- [ ] `apps/web/src/features/studio/components/views/MyFeatureView.tsx` — view component
- [ ] `apps/web/src/features/studio/hooks/flows/useCreateMyFeatureFlow.ts` — flow hook
- [ ] Wire flow into `useStudioHandlers.ts`
- [ ] Add type to `Note` union in `apps/web/src/features/studio/types.ts` (or equivalent)
- [ ] Run `bun run typecheck:convex` and `bun run typecheck:web`

---

## Key Patterns

| Pattern               | Rule                                                               |
| --------------------- | ------------------------------------------------------------------ |
| Job scheduling        | `ctx.scheduler.runAfter(0, internal.*, args)` — no jobs table      |
| Timeouts              | Split into 3+ chained internalActions (map/collapse/reduce phases) |
| LLM structured output | `llm.withStructuredOutput(ZodSchema)` — never parse raw strings    |
| Parallel processing   | LangGraph `Send` API + reducer on `mapOutputs` state               |
| Client → server       | Public `action` → `internal` mutations only                        |
| Status tracking       | Always update status before/after each phase                       |
| Smart vs fast LLM     | `env.SMART_LLM` for reduce, `env.FAST_LLM` for map chunks          |
