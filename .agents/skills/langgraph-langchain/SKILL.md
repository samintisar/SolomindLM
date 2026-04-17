---
name: langgraph-langchain
description: Use when building, modifying, or debugging LangGraph agents or LangChain chains in this project. Covers StateGraph patterns, Annotation state, Send API for parallel fan-out, node composition, LLM factory usage, and project-specific shared utilities.
---

# LangGraph + LangChain Agent Development

This project uses **LangGraph** (`@langchain/langgraph`) for all AI generation agents and **LangChain** (`@langchain/core`, `@langchain/community`) for LLM integration. All agents live in `convex/_agents/` and use the shared utilities in `convex/_agents/_shared/`.

---

## Project Conventions

| Convention          | Rule                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- |
| File header         | Every agent file must start with `"use node"` directive                            |
| Agent location      | `convex/_agents/<feature>/` — one dir per agent type                               |
| Shared utilities    | Always prefer `_shared/` helpers over hand-rolling                                 |
| LLM creation        | Use `createLLMs()` / `createLLMsFromEnv()` from `_shared/llm_factory.ts`           |
| Graph building      | Use `buildMapReduceGraph()` / `buildLinearGraph()` from `_shared/graph_builder.ts` |
| Structured output   | Always use `.withStructuredOutput(ZodSchema)` — never parse raw LLM strings        |
| Parallel processing | Use LangGraph `Send` API + reducer on state fields                                 |
| Smart vs fast LLM   | `env.SMART_LLM` for reduce/synthesis, `env.FAST_LLM` for map/extraction            |

---

## Agent Directory Structure

Each agent follows this 4-file structure (use `_agents/flashcard/` as the reference):

```
convex/_agents/myfeature/
  state.ts      — LangGraph Annotation state definitions
  prompts.ts    — Zod schemas, types, prompt strings
  nodes.ts      — Node functions + main class
convex/_agents/MyFeatureGraph.ts  — Re-export from nodes.ts
```

---

## 1. State (`state.ts`)

Use `Annotation.Root` for state definition. Use reducers for fields that accumulate parallel results:

```typescript
"use node";
import { Annotation } from "@langchain/langgraph";

export const OverallState = Annotation.Root({
  // Input
  documentIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  chunks: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  // Parallel accumulation — reducer concatenates results from Send fan-out
  mapOutputs: Annotation<MyItem[][]>({
    reducer: (x, y) => (y ? x.concat(y) : x),
    default: () => [],
  }),
  // Final output
  finalOutput: Annotation<MyItem[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  // Config params
  topic: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => "" }),
  count: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 10 }),
});

export type OverallStateType = typeof OverallState.State;
```

For **chunk-level parallel state** (used in Send fan-out):

```typescript
export const ChunkProcessState = Annotation.Root({
  chunk: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => "" }),
  chunkIndex: Annotation<number>({ reducer: (x, y) => y ?? x, default: () => 0 }),
  topic: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => "" }),
});
export type ChunkProcessStateType = typeof ChunkProcessState.State;
```

---

## 2. Prompts & Schemas (`prompts.ts`)

```typescript
"use node";
import { z } from "zod";

// Always define Zod schemas for structured output
export const MyItemSchema = z.object({
  front: z.string().describe("Question or term"),
  back: z.string().describe("Answer or definition"),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export const MyItemArraySchema = z.object({
  items: z.array(MyItemSchema),
});

export type MyItem = z.infer<typeof MyItemSchema>;

// System prompts as constants
export const MAP_SYSTEM_PROMPT = `You are an expert at extracting...
Generate {count} items from the provided content.
Return valid JSON matching the schema.`;

export const REDUCE_SYSTEM_PROMPT = `You are an expert at synthesizing...
Select the best {count} items from the candidates.`;
```

---

## 3. Nodes & Class (`nodes.ts`)

### LLM Setup

