"use node";

/**
 * Graph builder for agent operations.
 *
 * Provides factory functions for building standard graph patterns used across
 * all graph-based agents.
 *
 * This eliminates boilerplate code for common graph patterns like:
 * - MapReduce graphs with parallel processing
 * - Linear graphs with sequential processing
 * - Conditional routing between nodes
 */

import type { Send } from "@langchain/langgraph";
import { END, START, StateGraph } from "@langchain/langgraph";

import { AGENT_LANGGRAPH_RECURSION_LIMIT } from "./agent_graph_limits.js";

// ============================================================
// Types
// ============================================================

/**
 * Node function type for state graphs.
 * Compatible with LangGraph's NodeAction signature.
 */
export type NodeFunction<TState = unknown> = (
  state: TState,
  config?: { configurable?: Record<string, unknown> }
) => Promise<Partial<TState>>;

/**
 * Route function type for conditional edges.
 * Returns either a string (node name) or an array of Send objects for parallel processing.
 */
export type RouteFunction<TState = unknown> = (state: TState) => string | Send[] | Send[];

/**
 * Configuration for building a MapReduce-style graph.
 */
export interface MapReduceGraphConfig<TState = Record<string, unknown>> {
  /** State annotation for the graph */
  state: Record<string, unknown>;
  /** Map node - processes chunks in parallel */
  mapNode: NodeFunction<unknown>;
  /** Reduce node - synthesizes map outputs */
  reduceNode?: NodeFunction<TState>;
  /** Collapse node - recursively collapses outputs before reduce */
  collapseNode?: NodeFunction<TState>;
  /** Route function that creates Send objects for parallel map tasks */
  routeToMap?: RouteFunction<TState>;
  /** Custom node name for map phase (default: 'map') */
  mapNodeName?: string;
  /** Custom node name for reduce phase (default: 'reduce') */
  reduceNodeName?: string;
  /** Custom node name for collapse phase (default: 'collapse') */
  collapseNodeName?: string;
  /** Whether to skip collapse phase (default: false) */
  skipCollapse?: boolean;
}

/**
 * Configuration for building a linear sequential graph.
 */
export interface LinearGraphConfig<TState = Record<string, unknown>> {
  /** State annotation for the graph */
  state: Record<string, unknown>;
  /** Ordered list of nodes to execute sequentially */
  nodes: Array<{
    name: string;
    handler: NodeFunction<TState>;
  }>;
}

// ============================================================
// Factory Functions
// ============================================================

/**
 * Builds a standard MapReduce-style graph with parallel map processing.
 *
 * Graph structure:
 * - START -> routeToMap (conditional) -> map (parallel) -> collapse (optional) -> reduce -> END
 *
 * @param config - Graph configuration
 * @returns A compiled StateGraph ready to invoke
 *
 * @example
 * ```typescript
 * const graph = buildMapReduceGraph({
 *   state: OverallState,
 *   mapNode: mapNodeFunction,
 *   reduceNode: reduceNodeFunction,
 *   collapseNode: collapseNodeFunction,
 *   routeToMap: routeToMapFunction,
 * });
 *
 * const result = await graph.invoke(initialState);
 * ```
 */
export function buildMapReduceGraph<TState extends Record<string, unknown>>(
  config: MapReduceGraphConfig<TState>
) {
  const builder = new StateGraph(config.state as never);

  const mapNodeName = config.mapNodeName || "map";
  const reduceNodeName = config.reduceNodeName || "reduce";
  const collapseNodeName = config.collapseNodeName || "collapse";

  // Add map node - wrap to match LangGraph's expected signature
  builder.addNode(mapNodeName, (async (
    state: unknown,
    invocationConfig?: { configurable?: Record<string, unknown> }
  ) => {
    return await config.mapNode(state, invocationConfig);
  }) as never);

  // Add collapse node if provided and not skipping
  if (config.collapseNode && !config.skipCollapse) {
    builder.addNode(collapseNodeName, (async (
      state: TState,
      invocationConfig?: { configurable?: Record<string, unknown> }
    ) => {
      return await config.collapseNode!(state, invocationConfig);
    }) as never);
  }

  // Add reduce node if provided
  if (config.reduceNode) {
    builder.addNode(reduceNodeName, (async (
      state: TState,
      invocationConfig?: { configurable?: Record<string, unknown> }
    ) => {
      return await config.reduceNode!(state, invocationConfig);
    }) as never);
  }

  // Add edges - use as never casts for node names like existing code
  if (config.routeToMap) {
    builder.addConditionalEdges(START, config.routeToMap as never);
  } else {
    builder.addEdge(START, mapNodeName as never);
  }

  if (config.collapseNode && !config.skipCollapse) {
    builder.addEdge(mapNodeName as never, collapseNodeName as never);

    // collapse -> reduce (or END if no reduce)
    if (config.reduceNode) {
      builder.addEdge(collapseNodeName as never, reduceNodeName as never);
      builder.addEdge(reduceNodeName as never, END as never);
    } else {
      builder.addEdge(collapseNodeName as never, END as never);
    }
  } else {
    // map -> reduce (or END if no reduce)
    if (config.reduceNode) {
      builder.addEdge(mapNodeName as never, reduceNodeName as never);
      builder.addEdge(reduceNodeName as never, END as never);
    } else {
      builder.addEdge(mapNodeName as never, END as never);
    }
  }

  return builder.compile().withConfig({ recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT });
}

