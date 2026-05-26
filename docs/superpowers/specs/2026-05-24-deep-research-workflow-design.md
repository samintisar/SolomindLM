# Deep Research Workflow Refactor

Refactor deep research to use `@convex-dev/workflow` (same pattern as literature review).

## Context

Currently deep research uses manual `ctx.scheduler.runAfter()` scheduling:

1. HTTP `/chat/stream` schedules `runWithStreamId` → generates plan, streams it via `persistentTextStreaming`
2. User approves via `approveResearchPlan` mutation (plain DB status update)
3. Frontend calls HTTP `/research/execute` → creates `researchRuns`, schedules `runResearchExecute`
4. `runResearchExecute` runs the research agent as a single long action

Literature review uses `@convex-dev/workflow` with `WorkflowManager`, `step.awaitEvent()`, `sendEvent()`, and `restart()`. This design unifies deep research on the same pattern.

## Architecture

```
Frontend sends message with deepResearch=true
  ↓
startDeepResearch mutation
  ↓
DeepResearchGraph workflow starts
  ├─ Step 1: planning → generate plan, create researchPlans + chat message
  ├─ Step 2: awaiting_approval → step.awaitEvent(planApprovedEvent)
  │            ↑ Frontend calls approveDeepResearchPlan → sendEvent()
  └─ Step 3: execution → create researchRuns, execute research, stream tokens
  ↓
Frontend polls persistentTextStreaming for results
```

## Schema Changes

### `researchPlans`

Add fields:

```ts
workflowId: v.string(),           // required, set after workflow.start()
status: v.union(
  v.literal("planning"),
  v.literal("draft"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed")
),
```

Migration: backfill existing rows with `workflowId: ""` and keep current string status (cast to union).

### `researchRuns`

No schema changes. Continue using for execution artifacts (`streamId`, `resultMessageId`, etc.).

The workflow creates the `researchRuns` row **before** `awaitEvent` so it exists when the user approves, avoiding races with the frontend stream consumer.

## Workflow Definition

### `convex/_agents/research/DeepResearchGraph.ts`

```ts
import { WorkflowManager, defineEvent, type WorkflowCtx } from "@convex-dev/workflow";
import { components } from "../../_generated/api";
import { v } from "convex/values";
import { internal } from "../../_generated/api";

export const workflow = new WorkflowManager(components.workflow);

const planApprovedEvent = defineEvent({
  name: "planApproved",
  validator: v.object({
    planId: v.id("researchPlans"),
    modifiedSubQuestions: v.optional(v.array(/* ... */)),
  }),
});

export const deepResearchWorkflow = workflow
  .define({
    args: {
      query: v.string(),
      notebookId: v.id("notebooks"),
      userId: v.id("users"),
      conversationId: v.id("conversations"),
      messageId: v.id("messages"),      // user message to link plan to
      sourcePolicy: v.optional(/* ... */),
      smartModel: v.optional(v.string()),
    },
    returns: v.object({
      planId: v.id("researchPlans"),
      runId: v.id("researchRuns"),
    }),
  })
  .handler(async (step, args) => {
    // ── Step 1: Planning ──
    await trackStep(step, ..., "planning", "in_progress");
    const plan = await step.runAction(internal.research.workflowSteps.planReview, {
      query: args.query,
      smartModel: args.smartModel,
    });
    const planId = await step.runMutation(internal.research.index.createResearchPlanInternal, {
      ...args,
      subQuestions: plan.subQuestions,
    });
    await step.runMutation(internal.chat.index.addMessage, {
      conversationId: args.conversationId,
      role: "assistant",
      content: `**Research plan generated** — ${plan.subQuestions.length} sub-questions. Awaiting your approval.`,
      metadata: { researchPlanId: planId, isResearchPlan: true },
    });
    await trackStep(step, ..., "planning", "completed");

    // ── Step 2: Create run row (before await to avoid frontend race) ──
    const streamId = await step.runAction(internal.research.index.createStreamInternal, {});
    await step.runMutation(internal.research.index.createResearchRunInternal, {
      planId,
      userId: args.userId,
      notebookId: args.notebookId,
      conversationId: args.conversationId,
      streamId,
      status: "pending",
    });

    // ── Step 3: Await approval ──
    await trackStep(step, ..., "awaiting_user_input", "in_progress");
    const { modifiedSubQuestions } = await step.awaitEvent(planApprovedEvent);
    await step.runMutation(internal.research.index.patchPlanInternal, {
      planId,
      subQuestions: modifiedSubQuestions,
      status: "approved",
    });
    await trackStep(step, ..., "awaiting_user_input", "completed");

    // ── Step 4: Execution ──
    // Look up the run (works on normal flow and on restart since row is in DB)
    const run = await step.runQuery(internal.research.index.getLatestResearchRunByPlanInternal, {
      planId,
    });
    if (!run) throw new Error("Run not found after approval");
    await step.runMutation(internal.research.index.updateRunProgressInternal, {
      runId: run._id,
      status: "running",
    });
    await trackStep(step, ..., "execution", "in_progress");

    await step.runAction(internal.research.workflowSteps.executeResearch, {
      runId: run._id,
      planId,
      streamId: run.streamId,
      query: args.query,
      userId: args.userId,
      notebookId: args.notebookId,
      conversationId: args.conversationId,
    });

    await trackStep(step, ..., "execution", "completed");
    return { planId, runId };
  });
```

