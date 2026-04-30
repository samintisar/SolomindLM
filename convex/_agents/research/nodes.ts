"use node";

import type { ResearchStateType } from "./state";
import type { SubQuestion, SourceChannel, EvidenceEntry, ResearchPhase } from "./types";
import { buildPlanPrompt, buildWriterPrompt, PlannerOutputSchema } from "./prompts";
import { createLLM } from "../_shared/llm_factory";

// Dependencies injected from the Convex action that runs the agent.
export interface ResearchNodeDeps {
  apiKey: string;
  smartModel: string;
  // Notebook search runners (same closures as ChatAgent uses)
  runHybridSearch: (
    query: string,
    documentIds?: string[]
  ) => Promise<Array<{
    sourceId: string;
    documentId?: string;
    sourceTitle: string;
    sourceUrl?: string;
    content: string;
    chunkIndex: number;
    similarity?: number;
  }>>;
  // External source discovery (web/news/academic)
  discoverSources?: (
    query: string,
    channels: Array<"web" | "news" | "academic">,
    maxResults?: number
  ) => Promise<Array<{
    title: string;
    url: string;
    snippet: string;
    sourceType: string;
    score?: number;
    rawContent?: string;
  }>>;
  // Web page loader for scraping discovered sources
  loadWebPage?: (url: string) => Promise<{ title: string; content: string; url: string }>;
  // Academic paper loader
  loadPaper?: (paper: {
    title: string;
    authors: string[];
    year?: number;
    abstract: string;
    url: string;
    pdfUrl?: string;
    source: "arxiv" | "semantic_scholar" | "pubmed";
    citationCount?: number;
    doi?: string;
  }) => Promise<{ title: string; content: string; source: string }>;
  // Stream progress callback
  onProgress: (phase: ResearchPhase, subQuestionId?: string, sourcesFound?: number) => Promise<void>;
}

// ============================================================
// PLANNER NODE — decomposes query into sub-questions
// ============================================================

export async function plannerNode(
  state: ResearchStateType,
  deps: ResearchNodeDeps
): Promise<Partial<ResearchStateType>> {
  const { query, sourcePolicy } = state;
  const enabledChannels = sourcePolicy.channels;

  const llm = createLLM({
    apiKey: deps.apiKey,
    mapModel: deps.smartModel,
    phase: "smart",
    temperatures: 0.3,
    maxTokens: 2000,
  });

  const structured = llm.withStructuredOutput(PlannerOutputSchema);
  const prompt = buildPlanPrompt(query, enabledChannels);

  const parsed = await structured.invoke([{ role: "user", content: prompt }]);

  const subQuestions: SubQuestion[] = parsed.subQuestions.map((sq) => ({
    id: sq.id,
    question: sq.question,
    searchQueries: sq.searchQueries,
    sourceChannels: sq.sourceChannels.filter((ch) => enabledChannels.includes(ch as SourceChannel)) as SourceChannel[],
    status: "pending",
  }));

  return { subQuestions };
}

// ============================================================
// RETRIEVER NODE — retrieves evidence for sub-questions
// V2: notebook + web/news/academic retrieval
// ============================================================

