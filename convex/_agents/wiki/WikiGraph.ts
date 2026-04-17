"use node";
/**
 * WikiGraph - Main graph class for wiki knowledge base compilation.
 *
 * Follows project's map-reduce pattern for parallel chunk processing.
 * Uses shared utilities from _shared/ for consistency.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { WIKI_CONFIG } from "./config.js";
import { createLLMs } from "../_shared/llm_factory.js";
import { createAgentGraphLogger } from "../_shared/logging.js";
import { isLangSmithEnabled, createJobLangSmithConfig } from "../_shared/langsmith.js";
import { AGENT_LANGGRAPH_RECURSION_LIMIT } from "../_shared/agent_graph_limits.js";
import { env } from "../../_lib/env.js";
import type { OverallStateType } from "./state.js";
import type { WikiArticle } from "./prompts.js";
import {
  extractConceptsMap,
  collapseConcepts,
  synthesizeArticles,
  synthesizeArticlesForIndices,
  detectConnections,
  compileFinal,
  routeToMap,
  splitChunks,
} from "./nodes.js";
import { OverallState } from "./state.js";

export class WikiGraph {
  private fastLlm: ReturnType<typeof createLLMs>["fastLlm"];
  private smartLlm: ReturnType<typeof createLLMs>["smartLlm"];

  constructor() {
    // Use shared LLM factory for consistency
    const llms = createLLMs({
      apiKey: env.TOGETHER_AI_API_KEY,
      mapModel: env.FAST_LLM,
      reduceModel: env.SMART_LLM,
      temperatures: { map: 0.3, reduce: 0.6 },
      maxTokens: { map: 8000, reduce: WIKI_CONFIG.REDUCE_MAX_TOKENS },
    });

    this.fastLlm = llms.fastLlm;
    this.smartLlm = llms.smartLlm;
  }

  /**
   * Build the wiki compilation graph using shared utilities.
   * Uses map-reduce pattern with parallel chunk processing.
   */
  buildGraph() {
    const logger = createAgentGraphLogger("WikiGraph", "wiki");

    // Build custom graph with linear flow after map-reduce
    const builder = new StateGraph(OverallState);

    // Split phase: prepare chunks
    builder.addNode("split_chunks", async (state: any) => {
      return await splitChunks(state);
    });

    // Map phase: parallel concept extraction from chunks
    builder.addNode("extract_concepts_map", async (state: any) => {
      return await extractConceptsMap(state, this.fastLlm);
    });

    // Collapse phase: merge and deduplicate concepts
    builder.addNode("collapse_concepts", async (state: any) => {
      return await collapseConcepts(state);
    });

    // Reduce phase: synthesize articles, detect connections, compile
    builder.addNode("reduce_phase", async (state: any) => {
      return await this.runReducePhase(state);
    });

    // Edges: START → split_chunks → routeToMap → extract_concepts_map ×N → collapse_concepts → reduce_phase → END
    builder.addEdge(START, "split_chunks" as never);
    builder.addConditionalEdges(
      "split_chunks" as never,
      routeToMap as any,
      { extract_concepts_map: "extract_concepts_map", collapse: "collapse_concepts" } as any
    );
    builder.addEdge("extract_concepts_map" as never, "collapse_concepts" as never);
    builder.addEdge("collapse_concepts" as never, "reduce_phase" as never);
    builder.addEdge("reduce_phase" as never, END as never);

    const graph = builder.compile().withConfig({
      recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT,
    });

    logger.info("Wiki graph built successfully", {
      agent: "WikiGraph",
      phases: ["map", "collapse", "reduce"],
    });

    return graph;
  }

  /**
   * Graph that stops after concept collapse (map + merge). Used with batched reduce actions.
   */
  buildMapCollapseGraph() {
    const logger = createAgentGraphLogger("WikiGraph", "wiki");
    const builder = new StateGraph(OverallState);

    builder.addNode("split_chunks", async (state: any) => {
      return await splitChunks(state);
    });
    builder.addNode("extract_concepts_map", async (state: any) => {
      return await extractConceptsMap(state, this.fastLlm);
    });
    builder.addNode("collapse_concepts", async (state: any) => {
      return await collapseConcepts(state);
    });

    builder.addEdge(START, "split_chunks" as never);
    builder.addConditionalEdges(
      "split_chunks" as never,
      routeToMap as any,
      { extract_concepts_map: "extract_concepts_map", collapse: "collapse_concepts" } as any
    );
    builder.addEdge("extract_concepts_map" as never, "collapse_concepts" as never);
    builder.addEdge("collapse_concepts" as never, END as never);

    const graph = builder.compile().withConfig({
      recursionLimit: AGENT_LANGGRAPH_RECURSION_LIMIT,
    });

    logger.info("Wiki map+collapse graph built", { agent: "WikiGraph" });
    return graph;
  }

  /**
   * Run map → collapse only (no per-concept LLM reduce).
   */
  async runMapAndCollapse(input: {
    documentIds: string[];
    chunks: string[];
    wikiId: string;
    notebookId: string;
    userId: string;
  }): Promise<OverallStateType> {
    const graph = this.buildMapCollapseGraph();
    const langSmithConfig = isLangSmithEnabled()
      ? createJobLangSmithConfig("wiki", input.wikiId, {
          notebookId: input.notebookId,
          userId: input.userId,
        })
      : {};

    return (await graph.invoke(
      {
        documentIds: input.documentIds,
        chunks: input.chunks,
        wikiId: input.wikiId,
        notebookId: input.notebookId,
        userId: input.userId,
      },
      langSmithConfig
    )) as OverallStateType;
  }

  /**
   * Synthesize wiki articles for concepts in [start, end).
   */
  async synthesizeConceptRange(
    state: OverallStateType,
    startInclusive: number,
    endExclusive: number
  ) {
    return synthesizeArticlesForIndices(state, this.smartLlm, startInclusive, endExclusive);
  }

  /**
   * Connection detection + index + log (`state.conceptArticles` must be complete).
   */
  async runFinalizeAfterSynthesis(state: OverallStateType): Promise<{
    finalOutput: WikiArticle[];
    indexContent: string;
    logContent: string;
    progress: Awaited<ReturnType<typeof compileFinal>>["progress"];
  }> {
    const merged = await this.runConnectionsAndCompile(state, state.conceptArticles || []);
    return {
      finalOutput: (merged.finalOutput || []) as WikiArticle[],
      indexContent: (merged.indexContent || "") as string,
      logContent: (merged.logContent || "") as string,
      progress: merged.progress!,
    };
  }

  private async runConnectionsAndCompile(
    state: OverallStateType,
    conceptArticles: WikiArticle[]
  ): Promise<Partial<OverallStateType>> {
    const logger = createAgentGraphLogger("WikiGraph", "wiki");

    logger.info("Starting connection detection", {
      agent: "WikiGraph",
      phase: "reduce",
      step: "detect_connections",
    });

    const connectionResult = await detectConnections(state, this.smartLlm, conceptArticles);
    const allArticles = connectionResult.finalOutput || [];

    logger.info("Starting final compilation", {
      agent: "WikiGraph",
      phase: "reduce",
      step: "compile",
    });

    const finalResult = await compileFinal(state, allArticles);

    logger.info("Reduce phase complete", {
      agent: "WikiGraph",
      phase: "reduce",
      articlesGenerated: finalResult.finalOutput?.length || 0,
    });

    return {
      ...connectionResult,
      ...finalResult,
    };
  }

  /**
   * Reduce phase: Orchestrates article synthesis, connection detection, and final compilation.
   * This runs sequentially after collapse phase.
   */
  private async runReducePhase(state: OverallStateType): Promise<Partial<OverallStateType>> {
    const logger = createAgentGraphLogger("WikiGraph", "wiki");

    logger.info("Starting article synthesis", {
      agent: "WikiGraph",
      phase: "reduce",
      step: "synthesize",
    });

    const synthesizeResult = await synthesizeArticles(state, this.smartLlm);
    const conceptArticles = synthesizeResult.conceptArticles || [];

    const tail = await this.runConnectionsAndCompile(state, conceptArticles);

    return {
      ...synthesizeResult,
      ...tail,
    };
  }

  /**
   * Run the wiki compilation graph.
   */
  async runGraph(input: {
    documentIds: string[];
    chunks: string[];
    wikiId: string;
    notebookId: string;
    userId: string;
  }): Promise<{
    finalOutput: WikiArticle[];
    indexContent: string;
    logContent: string;
    progress: Awaited<ReturnType<typeof compileFinal>>["progress"];
  }> {
    const logger = createAgentGraphLogger("WikiGraph", "wiki");

    logger.info("Starting wiki compilation", {
      agent: "WikiGraph",
      wikiId: input.wikiId,
      notebookId: input.notebookId,
      userId: input.userId,
      documentCount: input.documentIds.length,
      chunkCount: input.chunks.length,
    });

    const graph = this.buildGraph();

    const langSmithConfig = isLangSmithEnabled()
      ? createJobLangSmithConfig("wiki", input.wikiId, {
          notebookId: input.notebookId,
          userId: input.userId,
        })
      : {};

    const result = await graph.invoke(
      {
        documentIds: input.documentIds,
        chunks: input.chunks,
        wikiId: input.wikiId,
        notebookId: input.notebookId,
        userId: input.userId,
      },
      langSmithConfig
    );

    logger.info("Wiki compilation complete", {
      agent: "WikiGraph",
      wikiId: input.wikiId,
      articlesGenerated: result.finalOutput?.length || 0,
      status: result.status,
    });

    return {
      finalOutput: result.finalOutput,
      indexContent: result.indexContent,
      logContent: result.logContent,
      progress: result.progress,
    };
  }
}