```typescript
"use node";
import { createLLMs } from "../_shared/llm_factory.js";
import { env } from "../../_lib/env.js";

// In constructor or runGraph()
const { fastLlm, smartLlm } = createLLMs({
  apiKey: env.TOGETHER_AI_API_KEY,
  mapModel: env.FAST_LLM, // parallel extraction
  reduceModel: env.SMART_LLM, // synthesis
  temperatures: { map: 0.3, reduce: 0.6 },
});

// Structured output binding
const mapLlm = fastLlm.withStructuredOutput(MyItemArraySchema);
const reduceLlm = smartLlm.withStructuredOutput(MyItemArraySchema);
```

### Node Functions

**Map node** — receives the _sent state_ (only the fields passed via `Send`), returns only the accumulator field on `OverallState`. The graph merges it via the reducer.

```typescript
// Input is ChunkProcessStateType (what was passed in Send), NOT OverallStateType
// Return type is only the accumulator field — not the full OverallState
async function mapProcessNode(
  state: typeof ChunkProcessState.State
): Promise<{ mapOutputs: MyItem[][] }> {
  const result = await mapLlm.invoke([
    { role: "system", content: MAP_SYSTEM_PROMPT.replace("{count}", String(perChunkCount)) },
    { role: "user", content: state.chunk },
  ]);
  return { mapOutputs: [result.items] }; // reducer on OverallState.mapOutputs concatenates this
}
```

**Reduce / linear node** — receives full `OverallState`, returns only changed fields:

```typescript
async function reduceNode(state: typeof OverallState.State): Promise<{ finalOutput: MyItem[] }> {
  const candidates = state.mapOutputs.flat();
  const result = await reduceLlm.invoke([
    { role: "system", content: REDUCE_SYSTEM_PROMPT.replace("{count}", String(state.count)) },
    { role: "user", content: JSON.stringify(candidates) },
  ]);
  return { finalOutput: result.items };
}
```

### Route Function for Send Fan-out

```typescript
import { Send } from "@langchain/langgraph";

function routeToMap(state: OverallStateType): Send[] {
  return state.chunks.map(
    (chunk, i) =>
      new Send("map", {
        chunk,
        chunkIndex: i,
        topic: state.topic,
      })
  );
}
```

### Main Class

```typescript
export class MyFeatureGraph {
  async runGraph(input: { chunks: string[]; topic: string; count: number }): Promise<MyItem[]> {
    const graph = buildMapReduceGraph({
      state: OverallState,
      mapNode: mapProcessNode,
      collapseNode: collapseNode, // optional: merge before reduce
      reduceNode: reduceNode,
      routeToMap,
    });

    const result = await graph.invoke({
      chunks: input.chunks,
      topic: input.topic,
      count: input.count,
    });

    return result.finalOutput;
  }
}
```

---

## 4. Project Graph Builders (`_shared/graph_builder.ts`)

> **These are project-internal wrappers**, not LangGraph builtins. They live in `convex/_agents/_shared/graph_builder.ts` and are thin factories built on top of `StateGraph`, `addNode`, `addEdge`, and `addConditionalEdges`. If you go looking for them in `@langchain/langgraph` docs you won't find them.

### MapReduce Graph (most common pattern)

```
START → routeToMap → [map×N parallel] → collapse → reduce → END
```

```typescript
import { buildMapReduceGraph } from "../_shared/graph_builder.js";

const graph = buildMapReduceGraph({
  state: OverallState,
  mapNode: mapProcessNode, // runs once per Send
  collapseNode: collapseNode, // optional, merges before reduce
  reduceNode: reduceNode, // final synthesis
  routeToMap, // returns Send[]
  mapNodeName: "processChunk", // optional custom names
  reduceNodeName: "synthesize",
  skipCollapse: false, // set true to skip collapse phase
});
```

### Linear Graph (sequential pipeline)

```
START → step1 → step2 → step3 → END
```

```typescript
import { buildLinearGraph } from "../_shared/graph_builder.js";

const graph = buildLinearGraph({
  state: OverallState,
  nodes: [
    { name: "extract", handler: extractNode },
    { name: "analyze", handler: analyzeNode },
    { name: "format", handler: formatNode },
  ],
});
```

### Custom Graph (complex routing)

```typescript
import { buildCustomGraph } from "../_shared/graph_builder.js";

const graph = buildCustomGraph(
  OverallState,
  {
    validate: validateNode,
    process: processNode,
    fallback: fallbackNode,
  },
  [
    [START, "validate"],
    ["validate", (state) => (state.isValid ? "process" : "fallback")],
    ["process", END],
    ["fallback", END],
  ]
);
```

