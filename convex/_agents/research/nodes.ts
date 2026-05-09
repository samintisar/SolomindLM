"use node";

import type { ResearchStateType } from "./state";
import type { SubQuestion, SourceChannel, EvidenceEntry, ResearchPhase } from "./types";
import { buildPlanPrompt, buildWriterPrompt, PlannerOutputSchema } from "./prompts";
import { createLLM } from "../_shared/llm_factory";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { trackResearchStep } from "./steps";
import type { ActionCtx } from "../../_generated/server";

const retrieverLog = createServiceLogger("research", "retrieverNode");

// Safely extract hostname from a URL string; returns undefined for invalid/empty URLs.
function safeGetDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

// Truncate content for evidence entries to prevent prompt bloat.
function truncateEvidenceContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  const truncated = content.slice(0, maxLength);
  const lastSentenceEnd = truncated.lastIndexOf(".");
  if (lastSentenceEnd > maxLength * 0.7) {
    return truncated.slice(0, lastSentenceEnd + 1);
  }
  return truncated + "…";
}

// Timeout wrapper for slow external source loaders
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms
      );
    }),
  ]);
}

// Dependencies injected from the Convex action that runs the agent.
export interface ResearchNodeDeps {
  ctx?: ActionCtx;
  researchId?: string;
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

  if (deps.ctx && deps.researchId) {
    await trackResearchStep(
      deps.ctx,
      deps.researchId,
      "research",
      "planning",
      "in_progress",
      "Planning research strategy"
    );
  }

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

  if (deps.ctx && deps.researchId) {
    await trackResearchStep(
      deps.ctx,
      deps.researchId,
      "research",
      "planning",
      "completed",
      `Generated ${subQuestions.length} sub-questions`
    );
  }

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
  if (deps.ctx && deps.researchId) {
    await trackResearchStep(
      deps.ctx,
      deps.researchId,
      "research",
      "searching",
      "in_progress",
      `Retrieving evidence for ${state.subQuestions.filter((sq) => sq.status === "pending").length} sub-questions`
    );
  }

