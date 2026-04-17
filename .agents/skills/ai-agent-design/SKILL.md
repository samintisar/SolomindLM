---
name: ai-agent-design
description: Design and implement production-grade AI agents using LangGraph (TypeScript) and Convex as the backend. Use this skill whenever the user wants to build an AI agent, agentic workflow, multi-agent system, LLM pipeline, or anything involving autonomous task execution, tool-calling, ReAct loops, orchestrator-worker patterns, or stateful AI systems — especially when TypeScript, LangGraph, or Convex are mentioned or implied. Also trigger when the user asks about state management for agents, agent memory, human-in-the-loop checkpoints, or connecting LLMs to tools and external APIs in a TypeScript codebase.
---

# LangGraph + Convex AI Agent Design Skill

This skill encodes production-grade design principles for building AI agents in **TypeScript** using **LangGraph** for orchestration and **Convex** as the backend (database, real-time state, serverless functions, and caching).

Before writing any code, diagnose the right architecture using the decision framework below. The single most common mistake is over-engineering — reaching for multi-agent complexity before validating a single-agent approach.

---

## Part 1: Design Principles (Read First)

These aren't rules to follow blindly — they're the distilled lessons of what separates working production agents from prototypes that collapse under real usage.

### 1. Start with the simplest possible thing

Always begin with a single LangGraph node and one clear system prompt. Verify the agent reliably understands and executes a tightly-scoped task before expanding. If you find yourself adding complexity early, that's usually a sign the task definition is fuzzy, not that you need more agents.

### 2. LLM intelligence belongs at bounded decision points only

Deterministic code should handle routing, data transformation, retries, and error handling. Reserve LLM calls for the things only LLMs can do: natural language understanding, unstructured data extraction, and fuzzy reasoning. The temptation to make everything "smart" is what kills reliability.

### 3. State is the architecture

In LangGraph, your `StateAnnotation` is the contract between every node. Define it deliberately — it should encode everything the agent needs to make decisions at any point in the graph. Sloppy state design causes the majority of cascading failures in multi-agent systems.

### 4. Convex owns all persistent state; LangGraph owns execution state

LangGraph's in-memory graph state is ephemeral — it's the execution scratchpad. Anything that needs to survive across sessions, be queried, or be accessed by the frontend lives in Convex. This separation is critical for building pausable, resumable, and observable workflows.

### 5. Agents fail silently — build for observability from day one

Traditional software throws errors. Agents produce confident-sounding wrong answers. Every tool call, state transition, and LLM response should be logged to Convex so you can trace exactly what happened when something goes wrong. If you can't replay the agent's trajectory, you can't debug it.

### 6. Irreversible operations require human-in-the-loop gates

Any action that mutates external state, sends a message, charges money, or cannot be undone must pause execution and wait for explicit approval. LangGraph's `interrupt()` + Convex's real-time subscriptions make this natural to implement.

---

## Part 2: Architecture Decision Framework

Use this to choose the right pattern before writing code.

```
Is the task fully definable as a sequence of known steps?
├── YES → Use a Workflow Pattern (see Part 3)
│         └── Does it need branching/routing? → Routing Workflow
│             Does it need parallel work? → Parallelization Workflow
│             Is it strictly sequential? → Prompt Chaining Workflow
│
└── NO → Does the agent need to autonomously choose which tools to use?
          ├── YES → Use the ReAct Agent Pattern (see Part 4)
          └── Is there too much complexity for one agent?
                └── YES → Use Multi-Agent Pattern (see Part 5)
                          Only after validating single-agent fails.
```

**Escalation order:** Prompt Chaining → Routing → Parallelization → ReAct Agent → Multi-Agent. Never skip levels without justification.

---

## Part 3: Workflow Patterns in TypeScript

Workflows are the workhorses of production systems. They're predictable, testable, and cheap to debug.

### 3a. Prompt Chaining

Each node processes the output of the previous one. Gates between nodes validate structure before proceeding.