### Conditional Routes (project utility, not a LangGraph builtin)

```typescript
import { createConditionalRoute } from "../_shared/graph_builder.js";

const route = createConditionalRoute(
  {
    needsRetry: (state) => state.retryCount < 3 && state.hasError,
    hasError: (state) => state.hasError,
  },
  "success" // default
);
// Returns: 'needsRetry' | 'hasError' | 'success'
```

---

## 5. LangSmith Integration

Always pass LangSmith config when invoking graphs/LLMs in production jobs:

```typescript
import { createJobLangSmithConfig } from "../_shared/langsmith.js";

const langSmithConfig = createJobLangSmithConfig("flashcard", flashcardId, {
  notebookId,
  userId,
  additionalTags: ["priority:high"],
});

// Pass as second arg to graph.invoke()
const result = await graph.invoke(initialState, langSmithConfig);

// Or pass to LLM calls directly
const result = await llm.invoke(messages, langSmithConfig);
```

---

## 6. Graph Root Export (`MyFeatureGraph.ts`)

The root file re-exports from the feature directory:

```typescript
"use node";
// Re-export main class
export { MyFeatureGraph } from "./myfeature/nodes.js";

// Re-export types for consumers
export type { OverallStateType, ChunkProcessStateType, MyItem } from "./myfeature/state.js";
export type { MyItemResponse } from "./myfeature/prompts.js";
```

---

## Key Patterns Quick Reference

| Task                   | How                                                                   |
| ---------------------- | --------------------------------------------------------------------- |
| Parallel fan-out       | `Send` API in route function + reducer on output field                |
| Structured LLM output  | `llm.withStructuredOutput(ZodSchema)`                                 |
| LLM messages           | Pass array: `[{role:'system',content:...},{role:'user',content:...}]` |
| State update           | Return `Partial<State>` — only changed fields                         |
| Collapse before reduce | Use `collapseNode` in MapReduce config                                |
| Type safety on graph   | Cast with `as never` for node/edge names (project pattern)            |
| Skip collapse          | `skipCollapse: true` in `buildMapReduceGraph`                         |
| Check if enabled       | `isLangSmithEnabled()` from `_shared/langsmith.ts`                    |

---

## LangGraph Version Notes

This project uses LangGraph **v1.x**. Key change vs v0.x:

```typescript
// createReactAgent was removed from @langchain/langgraph/prebuilt in v1
// OLD (v0, will error in v1):
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// NEW (v1+):
import { createAgent } from "langchain";
```

This codebase does **not** use `createReactAgent` — it builds `StateGraph` directly, so this doesn't apply today. But don't reach for `createReactAgent` from LangGraph if you see it in external examples.

---

## LangChain Community Models

The project uses `ChatTogetherAI` from `@langchain/community`. The deep import path is what the project currently uses — verify against the installed version if you hit bundler errors:

```typescript
// Deep import — matches project's current usage; check package.json if this breaks
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";

// Root import — works on some versions of @langchain/community
// import { ChatTogetherAI } from '@langchain/community';

const llm = new ChatTogetherAI({
  apiKey: env.TOGETHER_AI_API_KEY,
  model: env.FAST_LLM, // e.g. 'Qwen/Qwen3-80B'
  temperature: 0.3,
  maxTokens: 2000,
});

// Chain with structured output
const structured = llm.withStructuredOutput(MySchema);
const result = await structured.invoke(messages);
// result is typed as z.infer<typeof MySchema>
```

---

## References

- `convex/_agents/flashcard/` — canonical reference agent (MapReduce pattern)
- `convex/_agents/chat/` — chat agent (different pattern, no MapReduce)
- `convex/_agents/_shared/graph_builder.ts` — graph factory functions
- `convex/_agents/_shared/llm_factory.ts` — LLM creation helpers
- `convex/_agents/_shared/langsmith.ts` — tracing helpers
- `convex/_agents/_shared/state_factory.ts` — state helpers
- `add-studio-feature` skill — full stack for adding a new studio feature
