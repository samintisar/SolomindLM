"use node";
/**
 * Wiki compilation jobs - Multi-phase internal actions for wiki generation.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { WikiGraph } from "../../_agents/wiki/WikiGraph";
import { WIKI_CONFIG } from "../../_agents/wiki/config";
import type { OverallStateType } from "../../_agents/wiki/state";
import type { WikiArticle, ConceptExtraction } from "../../_agents/wiki/prompts";
import { WikiArticleGenerationSchema } from "../../_agents/wiki/prompts";
import {
  ARTICLE_GENERATION_SYSTEM_PROMPT,
  getArticleGenerationPrompt,
} from "../../_agents/wiki/prompts";
import { createLLMs } from "../../_agents/_shared/llm_factory.js";
import { invokeWithRetry, invokeWithTimeout } from "../../_agents/_shared/index.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { createLangSmithRunConfig } from "../../_agents/_shared/langsmith.js";
import { env } from "../../_lib/env.js";

const CHECKPOINT_V = 1 as const;

function metadataWithCheckpoint(
  wiki: { metadata?: unknown } | null,
  checkpoint: Record<string, unknown> | null
) {
  const prev =
    wiki?.metadata && typeof wiki.metadata === "object" && !Array.isArray(wiki.metadata)
      ? { ...(wiki.metadata as Record<string, unknown>) }
      : {};
  if (checkpoint === null) {
    delete prev.generationCheckpoint;
  } else {
    prev.generationCheckpoint = checkpoint;
  }
  return prev;
}

function checkpointBaseState(
  cp: Record<string, unknown>,
  args: { wikiId: string; notebookId: string; userId: string }
): OverallStateType {
  const excerpt = typeof cp.sourceExcerpt === "string" ? cp.sourceExcerpt : "";
  return {
    documentIds: cp.documentIds as string[],
    collapsedConcepts: (cp.collapsedConcepts || []) as OverallStateType["collapsedConcepts"],
    chunks: excerpt ? [excerpt] : [],
    wikiId: args.wikiId,
    notebookId: args.notebookId,
    userId: args.userId,
    conceptArticles: (cp.conceptArticles || []) as WikiArticle[],
    mapOutputs: [],
    finalOutput: [],
    connectionArticles: [],
    indexContent: "",
    logContent: "",
    status: "mapping",
    progress: { phase: "synthesize_batch", percentage: 55, message: "Synthesizing articles" },
  } as OverallStateType;
}

// #region agent log
function agentDebugLog(payload: Record<string, unknown>) {
  const body = JSON.stringify({ sessionId: "a7291d", timestamp: Date.now(), ...payload });
  console.log("[AGENT_DBG]", body);
  fetch("http://127.0.0.1:7668/ingest/c40b03dc-b194-43e0-8425-638bcd5bfca0", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a7291d" },
    body,
  }).catch(() => {});
}
function serializeErr(e: unknown) {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack?.slice(0, 800) };
  }
  return { raw: String(e) };
}
// #endregion

async function isWikiRunActive(ctx: any, wikiId: any, runId: number): Promise<boolean> {
  const wiki = await ctx.runQuery(internal.studio.wiki.index.getInternal, { wikiId });
  return Boolean(wiki && wiki.status === "generating" && (wiki.generationRunId ?? 0) === runId);
}

// ============================================================
// WIKI GENERATION JOB
// ============================================================

/**
 * Main wiki generation job - schedules compilation and stores results
 */
