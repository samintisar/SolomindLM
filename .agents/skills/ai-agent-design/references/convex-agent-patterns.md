# Convex Agent Patterns Reference

## Role of Convex in an Agent System

| Concern                                                     | Owned By                                 |
| ----------------------------------------------------------- | ---------------------------------------- |
| Ephemeral execution state (current node, message history)   | LangGraph checkpointer                   |
| Business/persistent state (user data, run history, results) | Convex DB                                |
| Real-time UI updates (status, streaming output)             | Convex subscriptions                     |
| Human-in-the-loop coordination                              | Convex mutations + LangGraph interrupt() |
| Cross-session memory                                        | Convex vector search                     |
| Scheduled/background agent runs                             | Convex scheduler                         |

---

## Full Schema Template

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Track every agent run
  agentRuns: defineTable({
    runId: v.string(),
    userId: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("awaiting_approval"),
      v.literal("complete"),
      v.literal("failed")
    ),
    input: v.string(),
    currentStep: v.optional(v.string()),
    events: v.array(
      v.object({
        type: v.string(), // "llm_call" | "tool_call" | "tool_result" | "state_update"
        content: v.string(),
        timestamp: v.number(),
      })
    ),
    pendingApproval: v.optional(
      v.object({
        question: v.string(),
        context: v.string(),
      })
    ),
    output: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    tokenUsage: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_runId", ["runId"])
    .index("by_status", ["status"]),

  // Cross-session agent memory
  agentMemory: defineTable({
    userId: v.string(),
    sessionId: v.optional(v.string()),
    content: v.string(),
    summary: v.optional(v.string()), // compressed version for context injection
    embedding: v.optional(v.array(v.float64())),
    importance: v.number(), // 0-1, used to prune low-value memories
    createdAt: v.number(),
    lastAccessed: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId"],
    }),

  // Tool call audit log (separate from events for querying)
  toolCallLog: defineTable({
    runId: v.string(),
    toolName: v.string(),
    input: v.string(),
    output: v.string(),
    success: v.boolean(),
    durationMs: v.number(),
    timestamp: v.number(),
  })
    .index("by_runId", ["runId"])
    .index("by_toolName", ["toolName"]),
});
```

---

## Mutation Templates

### Starting an agent run

```typescript
// convex/mutations/agentRuns.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const startRun = mutation({
  args: { runId: v.string(), userId: v.string(), input: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentRuns", {
      runId: args.runId,
      userId: args.userId,
      status: "running",
      input: args.input,
      events: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
```

### Appending an event (call frequently from agent code)

```typescript
export const appendEvent = mutation({
  args: {
    runId: v.string(),
    type: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("agentRuns")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();
    if (!run) throw new Error(`Run ${args.runId} not found`);

    await ctx.db.patch(run._id, {
      events: [
        ...run.events,
        {
          type: args.type,
          content: args.content,
          timestamp: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    });
  },
});
```

### Setting awaiting approval state

```typescript
export const setAwaitingApproval = mutation({
  args: {
    runId: v.string(),
    question: v.string(),
    context: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("agentRuns")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();
    if (!run) throw new Error("Run not found");

    await ctx.db.patch(run._id, {
      status: "awaiting_approval",
      pendingApproval: { question: args.question, context: args.context },
      updatedAt: Date.now(),
    });
  },
});
```

### Completing a run

```typescript
export const completeRun = mutation({
  args: {
    runId: v.string(),
    output: v.string(),
    tokenUsage: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("agentRuns")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();
    if (!run) throw new Error("Run not found");

    await ctx.db.patch(run._id, {
      status: "complete",
      output: args.output,
      tokenUsage: args.tokenUsage,
      durationMs: args.durationMs,
      updatedAt: Date.now(),
    });
  },
});
```

---

## Query Templates

### Real-time run status (use with `useQuery` in React)

```typescript
// convex/queries/agentRuns.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getRunStatus = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("agentRuns")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();
  },
});
```

### Vector search for relevant memories

```typescript
export const searchMemory = query({
  args: {
    userId: v.string(),
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("agentMemory")
      .withVectorSearch("by_embedding", {
        vector: args.embedding,
        limit: args.limit ?? 5,
        filter: (q) => q.eq("userId", args.userId),
      })
      .collect();

    // Update last accessed timestamp
    await Promise.all(results.map((r) => ctx.db.patch(r._id, { lastAccessed: Date.now() })));

    return results;
  },
});
```

---

## Calling Convex from LangGraph Nodes

```typescript
import { ConvexHttpClient } from "convex/browser";
import { api } from "./_generated/api";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// Inside any LangGraph node
async function myNode(state: State) {
  // Log what the LLM is about to do
  await convex.mutation(api.agentRuns.appendEvent, {
    runId: state.runId,
    type: "llm_call",
    content: JSON.stringify({ prompt: state.currentPrompt }),
  });

  const response = await llm.invoke(/* ... */);

  // Log what the LLM returned
  await convex.mutation(api.agentRuns.appendEvent, {
    runId: state.runId,
    type: "llm_result",
    content: response.content as string,
  });

  return { output: response.content as string };
}
```

---

## Scheduled Agent Runs

Use `ctx.scheduler` for background/delayed execution:

```typescript
// convex/actions/scheduledAgent.ts — actions can call external APIs
import { internalAction } from "./_generated/server";

export const runAgentInBackground = internalAction({
  args: { runId: v.string(), input: v.string() },
  handler: async (ctx, args) => {
    // This runs in a Convex action (can call external APIs)
    // Initialize and run your LangGraph graph here
    const result = await graph.invoke({ input: args.input });

    await ctx.runMutation(internal.agentRuns.completeRun, {
      runId: args.runId,
      output: result.output,
    });
  },
});

// Schedule from a mutation
export const scheduleAgent = mutation({
  args: { input: v.string(), delayMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const runId = crypto.randomUUID();
    await ctx.db.insert("agentRuns", { runId, status: "running" /* ... */ });

    await ctx.scheduler.runAfter(args.delayMs ?? 0, internal.scheduledAgent.runAgentInBackground, {
      runId,
      input: args.input,
    });

    return runId;
  },
});
```

---

## Memory Pruning

Keep memory tables manageable with periodic pruning:

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.weekly(
  "prune old memories",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  internal.agentMemory.pruneOldMemories
);
export default crons;

// convex/mutations/agentMemory.ts
export const pruneOldMemories = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 days
    const old = await ctx.db
      .query("agentMemory")
      .filter((q) => q.and(q.lt(q.field("createdAt"), cutoff), q.lt(q.field("importance"), 0.3)))
      .collect();
    await Promise.all(old.map((m) => ctx.db.delete(m._id)));
  },
});
```
