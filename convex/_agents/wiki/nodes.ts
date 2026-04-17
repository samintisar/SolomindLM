"use node";
/**
 * Node functions for WikiGraph.
 *
 * Each node is a standalone function that processes state and returns partial updates.
 * Follows project's map-reduce pattern for parallel chunk processing.
 */

import { END, Send } from "@langchain/langgraph";
import type { OverallStateType, ChunkProcessStateType } from "./state.js";
import type { ConceptExtraction, WikiArticle } from "./prompts.js";
import {
  ConceptExtractionSchema,
  WikiArticleGenerationSchema,
  ConnectionDetectionSchema,
  getConceptExtractionPrompt,
  getArticleGenerationPrompt,
  getConnectionDetectionPrompt,
  CONCEPT_EXTRACTION_SYSTEM_PROMPT,
  ARTICLE_GENERATION_SYSTEM_PROMPT,
  CONNECTION_DETECTION_SYSTEM_PROMPT,
} from "./prompts.js";
import {
  createAgentGraphLogger,
  invokeWithRetry,
  invokeWithTimeout,
  packChunks,
  validateChunks,
} from "../_shared/index.js";
import { WIKI_CONFIG } from "./config.js";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { createLangSmithRunConfig } from "../_shared/langsmith.js";

// #region agent log
function agentDebugLogWiki(payload: Record<string, unknown>) {
  const body = JSON.stringify({ sessionId: "a7291d", timestamp: Date.now(), ...payload });
  console.log("[AGENT_DBG]", body);
  fetch("http://127.0.0.1:7668/ingest/c40b03dc-b194-43e0-8425-638bcd5bfca0", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a7291d" },
    body,
  }).catch(() => {});
}
// #endregion

// ============================================================
// SPLIT PHASE: Prepare chunks for parallel processing
// ============================================================

/**
 * Split node: Prepare chunks for map phase.
 */
export async function splitChunks(state: OverallStateType): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("WikiGraph", "wiki");

  logger.info("Preparing chunks for concept extraction", {
    agent: "WikiGraph",
    phase: "split_chunks",
    chunkCount: state.chunks?.length || 0,
  });

  return {
    status: "mapping",
    mapOutputs: [],
    collapsedConcepts: [],
    finalOutput: [],
    conceptArticles: [],
    connectionArticles: [],
    progress: {
      phase: "split_chunks",
      percentage: 5,
      message: `Preparing ${state.chunks?.length || 0} chunks for processing`,
      totalChunks: state.chunks?.length || 0,
    },
  };
}

// ============================================================
// MAP PHASE: Parallel concept extraction from chunks
// ============================================================

/**
 * Map node: Extract concepts from a single chunk.
 * This runs in parallel across all chunks via Send API.
 */