/**
 * Builds a linear sequential graph.
 *
 * Graph structure:
 * - START -> node1 -> node2 -> ... -> nodeN -> END
 *
 * @param config - Graph configuration
 * @returns A compiled StateGraph ready to invoke
 *
 * @example
 * ```typescript
 * const graph = buildLinearGraph({
 *   state: OverallState,
 *   nodes: [
 *     { name: 'step1', handler: step1Function },
 *     { name: 'step2', handler: step2Function },
 *     { name: 'step3', handler: step3Function },
 *   ],
 * });
 *
 * const result = await graph.invoke(initialState);
 * ```
 */
export function buildLinearGraph<TState extends Record<string, unknown>>(
  config: LinearGraphConfig<TState>
) {
  const builder = new StateGraph(config.state as never);

  // Add all nodes - wrap to match LangGraph's expected signature
  for (const node of config.nodes) {
    builder.addNode(node.name, (async (
      state: TState,
      invocationConfig?: { configurable?: Record<string, unknown> }
    ) => {
      return await node.handler(state, invocationConfig);
    }) as never);
  }

  // Add edges sequentially - use as never casts for node names like existing code
  if (config.nodes.length > 0) {
    builder.addEdge(START, config.nodes[0].name as never);

    for (let i = 0; i < config.nodes.length - 1; i++) {
      builder.addEdge(config.nodes[i].name as never, config.nodes[i + 1].name as never);
    }

    builder.addEdge(config.nodes[config.nodes.length - 1].name as never, END as never);
  }

  return builder.compile().withConfig({ recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT });
}

/**
 * Builds a custom graph with explicit edge configuration.
 *
 * Use this for complex graph structures that don't fit the MapReduce or Linear patterns.
 *
 * @param state - State annotation for the graph
 * @param nodes - Record of node functions keyed by node name
 * @param edges - Array of edge definitions
 * @returns A compiled StateGraph ready to invoke
 *
 * @example
 * ```typescript
 * const graph = buildCustomGraph(
 *   OverallState,
 *   {
 *     step1: step1Function,
 *     step2: step2Function,
 *     step3: step3Function,
 *   },
 *   [
 *     [START, 'step1'],
 *     ['step1', 'step2'],
 *     ['step2', (state) => state.skipStep3 ? END : 'step3'],
 *     ['step3', END],
 *   ]
 * );
 * ```
 */
export function buildCustomGraph<_TState extends Record<string, unknown>>(
  state: Record<string, unknown>,
  nodes: Record<string, NodeFunction<unknown>>,
  edges: Array<[string, string | RouteFunction<unknown>]>
) {
  const builder = new StateGraph(state as never);

  // Add all nodes - wrap to match LangGraph's expected signature
  for (const [name, handler] of Object.entries(nodes)) {
    builder.addNode(name, (async (
      state: unknown,
      invocationConfig?: { configurable?: Record<string, unknown> }
    ) => {
      return await handler(state, invocationConfig);
    }) as never);
  }

  // Add all edges - use as never casts for node names like existing code
  for (const [from, to] of edges) {
    if (typeof to === "function") {
      builder.addConditionalEdges(from as never, to);
    } else {
      builder.addEdge(from as never, to as never);
    }
  }

  return builder.compile().withConfig({ recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT });
}

/**
 * Creates a conditional edge function that routes based on state conditions.
 *
 * @param conditions - Record of condition functions that return true/false
 * @param defaultRoute - Default route if no conditions match
 * @returns A conditional edge function
 *
 * @example
 * ```typescript
 * const routeCondition = createConditionalRoute(
 *   {
 *     hasErrors: (state) => state.errors.length > 0,
 *     needsRetry: (state) => state.retryCount < 3,
 *   },
 *   'success' // default route
 * );
 *
 * builder.addConditionalEdges('process', routeCondition, {
 *   hasErrors: 'error_handler',
 *   needsRetry: 'retry',
 *   success: 'complete',
 * });
 * ```
 */
export function createConditionalRoute<TState = any>(
  conditions: Record<string, (state: TState) => boolean>,
  defaultRoute: string = END
): (state: TState) => string {
  return (state: TState) => {
    for (const [name, condition] of Object.entries(conditions)) {
      if (condition(state)) {
        return name;
      }
    }
    return defaultRoute;
  };
}

/**
 * Creates a simple pass-through node that adds progress updates.
 *
 * @param progress - Progress info to add to state
 * @returns A node function
 *
 * @example
 * ```typescript
 * const updateProgressNode = createProgressNode({
 *   phase: 'initializing',
 *   percentage: 10,
 *   message: 'Starting...',
 * });
 *
 * builder.addNode('init', updateProgressNode);
 * ```
 */
export function createProgressNode<TState extends { progress?: any }>(progress: {
  phase: string;
  percentage: number;
  message: string;
}): NodeFunction<TState> {
  return async (state: TState): Promise<Partial<TState>> => {
    return {
      progress: {
        ...state.progress,
        ...progress,
      },
    } as Partial<TState>;
  };
}