**Notes:**
- `trackStep` writes to `researchSteps` table (already exists, shared with literature review).
- `executeResearch` action is extracted from `chat/stream.ts:runResearchExecute` into `research/workflowSteps.ts`.
- `planReview` action is extracted from `chat/stream.ts:runResearchPlanPhase` into `research/workflowSteps.ts`.

## Backend Mutations / Actions

### New / modified files

| File | Purpose |
|------|---------|
| `convex/_agents/research/DeepResearchGraph.ts` | Workflow definition |
| `convex/research/workflowSteps.ts` | `planReview` and `executeResearch` actions (extracted from `chat/stream.ts`) |
| `convex/research/index.ts` | `startDeepResearch`, `approveDeepResearchPlan`, `retryDeepResearch`, internal helpers |
| `convex/chat/stream.ts` | Remove `runResearchPlanPhase` and `runResearchExecute`; keep chat streaming for non-research |
| `convex/http.ts` | Remove deep research branching from `/chat/stream`; simplify `/research/execute` to stream-reader only |

### `startDeepResearch` (mutation)

Analogous to `startLiteratureReview` in `studio/literature_tables/index.ts`:

1. Validate auth + notebook access.
2. Add user message to conversation.
3. Insert assistant placeholder.
4. Start workflow via `workflow.start(...)`.
5. Patch `researchPlans` with `workflowId`.
6. Return `{ planId, conversationId }`.

### `approveResearchPlan` (mutation — modify existing)

Analogous to `confirmLiteratureReviewColumns`:

1. Validate auth + plan ownership.
2. Patch `researchPlans` status to `"approved"` and apply any `modifiedSubQuestions`.
3. Call `sendEvent(ctx, components.workflow, { name: "planApproved", ... })` to resume the workflow.

This reuses the existing frontend hook (`useApproveResearchPlan`) — no approval UI changes needed.

### `retryDeepResearch` (mutation)

Analogous to `retryLiteratureReview`:

1. Validate auth + plan ownership.
2. Map step names to action refs: `planning`, `execution`.
3. Call `restart(ctx, components.workflow, plan.workflowId, stepMap[fromStep])`.

### `research/workflowSteps.ts`

Extract two actions from `chat/stream.ts`:

- `planReview` — generates sub-questions using `ResearchAgent.generatePlan()`. Returns `{ subQuestions, sourcePolicy }`.
- `executeResearch` — runs `ResearchAgent.executeResearch()`, writes tokens to `persistentTextStreaming`, persists evidence, final message. Identical logic to current `runResearchExecute`.

## Frontend Changes

### Initiation flow

Currently: `ChatPanel.tsx` sends deep research messages to HTTP `/chat/stream`.

New: when `deepResearch: true`, call `startDeepResearch` Convex mutation instead.

```ts
const startDeepResearch = useMutation(api.research.index.startDeepResearch);

// in send handler
if (deepResearchEnabled) {
  await startDeepResearch({
    notebookId,
    conversationId,
    query: message,
    sourcePolicy,
  });
  // workflow handles message insertion; no HTTP stream to consume
} else {
  // existing normal chat HTTP stream
}
```

### Approval flow

No change to `ResearchPlanMessage.tsx` UX. `onApprove` still:

1. Calls `approveResearchPlan` mutation.
2. Calls HTTP `/research/execute` to start reading the stream.

But `approveResearchPlan` now calls `sendEvent()` instead of just patching DB status. And `/research/execute` no longer schedules anything — it just finds the existing `researchRuns` row and returns the stream polling response.

### Stream reading

Unchanged. After approval, frontend polls `/research/execute` HTTP endpoint which reads from `persistentTextStreaming`.

## Migration Plan

1. **Schema** — add `workflowId` and expand `researchPlans.status` union. Backfill existing rows.
2. **Extract actions** — move `runResearchPlanPhase` and `runResearchExecute` from `chat/stream.ts` to `research/workflowSteps.ts` without changing logic.
3. **Create workflow** — write `DeepResearchGraph.ts`.
4. **Add mutations** — `startDeepResearch`, `approveDeepResearchPlan`, `retryDeepResearch`.
5. **Update HTTP** — remove deep research scheduling from `/chat/stream`; simplify `/research/execute`.
6. **Update frontend** — switch deep research initiation from HTTP to mutation.
7. **Test** — verify plan generation, approval, execution, failure, retry.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Workflow step timeouts | Literature review already uses this pattern; research execution is comparable duration. |
| Frontend race: approve before run row created | Create `researchRuns` row **before** `awaitEvent` in workflow. |
| StreamId reuse on retry | `restart()` replays from a step; create a new `streamId` on retry or clear old stream. |
| Backward compat with existing plans | Old plans have empty `workflowId`; `retryDeepResearch` validates `workflowId` exists. |