```typescript
import { Annotation, StateGraph, END } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./_generated/api";

const ChainState = Annotation.Root({
  input: Annotation<string>,
  outline: Annotation<string>,
  draft: Annotation<string>,
  finalOutput: Annotation<string>,
});

const llm = new ChatAnthropic({ model: "claude-opus-4-5" });
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// Gate function — validates structure before advancing
function validateOutline(state: typeof ChainState.State) {
  if (!state.outline || state.outline.length < 50) {
    throw new Error("Outline too short — re-running generation");
  }
  return state;
}

const graph = new StateGraph(ChainState)
  .addNode("generate_outline", async (state) => {
    const response = await llm.invoke([
      { role: "user", content: `Create an outline for: ${state.input}` },
    ]);
    const outline = response.content as string;
    // Persist to Convex immediately
    await convex.mutation(api.agentRuns.saveStep, { step: "outline", content: outline });
    return { outline };
  })
  .addNode("validate_outline", (state) => validateOutline(state))
  .addNode("write_draft", async (state) => {
    const response = await llm.invoke([
      { role: "user", content: `Write a full draft from this outline:\n${state.outline}` },
    ]);
    return { draft: response.content as string };
  })
  .addEdge("__start__", "generate_outline")
  .addEdge("generate_outline", "validate_outline")
  .addEdge("validate_outline", "write_draft")
  .addEdge("write_draft", END)
  .compile();
```

### 3b. Routing

A classifier LLM routes to specialized downstream handlers. Use this whenever you have meaningfully different task types that benefit from different prompts or even different models.

```typescript
const RouterState = Annotation.Root({
  userMessage: Annotation<string>,
  intent: Annotation<"billing" | "technical" | "general">,
  response: Annotation<string>,
});

const graph = new StateGraph(RouterState)
  .addNode("classify_intent", async (state) => {
    const response = await llm.invoke([
      {
        role: "user",
        content: `Classify this as exactly one of [billing, technical, general]: "${state.userMessage}". Respond with only the label.`,
      },
    ]);
    return { intent: response.content as "billing" | "technical" | "general" };
  })
  .addNode("handle_billing", async (state) => {
    /* ... */
  })
  .addNode("handle_technical", async (state) => {
    /* ... */
  })
  .addNode("handle_general", async (state) => {
    /* ... */
  })
  .addConditionalEdges("classify_intent", (state) => state.intent, {
    billing: "handle_billing",
    technical: "handle_technical",
    general: "handle_general",
  })
  // ... remaining edges
  .compile();
```

### 3c. Parallelization

Run independent subtasks concurrently, then aggregate. In LangGraph TypeScript, use the `Send` API for fan-out and a reducer for fan-in.

```typescript
import { Send } from "@langchain/langgraph";

const ParallelState = Annotation.Root({
  query: Annotation<string>,
  // Reducer accumulates results from parallel branches
  results: Annotation<string[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),
  finalSummary: Annotation<string>,
});

// Fan-out: generate subtasks dynamically
function planSubtasks(state: typeof ParallelState.State) {
  const subtasks = ["pricing", "availability", "reviews"]; // could be LLM-generated
  return subtasks.map((task) => new Send("research_subtask", { ...state, currentTask: task }));
}

const graph = new StateGraph(ParallelState)
  .addNode("plan", (state) => state) // planning node
  .addNode("research_subtask", async (state: any) => {
    const result = await llm.invoke([
      { role: "user", content: `Research ${state.currentTask} for: ${state.query}` },
    ]);
    return { results: [result.content as string] };
  })
  .addNode("aggregate", async (state) => {
    const summary = await llm.invoke([
      {
        role: "user",
        content: `Synthesize these findings:\n${state.results.join("\n\n")}`,
      },
    ]);
    return { finalSummary: summary.content as string };
  })
  .addConditionalEdges("plan", planSubtasks, ["research_subtask"])
  .addEdge("research_subtask", "aggregate")
  .addEdge("aggregate", END)
  .compile();
```

---

## Part 4: ReAct Agent Pattern

Use when the agent must autonomously choose which tools to invoke and in what order. The LLM reasons, acts, observes, and iterates until done.

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Define tools with strict schemas — the LLM's structured output becomes tool calls
const searchWeb = tool(
  async ({ query }: { query: string }) => {
    // implementation
    return `Search results for: ${query}`;
  },
  {
    name: "search_web",
    description:
      "Search the web for current information. Use when you need facts beyond your training data.",
    schema: z.object({ query: z.string().describe("Specific search query") }),
  }
);

const calculateMetric = tool(
  async ({ values, operation }: { values: number[]; operation: string }) => {
    // deterministic calculation — never use LLM for math
    return JSON.stringify({ result: /* calculation */ 0 });
  },
  {
    name: "calculate",
    description:
      "Perform numerical calculations. Always use this for math — never reason through numbers yourself.",
    schema: z.object({
      values: z.array(z.number()),
      operation: z.enum(["sum", "average", "max", "min"]),
    }),
  }
);