export async function retrieverNode(
  state: ResearchStateType,
  deps: ResearchNodeDeps
): Promise<Partial<ResearchStateType>> {
  const { subQuestions, iteration, sourcePolicy } = state;
  const maxResultsPerChannel = sourcePolicy.maxResultsPerChannel ?? 10;
  const newEvidence: EvidenceEntry[] = [];
  const updatedSubQuestions = [...subQuestions];

  // Process each pending sub-question
  for (const sq of subQuestions) {
    if (sq.status !== "pending") continue;

    const allChunks: EvidenceEntry[] = [];

    // ── Notebook retrieval ──
    if (sq.sourceChannels.includes("notebook")) {
      await deps.onProgress("retrieving_notebook", sq.id, 0);

      for (const searchQuery of sq.searchQueries) {
        try {
          const results = await deps.runHybridSearch(searchQuery, state.documentIds);
          for (const chunk of results.slice(0, maxResultsPerChannel)) {
            allChunks.push({
              subQuestionId: sq.id,
              sourceType: "notebook",
              sourceTitle: chunk.sourceTitle,
              sourceUrl: chunk.sourceUrl,
              content: chunk.content,
              relevanceScore: chunk.similarity,
              iteration,
              metadata: {
                documentId: chunk.documentId,
                chunkIndex: chunk.chunkIndex,
              },
            });
          }
        } catch (err) {
          console.error(`[ResearchRetriever] Notebook search failed for "${searchQuery}":`, err);
        }
      }

      await deps.onProgress("retrieving_notebook", sq.id, allChunks.length);
    }

    // ── Web/News retrieval ──
    const webChannels = sq.sourceChannels.filter((ch) => ch === "web" || ch === "news");
    if (webChannels.length > 0 && deps.discoverSources && deps.loadWebPage) {
      await deps.onProgress("retrieving_web", sq.id, 0);

      const webQueries = sq.searchQueries.slice(0, 2); // Limit queries to avoid rate limits
      const discoveredSources: Array<{
        title: string;
        url: string;
        snippet: string;
        sourceType: string;
        score?: number;
        rawContent?: string;
      }> = [];

      for (const searchQuery of webQueries) {
        try {
          const sources = await deps.discoverSources(
            searchQuery,
            webChannels as Array<"web" | "news">,
            Math.ceil(maxResultsPerChannel / webQueries.length)
          );
          discoveredSources.push(...sources);
        } catch (_err) {
          console.error(`[ResearchRetriever] Web discovery failed for "${searchQuery}":`, _err);
        }
      }

      // Sort by score and take top results
      discoveredSources.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const topSources = discoveredSources.slice(0, maxResultsPerChannel);

      // Scrape top sources for full content
      for (const source of topSources) {
        try {
          let content: string;
          if (source.rawContent && source.rawContent.trim().length > 200) {
            content = source.rawContent;
          } else {
            const page = await deps.loadWebPage(source.url);
            content = page.content;
          }

          // Chunk content into ~4000 char pieces
          const CHUNK_SIZE = 4000;
          const pieces: string[] = [];
          for (let start = 0; start < content.length; start += CHUNK_SIZE) {
            pieces.push(content.slice(start, start + CHUNK_SIZE));
          }

          // Take first 2 chunks to stay within budget but get more depth
          for (let i = 0; i < Math.min(pieces.length, 2); i++) {
            allChunks.push({
              subQuestionId: sq.id,
              sourceType: source.sourceType as SourceChannel,
              sourceTitle: source.title,
              sourceUrl: source.url,
              content: pieces[i]!,
              relevanceScore: source.score,
              iteration,
              metadata: {
                domain: new URL(source.url).hostname,
              },
            });
          }
        } catch (err) {
          // If scraping fails, use snippet as fallback
          allChunks.push({
            subQuestionId: sq.id,
            sourceType: source.sourceType as SourceChannel,
            sourceTitle: source.title,
            sourceUrl: source.url,
            content: source.snippet,
            relevanceScore: source.score,
            iteration,
            metadata: {
              domain: source.url ? new URL(source.url).hostname : undefined,
            },
          });
        }
      }

      await deps.onProgress("retrieving_web", sq.id, topSources.length);
    }

    // ── Academic retrieval ──
    if (sq.sourceChannels.includes("academic") && deps.discoverSources && deps.loadPaper) {
      await deps.onProgress("retrieving_web", sq.id, 0); // Reuse web phase for academic

      const academicQueries = sq.searchQueries.slice(0, 2);
      const discoveredPapers: Array<{
        title: string;
        url: string;
        snippet: string;
        sourceType: string;
        score?: number;
        rawContent?: string;
        metadata?: {
          pdfUrl?: string;
          doi?: string;
          citationCount?: number;
          sourceApi?: "arxiv" | "semantic_scholar" | "pubmed";
        };
      }> = [];

      for (const searchQuery of academicQueries) {
        try {
          const sources = await deps.discoverSources(
            searchQuery,
            ["academic"],
            Math.ceil(maxResultsPerChannel / academicQueries.length)
          );
          discoveredPapers.push(...sources);
        } catch (_err) {
          console.error(`[ResearchRetriever] Academic discovery failed for "${searchQuery}":`, _err);
        }
      }

      // Sort by score and take top results
      discoveredPapers.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const topPapers = discoveredPapers.slice(0, maxResultsPerChannel);

      // Load papers
      for (const paper of topPapers) {
        try {
          const loaded = await deps.loadPaper({
            title: paper.title,
            authors: [], // Not available from discovery
            abstract: paper.snippet,
            url: paper.url,
            pdfUrl: paper.metadata?.pdfUrl,
            source: paper.metadata?.sourceApi ?? "arxiv",
            citationCount: paper.metadata?.citationCount,
            doi: paper.metadata?.doi,
          });

          allChunks.push({
            subQuestionId: sq.id,
            sourceType: "academic",
            sourceTitle: paper.title,
            sourceUrl: paper.url,
            content: loaded.content,
            relevanceScore: paper.score,
            iteration,
            metadata: {
              doi: paper.metadata?.doi,
              citationCount: paper.metadata?.citationCount,
            },
          });
        } catch (err) {
          // If loading fails, use snippet/abstract as fallback
          allChunks.push({
            subQuestionId: sq.id,
            sourceType: "academic",
            sourceTitle: paper.title,
            sourceUrl: paper.url,
            content: paper.snippet,
            relevanceScore: paper.score,
            iteration,
            metadata: {
              doi: paper.metadata?.doi,
              citationCount: paper.metadata?.citationCount,
            },
          });
        }
      }
    }

    // Deduplicate by content similarity (simple exact match on first 200 chars)
    const seen = new Set<string>();
    const deduped = allChunks.filter((e) => {
      const key = e.content.slice(0, 200);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    newEvidence.push(...deduped);

    // Mark sub-question as completed
    const sqIndex = updatedSubQuestions.findIndex((q) => q.id === sq.id);
    if (sqIndex >= 0) {
      updatedSubQuestions[sqIndex] = { ...sq, status: "completed" };
    }
  }

  return {
    evidence: newEvidence,
    subQuestions: updatedSubQuestions,
  };
}

// ============================================================
// WRITER NODE — synthesizes evidence into final response
// ============================================================

export async function writerNode(
  state: ResearchStateType,
  deps: ResearchNodeDeps
): Promise<Partial<ResearchStateType>> {
  await deps.onProgress("writing");

  const { query, subQuestions, evidence } = state;

  // Group evidence by sub-question
  const evidenceBySubQuestion: Record<string, typeof evidence> = {};
  for (const entry of evidence) {
    if (!evidenceBySubQuestion[entry.subQuestionId]) {
      evidenceBySubQuestion[entry.subQuestionId] = [];
    }
    evidenceBySubQuestion[entry.subQuestionId].push(entry);
  }

  const prompt = buildWriterPrompt(query, subQuestions, evidenceBySubQuestion);

  const llm = createLLM({
    apiKey: deps.apiKey,
    mapModel: deps.smartModel,
    phase: "smart",
    temperatures: 0.4,
    maxTokens: 8000,
  });

  const response = await llm.invoke([{ role: "user", content: prompt }]);
  const finalResponse = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

  return {
    finalResponse,
    shouldStop: true,
    stopReason: "completed",
  };
}