  const { subQuestions, iteration, sourcePolicy } = state;
  const maxResultsPerChannel = sourcePolicy.maxResultsPerChannel ?? 10;
  // Cap external sources to 2 for cheap discovery; escalate only for high-value sources
  const externalMaxResults = Math.min(maxResultsPerChannel, 2);
  // Hard cap on raw content length from any scraped source — prevents prompt bloat
  const MAX_EVIDENCE_CONTENT_LENGTH = 4000;
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
              content: truncateEvidenceContent(chunk.content, MAX_EVIDENCE_CONTENT_LENGTH),
              relevanceScore: chunk.similarity,
              iteration,
              metadata: {
                documentId: chunk.documentId,
                chunkIndex: chunk.chunkIndex,
              },
            });
          }
        } catch (err) {
          retrieverLog.error("notebook_search_failed", err, { query: searchQuery });
        }
      }

      await deps.onProgress("retrieving_notebook", sq.id, allChunks.length);
    }

    // ── Web/News retrieval ──
    const webChannels = sq.sourceChannels.filter((ch) => ch === "web" || ch === "news");
    if (webChannels.length > 0 && deps.discoverSources && deps.loadWebPage) {
      const webQuery = sq.searchQueries[0];
      if (!webQuery) {
        await deps.onProgress("retrieving_web", sq.id, 0);
      } else {
        await deps.onProgress("retrieving_web", sq.id, 0);

        const discoveredSources: Array<{
          title: string;
          url: string;
          snippet: string;
          sourceType: string;
          score?: number;
          rawContent?: string;
        }> = [];

        // news takes priority when explicitly requested; otherwise fall back to web
        const primaryChannel = webChannels.includes("news") ? "news" : "web";

        try {
          const sources = await deps.discoverSources(
            webQuery,
            [primaryChannel],
            externalMaxResults
          );
          discoveredSources.push(...sources);
        } catch (_err) {
          retrieverLog.error("web_discovery_failed", _err, { channel: primaryChannel, query: webQuery });
        }

        // Sort by score and take top results
        discoveredSources.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        const topSources = discoveredSources.slice(0, externalMaxResults);

        // Scrape top sources for full content with timeout
        for (const source of topSources) {
          try {
            let content: string;
            if (source.rawContent && source.rawContent.trim().length > 200) {
              content = source.rawContent;
            } else {
              const page = await withTimeout(deps.loadWebPage(source.url), 10_000, `loadWebPage(${source.url})`);
              content = page.content;
            }

            // Chunk content into ~4000 char pieces
            const CHUNK_SIZE = 4000;
            const pieces: string[] = [];
            for (let start = 0; start < content.length; start += CHUNK_SIZE) {
              pieces.push(content.slice(start, start + CHUNK_SIZE));
            }

            // Take first chunk only to stay within token budget
            for (let i = 0; i < Math.min(pieces.length, 1); i++) {
              allChunks.push({
                subQuestionId: sq.id,
                sourceType: source.sourceType as SourceChannel,
                sourceTitle: source.title,
                sourceUrl: source.url,
                content: truncateEvidenceContent(pieces[i]!, MAX_EVIDENCE_CONTENT_LENGTH),
                relevanceScore: source.score,
                iteration,
                metadata: {
                  domain: safeGetDomain(source.url),
                },
              });
            }
          } catch (_err) {
            retrieverLog.warn("scrape_failed_using_snippet", {
              url: source.url,
              channel: source.sourceType,
              error: _err instanceof Error ? _err.message : String(_err),
              errorType: _err instanceof Error ? _err.constructor.name : typeof _err,
            });
            allChunks.push({
              subQuestionId: sq.id,
              sourceType: source.sourceType as SourceChannel,
              sourceTitle: source.title,
              sourceUrl: source.url,
              content: truncateEvidenceContent(source.snippet, MAX_EVIDENCE_CONTENT_LENGTH),
              relevanceScore: source.score,
              iteration,
              metadata: {
                domain: safeGetDomain(source.url),
              },
            });
          }
        }

        await deps.onProgress("retrieving_web", sq.id, topSources.length);
      }
    }

    // ── Academic retrieval ──
    if (sq.sourceChannels.includes("academic") && deps.discoverSources && deps.loadPaper) {
      const academicQuery = sq.searchQueries[0];
      if (!academicQuery) {
        await deps.onProgress("retrieving_web", sq.id, 0);
      } else {
        await deps.onProgress("retrieving_web", sq.id, 0); // Reuse web phase for academic

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

        try {
          const sources = await deps.discoverSources(
            academicQuery,
            ["academic"],
            externalMaxResults
          );
          discoveredPapers.push(...sources);
        } catch (_err) {
          retrieverLog.error("academic_discovery_failed", _err, { query: academicQuery });
        }

        // Sort by score and take top results
        discoveredPapers.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        const topPapers = discoveredPapers.slice(0, externalMaxResults);

        // ── Abstract-first loading: use snippets by default, escalate to full text selectively ──

        // Step 1: Add all top papers using abstract/snippet (fast, no OCR)
        const academicChunks: EvidenceEntry[] = topPapers.map((paper) => ({
          subQuestionId: sq.id,
          sourceType: "academic",
          sourceTitle: paper.title,
          sourceUrl: paper.url,
          content: truncateEvidenceContent(paper.snippet, MAX_EVIDENCE_CONTENT_LENGTH),
          relevanceScore: paper.score,
          iteration,
          metadata: {
            doi: paper.metadata?.doi,
            citationCount: paper.metadata?.citationCount,
          },
        }));

        // Step 2: Lazy full-text load — only for top 1-2 papers, with timeout
        const FULL_TEXT_LOAD_LIMIT = 2;
        const papersToLoad = topPapers.slice(0, FULL_TEXT_LOAD_LIMIT);

        for (let i = 0; i < papersToLoad.length; i++) {
          const paper = papersToLoad[i];
          try {
            const loaded = await withTimeout(
              deps.loadPaper({
                title: paper.title,
                authors: [],
                abstract: paper.snippet,
                url: paper.url,
                pdfUrl: paper.metadata?.pdfUrl,
                source: paper.metadata?.sourceApi ?? "arxiv",
                citationCount: paper.metadata?.citationCount,
                doi: paper.metadata?.doi,
              }),
              10_000,
              `loadPaper(${paper.title.slice(0, 30)})`
            );

            // Replace the snippet with full content for this paper
            academicChunks[i].content = truncateEvidenceContent(loaded.content, MAX_EVIDENCE_CONTENT_LENGTH);
          } catch (_err) {
            // Keep the abstract/snippet fallback — no action needed
            retrieverLog.warn("fulltext_load_failed_using_abstract", {
              title: paper.title.slice(0, 40),
              error: _err instanceof Error ? _err.message : String(_err),
            });
          }
        }

        allChunks.push(...academicChunks);
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

  if (deps.ctx && deps.researchId) {
    const totalEvidence = newEvidence.length;
    await trackResearchStep(
      deps.ctx,
      deps.researchId,
      "research",
      "searching",
      "completed",
      `Retrieved ${totalEvidence} evidence entries`
    );
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

  if (deps.ctx && deps.researchId) {
    await trackResearchStep(
      deps.ctx,
      deps.researchId,
      "research",
      "generating_report",
      "in_progress",
      `Synthesizing ${state.evidence.length} evidence entries into report`
    );
  }

  const { query, subQuestions, evidence } = state;

  // ── Prompt packing: sort, filter, and truncate evidence to stay under token budget ──
  const MAX_PROMPT_CHARS = 120_000; // ~30k tokens, leaves room for answer + instructions
  const MAX_EVIDENCE_PER_SQ = 5;
  const MAX_ENTRY_CHARS = 2_000;

  // Group evidence by sub-question
  const evidenceBySubQuestion: Record<string, EvidenceEntry[]> = {};
  for (const entry of evidence) {
    if (!evidenceBySubQuestion[entry.subQuestionId]) {
      evidenceBySubQuestion[entry.subQuestionId] = [];
    }
    evidenceBySubQuestion[entry.subQuestionId].push(entry);
  }

  // Sort each group by relevance, keep top-K, truncate each entry
  for (const sqId of Object.keys(evidenceBySubQuestion)) {
    const entries = evidenceBySubQuestion[sqId];
    entries.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
    const topEntries = entries.slice(0, MAX_EVIDENCE_PER_SQ);
    evidenceBySubQuestion[sqId] = topEntries.map((e) => ({
      ...e,
      content: truncateEvidenceContent(e.content, MAX_ENTRY_CHARS),
    }));
  }

  let prompt = buildWriterPrompt(query, subQuestions, evidenceBySubQuestion);

  // ── Emergency secondary compression if still over budget ──
  if (prompt.length > MAX_PROMPT_CHARS) {
    // Reduce MAX_ENTRY_CHARS and re-truncate
    const budgetPerEntry = Math.max(500, Math.floor((MAX_PROMPT_CHARS - 5_000) / Math.max(1, evidence.length)));
    for (const sqId of Object.keys(evidenceBySubQuestion)) {
      evidenceBySubQuestion[sqId] = evidenceBySubQuestion[sqId].map((e) => ({
        ...e,
        content: truncateEvidenceContent(e.content, budgetPerEntry),
      }));
    }
    prompt = buildWriterPrompt(query, subQuestions, evidenceBySubQuestion);
  }

  // Final safety: hard truncate if still over
  if (prompt.length > MAX_PROMPT_CHARS) {
    const originalLength = prompt.length;
    prompt = prompt.slice(0, MAX_PROMPT_CHARS);
    const lastBreak = prompt.lastIndexOf("\n\n");
    if (lastBreak > MAX_PROMPT_CHARS * 0.8) {
      prompt = prompt.slice(0, lastBreak) + "\n\n[Additional evidence truncated to fit context window]";
    }
    retrieverLog.warn("prompt_hard_truncated", { originalLength, limitChars: MAX_PROMPT_CHARS });
  }

  const llm = createLLM({
    apiKey: deps.apiKey,
    mapModel: deps.smartModel,
    phase: "smart",
    temperatures: 0.4,
    maxTokens: 4000,
  });

  const response = await llm.invoke([{ role: "user", content: prompt }]);
  const finalResponse = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

  if (deps.ctx && deps.researchId) {
    await trackResearchStep(
      deps.ctx,
      deps.researchId,
      "research",
      "generating_report",
      "completed",
      "Report generation complete"
    );
  }

  return {
    finalResponse,
    shouldStop: true,
    stopReason: "completed",
  };
}