export const regenerateWiki = internalAction({
  args: {
    wikiId: v.id("wikis"),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    runId: v.number(),
  },
  handler: async (ctx: any, args: any) => {
    const { wikiId, notebookId, userId, runId } = args;

    try {
      if (!(await isWikiRunActive(ctx, wikiId, runId))) {
        return { wikiId, skipped: true as const };
      }

      // Actions have no ctx.db — load documents via internal query (auth-checked).
      const documents = await ctx.runQuery(
        internal.documents.index.listDocumentsForNotebookRefresh,
        { notebookId, userId }
      );

      // #region agent log
      agentDebugLog({
        hypothesisId: "H1-H4",
        location: "convex/studio/wiki/job.ts:entry",
        message: "regenerateWiki after listDocuments",
        data: {
          wikiId,
          notebookId,
          runId,
          documentCount: documents.length,
          completedCount: documents.filter((d: any) => d.status === "completed").length,
        },
      });
      // #endregion

      if (documents.length === 0) {
        if (!(await isWikiRunActive(ctx, wikiId, runId))) {
          return { wikiId, skipped: true as const };
        }
        await ctx.runMutation(internal.studio.wiki.index.updateStatusInternal, {
          wikiId,
          status: "completed",
          error: "No documents found in notebook",
        });

        await ctx.runMutation(internal.studio.wiki.index.updateMetadataInternal, {
          wikiId,
          metadata: {
            articleCounts: { total: 0 },
          },
        });

        return {
          wikiId,
          status: "completed",
          articleCounts: { total: 0 },
        };
      }

      // Filter for completed documents only
      const completedDocuments = documents.filter((doc: any) => doc.status === "completed");

      if (completedDocuments.length === 0) {
        if (!(await isWikiRunActive(ctx, wikiId, runId))) {
          return { wikiId, skipped: true as const };
        }
        await ctx.runMutation(internal.studio.wiki.index.updateStatusInternal, {
          wikiId,
          status: "failed",
          error: "No completed documents found to compile",
        });
        return {
          wikiId,
          status: "failed",
          error: "No completed documents found",
        };
      }

      // Extract document content chunks
      const documentIds = completedDocuments.map((doc: any) => doc._id);
      const chunks: string[] = [];

      for (const doc of completedDocuments) {
        // Get document chunks
        const docChunks = await ctx.runQuery(internal.documents.index.listChunksByDocument, {
          documentId: doc._id,
        });

        const chunkTexts = docChunks.map((chunk: any) => chunk.content);
        chunks.push(...chunkTexts);
      }

      if (chunks.length === 0) {
        // Fallback: use document metadata if no chunks
        for (const doc of completedDocuments) {
          if (doc.metadata?.summary) {
            chunks.push(doc.metadata.summary);
          }
        }
      }

      // #region agent log
      const totalChunkChars = chunks.reduce((n: number, c: string) => n + c.length, 0);
      agentDebugLog({
        hypothesisId: "H2-H_route",
        location: "convex/studio/wiki/job.ts:beforeRunGraph",
        message: "chunk stats before WikiGraph.runGraph",
        data: {
          chunkCount: chunks.length,
          totalChunkChars,
          documentIdsCount: documentIds.length,
        },
      });
      // #endregion

      const wikiGraph = new WikiGraph();
      const compilationStartedAt = Date.now();

      const collapsedState = await wikiGraph.runMapAndCollapse({
        documentIds,
        chunks,
        wikiId,
        notebookId,
        userId,
      });

      const concepts = collapsedState.collapsedConcepts || [];

      if (concepts.length === 0) {
        if (!(await isWikiRunActive(ctx, wikiId, runId))) {
          return { wikiId, skipped: true as const };
        }
        await ctx.runMutation(internal.studio.wiki.index.updateStatusInternal, {
          wikiId,
          status: "completed",
          error: "No concepts extracted from sources",
        });
        await ctx.runMutation(internal.studio.wiki.index.updateMetadataInternal, {
          wikiId,
          metadata: { articleCounts: { total: 0 } },
        });
        return { wikiId, status: "completed", articleCounts: { total: 0 } };
      }

      const wikiRow = await ctx.runQuery(internal.studio.wiki.index.getInternal, { wikiId });
      const sourceExcerpt = chunks
        .join("\n\n---\n\n")
        .slice(0, WIKI_CONFIG.MAX_RELEVANT_CONTENT_CHARS);

      const checkpoint = {
        v: CHECKPOINT_V,
        documentIds,
        collapsedConcepts: concepts,
        conceptArticles: [] as WikiArticle[],
        nextIndex: 0,
        sourceExcerpt,
        compilationStartedAt,
      };

      await ctx.runMutation(internal.studio.wiki.index.updateMetadataInternal, {
        wikiId,
        metadata: metadataWithCheckpoint(wikiRow, checkpoint as Record<string, unknown>),
      });

      await ctx.scheduler.runAfter(0, internal.studio.wiki.job.regenerateWikiSynthesizeBatch, {
        wikiId,
        notebookId,
        userId,
        runId,
      });

      // #region agent log
      agentDebugLog({
        hypothesisId: "batch_schedule",
        location: "convex/studio/wiki/job.ts:afterMapCollapse",
        message: "scheduled batched synthesis",
        data: {
          wikiId,
          runId,
          conceptCount: concepts.length,
          batchSize: WIKI_CONFIG.SYNTHESIZE_BATCH_SIZE,
        },
      });
      // #endregion

      return {
        wikiId,
        status: "generating",
        phase: "batched_synthesis_scheduled",
        conceptCount: concepts.length,
      };
    } catch (error) {
      // #region agent log
      agentDebugLog({
        hypothesisId: "H_together_vs_route",
        location: "convex/studio/wiki/job.ts:catch",
        message: "regenerateWiki caught error",
        data: { wikiId, runId, err: serializeErr(error) },
      });
      // #endregion
      if (!(await isWikiRunActive(ctx, wikiId, runId))) {
        return { wikiId, skipped: true as const };
      }
      await ctx.runMutation(internal.studio.wiki.index.updateStatusInternal, {
        wikiId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  },
});

/**
 * Synthesizes the next slice of concept articles, then either schedules itself or finalizes the wiki.
 * Each invocation stays within Convex action duration limits.
 */
export const regenerateWikiSynthesizeBatch = internalAction({
  args: {
    wikiId: v.id("wikis"),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    runId: v.number(),
  },
  // Explicit return type avoids TS circular inference (handler schedules this same action).
  handler: async (ctx: any, args: any): Promise<Record<string, unknown>> => {
    const { wikiId, notebookId, userId, runId } = args;

    try {
      if (!(await isWikiRunActive(ctx, wikiId, runId))) {
        return { wikiId, skipped: true as const };
      }

      const wiki: Record<string, unknown> | null = (await ctx.runQuery(
        internal.studio.wiki.index.getInternal,
        { wikiId }
      )) as Record<string, unknown> | null;
      const meta =
        wiki?.metadata && typeof wiki.metadata === "object" && !Array.isArray(wiki.metadata)
          ? (wiki.metadata as Record<string, unknown>)
          : null;
      const rawCp: unknown = meta?.generationCheckpoint;
      const cp: Record<string, unknown> | null =
        rawCp && typeof rawCp === "object" && !Array.isArray(rawCp)
          ? (rawCp as Record<string, unknown>)
          : null;

      if (!cp || cp.v !== CHECKPOINT_V || !Array.isArray(cp.collapsedConcepts)) {
        return { wikiId, skipped: true as const, reason: "no_checkpoint" as const };
      }

      const batchSize = WIKI_CONFIG.SYNTHESIZE_BATCH_SIZE;
      const total: number = (cp.collapsedConcepts as unknown[]).length;
      const start = typeof cp.nextIndex === "number" ? cp.nextIndex : 0;
      const end = Math.min(start + batchSize, total);

      const wikiGraph = new WikiGraph();
      const state = checkpointBaseState(cp, { wikiId, notebookId, userId });
      const batchArticles = await wikiGraph.synthesizeConceptRange(state, start, end);

      const prevArticles = Array.isArray(cp.conceptArticles)
        ? (cp.conceptArticles as WikiArticle[])
        : [];
      const nextCp: Record<string, unknown> = {
        ...cp,
        conceptArticles: [...prevArticles, ...batchArticles],
        nextIndex: end,
      };

      if (end < total) {
        await ctx.runMutation(internal.studio.wiki.index.updateMetadataInternal, {
          wikiId,
          metadata: metadataWithCheckpoint(wiki, nextCp),
        });
        await ctx.scheduler.runAfter(0, internal.studio.wiki.job.regenerateWikiSynthesizeBatch, {
          wikiId,
          notebookId,
          userId,
          runId,
        });
        return { wikiId, phase: "batch_progress" as const, nextIndex: end, total };
      }

      const finalState = checkpointBaseState(nextCp, { wikiId, notebookId, userId });
      finalState.conceptArticles = (nextCp.conceptArticles || []) as WikiArticle[];

      const finalized = await wikiGraph.runFinalizeAfterSynthesis(finalState);
      const compilationDuration = Date.now() - (Number(cp.compilationStartedAt) || Date.now());

      if (!(await isWikiRunActive(ctx, wikiId, runId))) {
        return { wikiId, skipped: true as const };
      }

      await ctx.runMutation(internal.studio.wiki.index.deleteArticlesInternal, { wikiId });

      const docIds = (cp.documentIds || []) as string[];

      for (const article of finalized.finalOutput) {
        await ctx.runMutation(internal.studio.wiki.index.createArticleInternal, {
          wikiId,
          path: article.path,
          type: article.type,
          title: article.title,
          content: article.content,
          sources: article.frontmatter.sources,
          frontmatter: article.frontmatter,
          wordCount: article.content.split(/\s+/).length,
        });
      }

      await ctx.runMutation(internal.studio.wiki.index.createArticleInternal, {
        wikiId,
        path: "index",
        type: "index",
        title: "Knowledge Base Index",
        content: finalized.indexContent,
        sources: docIds,
        frontmatter: {
          slug: "index",
          summary: "Table of contents for the knowledge base",
          sources: docIds,
          relatedConcepts: [],
          lastUpdated: new Date().toISOString(),
        },
      });

      await ctx.runMutation(internal.studio.wiki.index.createArticleInternal, {
        wikiId,
        path: "log",
        type: "log",
        title: "Compilation Log",
        content: finalized.logContent,
        sources: [],
        frontmatter: {
          slug: "log",
          summary: "Wiki compilation history",
          sources: [],
          relatedConcepts: [],
          lastUpdated: new Date().toISOString(),
        },
      });

      const outArticles: WikiArticle[] = finalized.finalOutput;
      const articleCounts = {
        concepts: outArticles.filter((a) => a.type === "concept").length,
        connections: outArticles.filter((a) => a.type === "connection").length,
        total: outArticles.length + 2,
      };

      const totalWords = outArticles.reduce((sum, a) => sum + a.content.split(/\s+/).length, 0);

      const wikiFresh = await ctx.runQuery(internal.studio.wiki.index.getInternal, { wikiId });
      const cleared = metadataWithCheckpoint(wikiFresh, null);
      await ctx.runMutation(internal.studio.wiki.index.updateMetadataInternal, {
        wikiId,
        metadata: {
          ...cleared,
          articleCounts,
          stats: {
            totalWords,
            compilationDuration,
          },
        },
      });

      await ctx.runMutation(internal.studio.wiki.index.updateStatusInternal, {
        wikiId,
        status: "completed",
      });

      // #region agent log
      agentDebugLog({
        verificationRun: "post-fix",
        hypothesisId: "verify_ok",
        location: "convex/studio/wiki/job.ts:batchComplete",
        message: "regenerateWiki completed",
        data: { wikiId, jobRunId: runId, articleTotal: articleCounts.total },
      });
      // #endregion

      return {
        wikiId,
        status: "completed" as const,
        articleCounts,
      };
    } catch (error) {
      // #region agent log
      agentDebugLog({
        hypothesisId: "batch_catch",
        location: "convex/studio/wiki/job.ts:regenerateWikiSynthesizeBatch",
        message: "batch failed",
        data: { wikiId, runId, err: serializeErr(error) },
      });
      // #endregion
      if (await isWikiRunActive(ctx, wikiId, runId)) {
        const wikiE = await ctx.runQuery(internal.studio.wiki.index.getInternal, { wikiId });
        await ctx.runMutation(internal.studio.wiki.index.updateMetadataInternal, {
          wikiId,
          metadata: metadataWithCheckpoint(wikiE, null),
        });
        await ctx.runMutation(internal.studio.wiki.index.updateStatusInternal, {
          wikiId,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
      throw error;
    }
  },
});

// ============================================================
// INCREMENTAL INGEST: Patch wiki on new source
// ============================================================

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

/**
 * Ingest a single new document into an existing wiki.
 * Extracts concepts from the new source, diffs against existing articles,
 * patches affected ones and creates articles for genuinely new concepts.
 */
export const ingestSourceIntoWiki = internalAction({
  args: {
    wikiId: v.id("wikis"),
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    documentId: v.id("documents"),
  },
  handler: async (ctx: any, args: any) => {
    const { wikiId, notebookId, userId, documentId } = args;

    const wiki = await ctx.runQuery(internal.studio.wiki.index.getInternal, { wikiId });
    if (!wiki || wiki.status !== "completed") {
      return { wikiId, skipped: true, reason: "wiki_not_completed" };
    }

    // Fetch new document chunks
    const docChunks = await ctx.runQuery(internal.documents.index.listChunksByDocument, {
      documentId,
    });
    const chunks = docChunks.map((c: any) => c.content);
    if (chunks.length === 0) {
      return { wikiId, skipped: true, reason: "no_chunks" };
    }

    // Extract concepts from new source only
    const wikiGraph = new WikiGraph();
    const collapsedState = await wikiGraph.runMapAndCollapse({
      documentIds: [documentId],
      chunks,
      wikiId,
      notebookId,
      userId,
    });

    const incomingConcepts = collapsedState.collapsedConcepts || [];
    if (incomingConcepts.length === 0) {
      return { wikiId, skipped: true, reason: "no_concepts" };
    }

    // Fetch existing wiki articles
    const existingArticles = await ctx.runQuery(
      internal.studio.wiki.index.getArticlesInternal,
      { wikiId }
    );
    const conceptArticles = existingArticles.filter(
      (a: any) => a.type === "concept" || a.type === "connection"
    );
    const existingTitles = new Map(
      conceptArticles.map((a: any) => [a.title.toLowerCase().trim(), a])
    );

    // Diff: match incoming concepts against existing articles
    const toUpdate: { concept: ConceptExtraction; article: any }[] = [];
    const toCreate: ConceptExtraction[] = [];

    for (const concept of incomingConcepts) {
      const normalized = concept.name.toLowerCase().trim();
      const existing = existingTitles.get(normalized);
      if (existing) {
        toUpdate.push({ concept, article: existing });
      } else {
        toCreate.push(concept);
      }
    }

    // Build source excerpt for generation
    const joinedChunks = chunks.join("\n\n---\n\n");
    const maxChars = WIKI_CONFIG.MAX_RELEVANT_CONTENT_CHARS;
    const sourceExcerpt = joinedChunks.length > maxChars ? joinedChunks.slice(0, maxChars) : joinedChunks;

    const llms = createLLMs({
      apiKey: env.TOGETHER_AI_API_KEY,
      mapModel: env.FAST_LLM,
      reduceModel: env.SMART_LLM,
      temperatures: { map: 0.3, reduce: 0.6 },
      maxTokens: { map: 8000, reduce: WIKI_CONFIG.REDUCE_MAX_TOKENS },
    });

    // Patch affected articles
    for (const { concept, article } of toUpdate) {
      try {
        const structuredLlm = (llms.smartLlm as any).withStructuredOutput(WikiArticleGenerationSchema);
        const prompt = getArticleGenerationPrompt({
          concept,
          relevantContent: sourceExcerpt,
          sources: [documentId],
        });
        const result = await invokeWithRetry(
          () =>
            invokeWithTimeout(
              () =>
                structuredLlm.invoke(
                  [
                    new SystemMessage(ARTICLE_GENERATION_SYSTEM_PROMPT),
                    new HumanMessage(prompt),
                  ],
                  createLangSmithRunConfig({
                    runName: "WikiIngest.PatchArticle",
                    tags: ["agent", "wiki", "ingest"],
                  }) as unknown as Record<string, unknown>
                ),
              WIKI_CONFIG.REDUCE_TIMEOUT_MS,
              "WikiIngestPatch"
            ),
          { maxAttempts: 2, baseDelayMs: 1000 },
          "WikiIngestPatch"
        );

        const gen = result as { summary: string; relatedConcepts: string[]; content: string };
        const mergedSources = [
          ...new Set([...(article.sources || []).map(String), documentId]),
        ];
        const slug = slugify(concept.name) || "concept";
        const related = (gen.relatedConcepts || [])
          .map((r: string) => {
            const t = r.trim().replace(/^\[\[|\]\]$/g, "");
            if (!t) return "";
            return t.startsWith("concepts/") ? t : `concepts/${slugify(t)}`;
          })
          .filter(Boolean);

        await ctx.runMutation(internal.studio.wiki.index.updateArticleInternal, {
          articleId: article._id,
          content: gen.content.trim(),
          frontmatter: {
            slug,
            summary: (gen.summary || concept.summary || "").trim().slice(0, 200),
            sources: mergedSources,
            relatedConcepts: related,
            lastUpdated: new Date().toISOString(),
          },
          wordCount: gen.content.trim().split(/\s+/).length,
        });
      } catch (e) {
        console.warn(`[WikiIngest] Failed to patch article "${concept.name}":`, e);
      }
    }

    // Create articles for new concepts
    for (const concept of toCreate) {
      try {
        const structuredLlm = (llms.smartLlm as any).withStructuredOutput(WikiArticleGenerationSchema);
        const prompt = getArticleGenerationPrompt({
          concept,
          relevantContent: sourceExcerpt,
          sources: [documentId],
        });
        const result = await invokeWithRetry(
          () =>
            invokeWithTimeout(
              () =>
                structuredLlm.invoke(
                  [
                    new SystemMessage(ARTICLE_GENERATION_SYSTEM_PROMPT),
                    new HumanMessage(prompt),
                  ],
                  createLangSmithRunConfig({
                    runName: "WikiIngest.NewArticle",
                    tags: ["agent", "wiki", "ingest"],
                  }) as unknown as Record<string, unknown>
                ),
              WIKI_CONFIG.REDUCE_TIMEOUT_MS,
              "WikiIngestCreate"
            ),
          { maxAttempts: 2, baseDelayMs: 1000 },
          "WikiIngestCreate"
        );

        const gen = result as { summary: string; relatedConcepts: string[]; content: string };
        const slug = slugify(concept.name) || "concept";
        const related = (gen.relatedConcepts || [])
          .map((r: string) => {
            const t = r.trim().replace(/^\[\[|\]\]$/g, "");
            if (!t) return "";
            return t.startsWith("concepts/") ? t : `concepts/${slugify(t)}`;
          })
          .filter(Boolean);

        await ctx.runMutation(internal.studio.wiki.index.createArticleInternal, {
          wikiId,
          path: `concepts/${slug}`,
          type: "concept",
          title: concept.name,
          content: gen.content.trim(),
          sources: [documentId],
          frontmatter: {
            slug,
            summary: (gen.summary || concept.summary || "").trim().slice(0, 200),
            sources: [documentId],
            relatedConcepts: related,
            lastUpdated: new Date().toISOString(),
          },
          wordCount: gen.content.trim().split(/\s+/).length,
        });
      } catch (e) {
        console.warn(`[WikiIngest] Failed to create article for "${concept.name}":`, e);
      }
    }

    // Rebuild index
    const allArticles = await ctx.runQuery(
      internal.studio.wiki.index.getArticlesInternal,
      { wikiId }
    );
    const { buildDeterministicWikiIndex } = await import(
      "../../_agents/wiki/nodes.js"
    );
    const indexContent = buildDeterministicWikiIndex(
      allArticles.map((a: any) => ({
        path: a.path,
        type: a.type,
        title: a.title,
        content: a.content,
        frontmatter: a.frontmatter || {},
      }))
    );

    // Upsert index article
    const existingIndex = allArticles.find((a: any) => a.path === "index");
    if (existingIndex) {
      await ctx.runMutation(internal.studio.wiki.index.updateArticleInternal, {
        articleId: existingIndex._id,
        content: indexContent,
        frontmatter: {
          slug: "index",
          summary: "Table of contents for the knowledge base",
          sources: allArticles.flatMap((a: any) => a.sources || []),
          relatedConcepts: [],
          lastUpdated: new Date().toISOString(),
        },
      });
    }

    // Update wiki metadata
    const wikiFresh = await ctx.runQuery(internal.studio.wiki.index.getInternal, { wikiId });
    const prev =
      wikiFresh?.metadata && typeof wikiFresh.metadata === "object"
        ? { ...(wikiFresh.metadata as Record<string, unknown>) }
        : {};
    await ctx.runMutation(internal.studio.wiki.index.updateMetadataInternal, {
      wikiId,
      metadata: {
        ...prev,
        lastIngestAt: new Date().toISOString(),
        lastIngestDocumentId: documentId,
      },
    });

    return {
      wikiId,
      status: "completed",
      patched: toUpdate.length,
      created: toCreate.length,
    };
  },
});