export async function extractConceptsMap(
  state: ChunkProcessStateType,
  llm: BaseLanguageModel
): Promise<{ mapOutputs: ConceptExtraction[][] }> {
  const { chunk, chunkIndex, documentIds, totalChunks } = state;
  const startTime = Date.now();

  const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : "[Chunk ?]";
  const logger = createAgentGraphLogger("WikiGraph", "wiki");

  logger.phaseStart("extract_concepts_map", {
    agent: "WikiGraph",
    chunkIndex,
    chunkLength: chunk.length,
    chunkPreview: chunk.substring(0, 150).replace(/\n/g, " "),
    documentCount: documentIds.length,
  });

  // #region agent log
  if (chunkIndex === 0) {
    agentDebugLogWiki({
      hypothesisId: "H_map_llm",
      location: "convex/_agents/wiki/nodes.ts:extractConceptsMap",
      message: "first map chunk entering LLM invoke",
      data: { chunkIndex, chunkLength: chunk.length, documentCount: documentIds.length },
    });
  }
  // #endregion

  const structuredLlm = llm.withStructuredOutput!(ConceptExtractionSchema);
  const prompt = getConceptExtractionPrompt({
    content: chunk,
    documentCount: documentIds.length,
    chunkIndex,
    totalChunks: totalChunks && totalChunks > 0 ? totalChunks : undefined,
  });

  logger.info(`Sending concept extraction prompt to LLM (${prompt.length} chars)...`, {
    agent: "WikiGraph",
    phase: "extract_concepts_map",
    chunkId,
    promptLength: prompt.length,
  });

  try {
    const response = await invokeWithRetry(
      () =>
        invokeWithTimeout(
          () =>
            structuredLlm.invoke(
              [new SystemMessage(CONCEPT_EXTRACTION_SYSTEM_PROMPT), new HumanMessage(prompt)],
              createLangSmithRunConfig({
                runName: "WikiGraph.ExtractConcepts",
                tags: ["agent", "wiki", "map"],
                metadata: {
                  chunkIndex,
                  documentCount: documentIds.length,
                },
              }) as unknown as Record<string, unknown>
            ),
          WIKI_CONFIG.MAP_TIMEOUT_MS,
          "WikiConceptExtraction"
        ),
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn(`Concept extraction retry attempt ${attempt}/3`, {
            agent: "WikiGraph",
            phase: "extract_concepts_map",
            chunkIndex,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      },
      "WikiConceptExtraction"
    );

    const concepts = (response as any).concepts || [];
    const elapsed = Date.now() - startTime;

    logger.phaseComplete("extract_concepts_map", {
      agent: "WikiGraph",
      chunkIndex,
      conceptsExtracted: concepts.length,
      processingTimeMs: elapsed,
    });

    return {
      mapOutputs: [concepts],
    };
  } catch (error) {
    const errorToLog = error instanceof Error ? error : new Error(String(error));
    logger.phaseError("extract_concepts_map", errorToLog, {
      agent: "WikiGraph",
      chunkIndex,
      chunkLength: chunk.length,
    });

    const elapsed = Date.now() - startTime;
    logger.phaseComplete("extract_concepts_map", {
      agent: "WikiGraph",
      chunkIndex,
      conceptsExtracted: 0,
      processingTimeMs: elapsed,
    });

    // Return empty concepts array on failure
    return {
      mapOutputs: [[]],
    };
  }
}

// ============================================================
// COLLAPSE PHASE: Merge and deduplicate concepts
// ============================================================

/**
 * Collapse node: Merge concepts from all chunks and deduplicate.
 */
export async function collapseConcepts(
  state: OverallStateType
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("WikiGraph", "wiki");
  logger.phaseStart("collapse_concepts");

  const allConcepts = state.mapOutputs.flat();

  // Simple deduplication by concept name
  const uniqueConcepts = Array.from(
    new Map(allConcepts.map((c) => [c.name.toLowerCase(), c])).values()
  );

  // Sort by importance
  const importanceOrder = { high: 0, medium: 1, low: 2 };
  uniqueConcepts.sort((a, b) => importanceOrder[a.importance] - importanceOrder[b.importance]);

  const maxConcepts = WIKI_CONFIG.MAX_WIKI_CONCEPTS;
  const cappedConcepts =
    maxConcepts > 0 && uniqueConcepts.length > maxConcepts
      ? uniqueConcepts.slice(0, maxConcepts)
      : uniqueConcepts;

  logger.phaseComplete("collapse_concepts", {
    totalConcepts: allConcepts.length,
    uniqueConcepts: uniqueConcepts.length,
    cappedTo: cappedConcepts.length,
  });

  return {
    collapsedConcepts: cappedConcepts,
    progress: {
      phase: "Concept collapse",
      percentage: 30,
      message: `Merged ${allConcepts.length} concepts into ${cappedConcepts.length} unique concepts (cap ${maxConcepts || "off"})`,
      conceptsExtracted: cappedConcepts.length,
    },
  };
}

// ============================================================
// REDUCE PHASE: Synthesize articles from concepts
// ============================================================

function slugifyConceptName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

function buildWikiArticleFromGeneration(
  concept: ConceptExtraction,
  state: OverallStateType,
  gen: { summary: string; relatedConcepts: string[]; content: string }
): WikiArticle {
  const slug = slugifyConceptName(concept.name) || "concept";
  const docIds = (state.documentIds || []).map(String);
  const related = (gen.relatedConcepts || [])
    .map((r) => {
      const t = r.trim().replace(/^\[\[|\]\]$/g, "");
      if (!t) return "";
      if (t.startsWith("concepts/")) return t;
      return `concepts/${slugifyConceptName(t)}`;
    })
    .filter(Boolean);
  const summary = (gen.summary || concept.summary || "").trim().slice(0, 200);
  return {
    path: `concepts/${slug}`,
    type: "concept",
    title: concept.name,
    content: gen.content.trim(),
    frontmatter: {
      slug,
      summary,
      sources: docIds,
      relatedConcepts: related,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/** Markdown table cell: no pipes or newlines */
function indexTableCell(text: string, maxLen: number): string {
  return text.replace(/\|/g, "/").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

/**
 * Build index.md from article metadata — avoids an extra LLM round-trip.
 */
export function buildDeterministicWikiIndex(allArticles: WikiArticle[]): string {
  const iso = new Date().toISOString();
  const day = iso.split("T")[0];
  const rows = allArticles.map((article) => {
    const link = `[[${article.path}]]`;
    const summary = indexTableCell(article.frontmatter.summary || article.title, 120);
    const updated =
      (article.frontmatter.lastUpdated && article.frontmatter.lastUpdated.split("T")[0]) || day;
    return `| ${link} | ${summary} | ${article.type} | ${updated} |`;
  });
  return [
    "# Knowledge Base Index",
    "",
    `Last updated: ${iso}`,
    "",
    "## Articles",
    "",
    "| Article | Summary | Type | Updated |",
    "|---------|---------|------|---------|",
    ...rows,
    "",
    "*Notebook wiki — automated compile.*",
  ].join("\n");
}

async function mapConceptIndicesWithConcurrency(
  conceptIndices: number[],
  concurrency: number,
  fn: (conceptIndex: number) => Promise<WikiArticle | undefined>
): Promise<WikiArticle[]> {
  const results: (WikiArticle | undefined)[] = new Array(conceptIndices.length);
  let nextSlot = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const slot = nextSlot++;
      if (slot >= conceptIndices.length) return;
      const conceptIndex = conceptIndices[slot]!;
      results[slot] = await fn(conceptIndex);
    }
  }

  const n = Math.min(concurrency, Math.max(1, conceptIndices.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results.filter((a): a is WikiArticle => a !== undefined);
}

function buildRelevantContentForConcept(
  state: OverallStateType,
  concept: { name: string; summary: string; description: string }
): string {
  const joined = (state.chunks || []).join("\n\n---\n\n");
  const maxChars = WIKI_CONFIG.MAX_RELEVANT_CONTENT_CHARS;
  let excerpt =
    joined.length > maxChars
      ? `${joined.slice(0, maxChars)}\n\n[…sources truncated for generation…]`
      : joined;
  if (!excerpt.trim()) {
    excerpt = `${concept.summary}\n\n${concept.description}`;
  }
  const needle = concept.name.trim();
  if (needle.length > 2 && joined.includes(needle)) {
    const idx = joined.indexOf(needle);
    const radius = Math.floor(maxChars / 2);
    const start = Math.max(0, idx - radius);
    const end = Math.min(joined.length, idx + radius);
    excerpt = joined.slice(start, end);
    if (start > 0) excerpt = `[…]${excerpt}`;
    if (end < joined.length) excerpt = `${excerpt}[…]`;
  }
  return excerpt.length > maxChars ? excerpt.slice(0, maxChars) : excerpt;
}

/**
 * Generate concept articles for indices [startInclusive, endExclusive).
 * Used by batched Convex actions to stay under the 600s action limit.
 */
export async function synthesizeArticlesForIndices(
  state: OverallStateType,
  llm: BaseLanguageModel,
  startInclusive: number,
  endExclusive: number
): Promise<WikiArticle[]> {
  const logger = createAgentGraphLogger("WikiGraph", "wiki");
  const concepts = state.collapsedConcepts || [];
  const end = Math.min(endExclusive, concepts.length);
  const start = Math.max(0, startInclusive);
  const conceptIndices: number[] = [];
  for (let i = start; i < end; i++) conceptIndices.push(i);

  if (conceptIndices.length === 0) return [];

  const structuredLlm = llm.withStructuredOutput!(WikiArticleGenerationSchema);
  const concurrency = WIKI_CONFIG.SYNTHESIZE_CONCURRENCY;

  return mapConceptIndicesWithConcurrency(conceptIndices, concurrency, async (i) => {
    const concept = concepts[i]!;
    const startTime = Date.now();

    logger.info(`Generating article for concept: ${concept.name}`, {
      agent: "WikiGraph",
      phase: "synthesize_articles",
      conceptIndex: i,
      totalConcepts: concepts.length,
    });

    try {
      const relevantContent = buildRelevantContentForConcept(state, concept);
      const prompt = getArticleGenerationPrompt({
        concept,
        relevantContent,
        sources: state.documentIds,
      });

      const result = await invokeWithRetry(
        () =>
          invokeWithTimeout(
            () =>
              structuredLlm.invoke(
                [new SystemMessage(ARTICLE_GENERATION_SYSTEM_PROMPT), new HumanMessage(prompt)],
                createLangSmithRunConfig({
                  runName: "WikiGraph.GenerateArticle",
                  tags: ["agent", "wiki", "reduce"],
                  metadata: {
                    conceptName: concept.name,
                    conceptIndex: i,
                  },
                }) as unknown as Record<string, unknown>
              ),
            WIKI_CONFIG.REDUCE_TIMEOUT_MS,
            "WikiArticleGeneration"
          ),
        {
          maxAttempts: 2,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            logger.warn(`Article generation retry attempt ${attempt}/2`, {
              agent: "WikiGraph",
              phase: "synthesize_articles",
              conceptName: concept.name,
              attempt,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        },
        "WikiArticleGeneration"
      );

      const article = buildWikiArticleFromGeneration(
        concept,
        state,
        result as { summary: string; relatedConcepts: string[]; content: string }
      );

      logger.info(`Article generated for ${concept.name} in ${Date.now() - startTime}ms`, {
        agent: "WikiGraph",
        phase: "synthesize_articles",
        conceptName: concept.name,
        elapsed: Date.now() - startTime,
      });

      return article;
    } catch (error) {
      const errorToLog = error instanceof Error ? error : new Error(String(error));
      logger.phaseError("synthesize_articles", errorToLog, {
        agent: "WikiGraph",
        phase: "synthesize_articles",
        conceptName: concept.name,
      });
      return undefined;
    }
  });
}

/**
 * Reduce node: Generate wiki articles from collapsed concepts.
 */
export async function synthesizeArticles(
  state: OverallStateType,
  llm: BaseLanguageModel
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("WikiGraph", "wiki");
  logger.phaseStart("synthesize_articles");

  const concepts = state.collapsedConcepts || [];
  const articles = await synthesizeArticlesForIndices(state, llm, 0, concepts.length);

  logger.phaseComplete("synthesize_articles", {
    conceptsProcessed: concepts.length,
    articlesGenerated: articles.length,
  });

  return {
    conceptArticles: articles,
    progress: {
      phase: "Article synthesis",
      percentage: 60,
      message: `Generated ${articles.length} concept articles`,
      articlesGenerated: articles.length,
    },
  };
}

// ============================================================
// CONNECTION DETECTION: Find relationships between concepts
// ============================================================

/**
 * Connection detection node: Identify and document relationships between concepts.
 */
export async function detectConnections(
  state: OverallStateType,
  llm: BaseLanguageModel,
  conceptArticles: WikiArticle[]
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("WikiGraph", "wiki");
  logger.phaseStart("detect_connections");

  const concepts = state.collapsedConcepts || [];

  if (conceptArticles.length < 2) {
    logger.phaseComplete("detect_connections", {
      connectionsDetected: 0,
      skipped: true,
    });
    return {
      connectionArticles: [],
      finalOutput: conceptArticles,
      progress: {
        phase: "Connection detection",
        percentage: 80,
        message: "Skipped connection detection (<2 articles)",
        articlesGenerated: conceptArticles.length,
      },
    };
  }

  // Build articles context for connection detection
  const articlesContext = conceptArticles
    .map((article) => `## ${article.title}\n\n${article.content}`)
    .join("\n\n---\n\n");

  const prompt = getConnectionDetectionPrompt({
    concepts,
    articles: articlesContext,
  });

  try {
    const structuredLlm = llm.withStructuredOutput!(ConnectionDetectionSchema);
    const result = await invokeWithRetry(
      () =>
        invokeWithTimeout(
          () =>
            structuredLlm.invoke(
              [new SystemMessage(CONNECTION_DETECTION_SYSTEM_PROMPT), new HumanMessage(prompt)],
              createLangSmithRunConfig({
                runName: "WikiGraph.DetectConnections",
                tags: ["agent", "wiki", "connections"],
                metadata: {
                  conceptCount: concepts.length,
                },
              }) as unknown as Record<string, unknown>
            ),
          WIKI_CONFIG.REDUCE_TIMEOUT_MS,
          "WikiConnectionDetection"
        ),
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
      },
      "WikiConnectionDetection"
    );

    // Convert connections to articles
    const connectionArticles: WikiArticle[] = (result as any).connections.map((conn: any) => ({
      path: conn.path,
      type: "connection" as const,
      title: conn.title,
      content: `# ${conn.title}\n\n${conn.relationship}`,
      frontmatter: {
        slug: conn.path.split("/").pop() || conn.path,
        summary: conn.relationship.substring(0, 200),
        sources: state.documentIds,
        relatedConcepts: conn.concepts,
        lastUpdated: new Date().toISOString(),
      },
    }));

    logger.phaseComplete("detect_connections", {
      connectionsDetected: connectionArticles.length,
    });

    // Merge concept and connection articles
    const allArticles = [...conceptArticles, ...connectionArticles];

    return {
      connectionArticles,
      finalOutput: allArticles,
      progress: {
        phase: "Connection detection",
        percentage: 80,
        message: `Detected ${connectionArticles.length} concept connections`,
        articlesGenerated: allArticles.length,
      },
    };
  } catch (error) {
    const errorToLog = error instanceof Error ? error : new Error(String(error));
    logger.phaseError("detect_connections", errorToLog);

    // Don't fail entire wiki if connection detection fails
    return {
      connectionArticles: [],
      finalOutput: conceptArticles,
      progress: {
        phase: "Connection detection",
        percentage: 80,
        message: "Connection detection completed with errors",
        articlesGenerated: conceptArticles.length,
      },
    };
  }
}

// ============================================================
// FINAL COMPILE: Generate index and log
// ============================================================

/**
 * Final compile node: Generate index and log content.
 */
export async function compileFinal(
  state: OverallStateType,
  allArticles: WikiArticle[]
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("WikiGraph", "wiki");
  logger.phaseStart("compile_final");

  const indexContent = buildDeterministicWikiIndex(allArticles);

  // Generate log content
  const timestamp = new Date().toISOString();
  const logContent = `## [${timestamp}] Wiki Compilation\n\n- Sources: ${state.documentIds.length} documents\n- Concepts: ${state.collapsedConcepts?.length || 0}\n- Articles: ${allArticles.length}\n`;

  logger.phaseComplete("compile_final", {
    totalArticles: allArticles.length,
  });

  return {
    indexContent,
    logContent,
    status: "completed",
    progress: {
      phase: "Complete",
      percentage: 100,
      message: `Wiki compiled with ${allArticles.length} articles`,
      articlesGenerated: allArticles.length,
    },
  };
}

// ============================================================
// ROUTING: Split chunks for parallel processing
// ============================================================

/**
 * Route function for Send API - splits chunks for parallel concept extraction.
 * Returns either Send[] for parallel processing or a string to skip to collapse.
 */
export function routeToMap(state: OverallStateType): any {
  // If no chunks or only one chunk, skip map phase and go directly to collapse
  if (!state.chunks || state.chunks.length === 0) {
    // #region agent log
    agentDebugLogWiki({
      hypothesisId: "H_route_empty",
      location: "convex/_agents/wiki/nodes.ts:routeToMap",
      message: "routing with zero chunks → pathMap key collapse",
      data: { returnValue: "collapse" },
    });
    // #endregion
    return "collapse";
  }

  const validated = validateChunks(state.chunks, {
    targetSize: WIKI_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    agentName: "WikiGraph",
  });

  const packedChunks = packChunks(validated, {
    targetSize: WIKI_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    agentName: "WikiGraph",
  });

  if (packedChunks.length === 0) {
    // #region agent log
    agentDebugLogWiki({
      hypothesisId: "H_route_pack_empty",
      location: "convex/_agents/wiki/nodes.ts:routeToMap",
      message: "no chunks after validate/pack → collapse",
      data: { rawCount: state.chunks.length },
    });
    // #endregion
    return "collapse";
  }

  // #region agent log
  agentDebugLogWiki({
    hypothesisId: "H_route_map",
    location: "convex/_agents/wiki/nodes.ts:routeToMap",
    message: "routing to parallel map (packed)",
    data: {
      rawChunkCount: state.chunks.length,
      packedCount: packedChunks.length,
      targetTokens: WIKI_CONFIG.MAP_CHUNK_SIZE_TOKENS,
    },
  });
  // #endregion

  return packedChunks.map(
    (chunk, i) =>
      new Send("extract_concepts_map", {
        chunk,
        chunkIndex: i,
        totalChunks: packedChunks.length,
        documentIds: state.documentIds,
        wikiId: state.wikiId,
        notebookId: state.notebookId,
        userId: state.userId,
      })
  );
}