// Guard against infinite loops
const MAX_ITERATIONS = 10;

const agent = createReactAgent({
  llm,
  tools: [searchWeb, calculateMetric],
  // System prompt is owned entirely by you — never delegate this to a framework
  messageModifier: `You are a research assistant. Think step by step.
Always use tools for facts and calculations — never fabricate data.
If a tool call fails, reason about why and try a different approach.
Stop when you have a complete, grounded answer.`,
});

// Persist agent runs to Convex for observability
async function runWithPersistence(input: string, runId: string) {
  const stream = await agent.stream({ messages: [{ role: "user", content: input }] });

  for await (const chunk of stream) {
    // Log every state transition to Convex
    await convex.mutation(api.agentRuns.appendEvent, {
      runId,
      event: JSON.stringify(chunk),
      timestamp: Date.now(),
    });
  }
}
```

**Critical guardrails for ReAct agents:**

- Set `recursionLimit` on the graph config — never let the loop run unbounded
- Log every tool call and result to Convex before proceeding
- Compact error messages back into context rather than crashing: append errors as tool results
- If tool schemas are poorly documented, the agent will misuse them — good docs > more tools

---

## Part 5: Multi-Agent Patterns

Only reach for multi-agent when a single agent with tools genuinely fails. "Bag of agents" without structure amplifies errors. Use explicit topologies.

### Orchestrator-Workers

A supervisor LLM decomposes a complex task and delegates to specialists. Workers are independent graphs invoked by the orchestrator.

```typescript
import { Command } from "@langchain/langgraph";

const SupervisorState = Annotation.Root({
  task: Annotation<string>,
  plan: Annotation<string[]>,
  workerResults: Annotation<Record<string, string>>({
    reducer: (existing, incoming) => ({ ...existing, ...incoming }),
    default: () => ({}),
  }),
  finalOutput: Annotation<string>,
});

// Supervisor decides which worker to call next
async function supervisorNode(state: typeof SupervisorState.State) {
  // Dynamically determine next worker based on remaining work
  const remaining = state.plan.filter((step) => !state.workerResults[step]);
  if (remaining.length === 0) return new Command({ goto: "synthesize" });

  const nextTask = remaining[0];
  return new Command({
    goto: nextTask.startsWith("code") ? "coder_worker" : "researcher_worker",
    update: { currentTask: nextTask },
  });
}
```

### Evaluator-Optimizer

For tasks with clear quality criteria. A generator produces output, an evaluator scores it, and the generator refines based on feedback.

```typescript
const EvalState = Annotation.Root({
  task: Annotation<string>,
  draft: Annotation<string>,
  feedback: Annotation<string>,
  score: Annotation<number>,
  iteration: Annotation<number>,
});

function shouldContinueRefining(state: typeof EvalState.State) {
  // Stop when quality threshold met or max iterations reached
  if (state.score >= 8 || state.iteration >= 3) return END;
  return "generate";
}

const graph = new StateGraph(EvalState)
  .addNode("generate", async (state) => {
    const prompt = state.feedback
      ? `Revise this draft based on feedback:\nDraft: ${state.draft}\nFeedback: ${state.feedback}`
      : `Complete this task: ${state.task}`;
    const response = await llm.invoke([{ role: "user", content: prompt }]);
    return { draft: response.content as string, iteration: (state.iteration || 0) + 1 };
  })
  .addNode("evaluate", async (state) => {
    const response = await llm.invoke([
      {
        role: "user",
        content: `Score this output 1-10 and provide specific improvement feedback.
Task: ${state.task}
Output: ${state.draft}
Respond as JSON: {"score": number, "feedback": "string"}`,
      },
    ]);
    const { score, feedback } = JSON.parse(response.content as string);
    return { score, feedback };
  })
  .addEdge("__start__", "generate")
  .addEdge("generate", "evaluate")
  .addConditionalEdges("evaluate", shouldContinueRefining, { generate: "generate", [END]: END })
  .compile();
