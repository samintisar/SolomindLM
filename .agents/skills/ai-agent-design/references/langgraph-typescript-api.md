# LangGraph TypeScript API Reference

## Core Imports

```typescript
// Graph construction
import { Annotation, StateGraph, END, START, Send, Command } from "@langchain/langgraph";
// Prebuilt patterns
import { createReactAgent } from "@langchain/langgraph/prebuilt";
// Human-in-the-loop
import { interrupt } from "@langchain/langgraph";
// Memory/persistence
import { MemorySaver } from "@langchain/langgraph";
```

## StateAnnotation Patterns

### Basic annotation

```typescript
const MyState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer, // handles add/remove/update
    default: () => [],
  }),
  field: Annotation<string>, // last-write-wins (default)
  counter: Annotation<number>({
    reducer: (a, b) => a + b, // custom accumulator
    default: () => 0,
  }),
});
type State = typeof MyState.State;
```

### Accessing state type

```typescript
// Use typeof MyState.State for node function signatures
async function myNode(state: typeof MyState.State): Promise<Partial<typeof MyState.State>> {
  return { field: "updated" };
}
```

## Graph Construction

```typescript
const graph = new StateGraph(MyState)
  // Static edges
  .addNode("node_a", nodeAFunction)
  .addNode("node_b", nodeBFunction)
  .addEdge(START, "node_a") // START is "__start__"
  .addEdge("node_a", "node_b")
  .addEdge("node_b", END) // END is "__end__"

  // Conditional edges
  .addConditionalEdges(
    "router_node",
    (state) => state.intent, // returns string key
    {
      billing: "billing_handler",
      tech: "tech_handler",
      default: END, // fallback
    }
  )
  .compile({
    checkpointer: new MemorySaver(), // enable persistence
    recursionLimit: 25, // default is 25, set explicitly
  });
```

## Running the Graph

```typescript
// Single run
const result = await graph.invoke(
  { input: "user query" },
  { configurable: { thread_id: "unique-thread-id" } }
);

// Streaming (preferred for long-running agents)
for await (const chunk of graph.stream(
  { input: "user query" },
  {
    configurable: { thread_id: "thread-123" },
    streamMode: "values", // "values" | "updates" | "debug"
  }
)) {
  console.log(chunk);
}
```

## Human-in-the-Loop

```typescript
import { interrupt } from "@langchain/langgraph";

// In a node: pause and wait for external input
async function approvalNode(state: State) {
  const humanDecision = interrupt({
    question: "Proceed with deletion?",
    context: state.targetRecord,
  });
  // Execution pauses here until graph.invoke() is called again with Command
  if (!humanDecision.approved) throw new Error("User rejected");
  return { approved: true };
}

// Resuming after human responds
await graph.invoke(new Command({ resume: { approved: true } }), {
  configurable: { thread_id: "thread-123" },
});
```

## Multi-Agent: Command and Send

```typescript
import { Command, Send } from "@langchain/langgraph";

// Command: direct routing from a node
function supervisorNode(state: State) {
  return new Command({
    goto: "worker_a", // or array for parallel: ["worker_a", "worker_b"]
    update: { currentTask: "analyze" },
  });
}

// Send: fan-out to parallel nodes with different state
function fanOutNode(state: State) {
  return state.tasks.map((task) => new Send("process_task", { ...state, currentTask: task }));
}
```

## Tool Definition

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const myTool = tool(
  async (input: { param: string }) => {
    try {
      const result = await doSomething(input.param);
      return JSON.stringify(result); // always return string
    } catch (e) {
      return `Error: ${(e as Error).message}`; // return errors, don't throw
    }
  },
  {
    name: "my_tool",
    description:
      "Clear description of what this does and when to use it. Include what NOT to use it for if relevant.",
    schema: z.object({
      param: z.string().describe("What this parameter represents"),
    }),
  }
);
```

## Checkpointing (State Persistence)

```typescript
// In-memory (dev/testing only)
import { MemorySaver } from "@langchain/langgraph";
const checkpointer = new MemorySaver();

// For production: use a persistent checkpointer
// @langchain/langgraph-checkpoint-postgres or custom Convex checkpointer

const graph = new StateGraph(MyState)
  // ...nodes and edges...
  .compile({ checkpointer });

// All runs with same thread_id share state history
const config = { configurable: { thread_id: "user-123-session-456" } };

// Get current state
const state = await graph.getState(config);

// Get state history
for await (const snapshot of graph.getStateHistory(config)) {
  console.log(snapshot.values, snapshot.next);
}
```

## Common Edge Cases

**Parallel branch state merging**: When using `Send` for fan-out, all parallel branches write to the same state. Use reducers (not last-write-wins) for any field written to by multiple parallel nodes.

**`recursionLimit` exceeded**: The graph throws `GraphRecursionError`. Always catch this and log the final state before re-throwing. Default is 25 — for complex agents, increase but never remove the limit.

**Tool call errors in ReAct**: `createReactAgent` with `handleParsingErrors: true` will append malformed tool responses back to context rather than throwing. Enable this for production.

**Thread ID collisions**: Each independent conversation needs a unique thread ID. Using the same thread ID resumes a prior conversation's state, which is sometimes desired (persistence) and sometimes a bug (shared state between users).