```

---

## Part 6: Convex Integration Patterns

Convex is used for three things in an agent system: **persistent state**, **real-time UI subscriptions**, and **human-in-the-loop coordination**.

### Schema Design

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agentRuns: defineTable({
    runId: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("awaiting_approval"),
      v.literal("complete"),
      v.literal("failed")
    ),
    input: v.string(),
    currentStep: v.string(),
    events: v.array(
      v.object({
        type: v.string(),
        content: v.string(),
        timestamp: v.number(),
      })
    ),
    finalOutput: v.optional(v.string()),
    humanApproval: v.optional(v.boolean()),
  }).index("by_runId", ["runId"]),

  agentMemory: defineTable({
    userId: v.string(),
    key: v.string(), // semantic key for retrieval
    content: v.string(),
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId"],
    }),
});
```

### Human-in-the-Loop with LangGraph `interrupt()`

```typescript
import { interrupt } from "@langchain/langgraph";

// Inside a LangGraph node that requires approval
async function executePaymentNode(state: typeof PaymentState.State) {
  // Pause execution and surface to UI via Convex
  await convex.mutation(api.agentRuns.setAwaitingApproval, {
    runId: state.runId,
    action: `Charge $${state.amount} to ${state.customerId}`,
  });

  // interrupt() pauses the graph and waits for resume
  const approval = interrupt({
    message: "Payment requires approval",
    amount: state.amount,
    customerId: state.customerId,
  });

  if (!approval.approved) throw new Error("Payment rejected by user");

  // Proceed with irreversible action only after explicit approval
  return { paymentStatus: "approved" };
}

// Resuming from a Convex mutation triggered by UI
// convex/mutations/approveAction.ts
export const approveAgentAction = mutation({
  args: { runId: v.string(), approved: v.boolean(), threadId: v.string() },
  handler: async (ctx, args) => {
    // Resume the graph from where it was interrupted
    await ctx.scheduler.runAfter(0, internal.agent.resumeGraph, {
      threadId: args.threadId,
      approvalResult: { approved: args.approved },
    });
    await ctx.db.patch(/* update run status */);
  },
});
```

### Cross-Session Memory with Convex Vector Search

```typescript
// Store memory after each significant agent interaction
async function storeMemory(userId: string, content: string) {
  const embedding = await llm.embeddings.create({
    input: content,
    model: "text-embedding-3-small",
  });
  await convex.mutation(api.agentMemory.store, {
    userId,
    key: `session_${Date.now()}`,
    content,
    embedding: embedding.data[0].embedding,
    createdAt: Date.now(),
  });
}

// Retrieve relevant memories before each agent run
async function getRelevantMemory(userId: string, query: string) {
  const embedding = await llm.embeddings.create({ input: query, model: "text-embedding-3-small" });
  return convex.query(api.agentMemory.vectorSearch, {
    userId,
    embedding: embedding.data[0].embedding,
    limit: 5,
  });
}
```

---

## Part 7: Observability Checklist

Before shipping any agent to production, verify:

- [ ] Every LLM call result is logged to `agentRuns.events` in Convex with a timestamp
- [ ] Every tool invocation logs both the input parameters and the result
- [ ] The graph has a `recursionLimit` set in the config
- [ ] All irreversible operations have an `interrupt()` gate or explicit confirmation step
- [ ] Error messages from failed tool calls are appended back to the agent's context, not swallowed
- [ ] A "golden set" of 20+ test cases exists with deterministic assertions
- [ ] Token usage is tracked per run (pass `callbacks` to LangGraph to capture this)
- [ ] Any agent with write permissions to Convex uses scoped access — only the tables it needs

---

## Part 8: Common Mistakes to Avoid

**Putting too much into the system prompt.** If your system prompt is >500 words, you likely have a task that needs decomposition. A focused, short system prompt almost always outperforms a long, comprehensive one.

**Using `any` for state types.** The state annotation is the source of truth for your entire graph. Type it precisely with Zod or TypeScript interfaces from the start.

**Storing LangGraph execution state in Convex.** LangGraph's checkpointer handles ephemeral execution state. Convex stores business state. Mixing these creates confusing dual sources of truth.

**Not compacting errors in ReAct loops.** When a tool fails, append the error as a structured tool result rather than throwing. Throwing crashes the loop; a structured error lets the LLM reason about the failure and try a different approach.

**Building multi-agent before validating single-agent.** Multi-agent systems multiply complexity and failure modes. Always build and ship a single-agent version first. Only escalate when the single agent demonstrably fails on your real workload.

---

## Reference Files

- `references/langgraph-typescript-api.md` — Key LangGraph TS APIs, types, and edge case notes
- `references/convex-agent-patterns.md` — Convex schema patterns, mutation templates, vector search setup

Read these when you need specifics on API signatures or Convex configuration details.
