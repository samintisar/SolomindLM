"use node";

import type { ActionCtx } from "../../_generated/server";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { allWithConcurrency } from "../_shared/concurrency";
import { createLLM } from "../_shared/llm_factory";
import { buildPlanPrompt, buildWriterPrompt, PlannerOutputSchema } from "./prompts";
import type { ResearchStateType } from "./state";
import { trackResearchStep } from "./steps";
import type { EvidenceEntry, ResearchPhase, SourceChannel, SubQuestion } from "./types";

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
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/** Paper details from academic search, carried into evidence so citations have authors and year. */
export interface DiscoveredPaperMetadata {
  pdfUrl?: string;
  doi?: string;
  citationCount?: number;
  sourceApi?: "openalex" | "arxiv" | "semantic_scholar" | "pubmed";
  authors?: string[];
  year?: number;
}

export interface DiscoveredResearchSource {
  title: string;
  url: string;
  snippet: string;
  sourceType: string;
  score?: number;
  rawContent?: string;
  metadata?: DiscoveredPaperMetadata;
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
  ) => Promise<
    Array<{
      sourceId: string;
      documentId?: string;
      sourceTitle: string;
      sourceUrl?: string;
      content: string;
      chunkIndex: number;
      similarity?: number;
    }>
  >;
  // External source discovery (web/news/academic)
  discoverSources?: (
    query: string,
    channels: Array<"web" | "news" | "academic">,
    maxResults?: number
  ) => Promise<DiscoveredResearchSource[]>;
  // Web page loader for scraping discovered sources
  loadWebPage?: (url: string) => Promise<{ title: string; content: string; url: string }>;
  /**
   * Whether a paper is on the research question's topic (title and abstract). Academic search
   * matches on single words ("retention", "schedule"), so results are screened before they become
   * evidence (#558). Optional: without it every result is kept.
   */
  isPaperOnTopic?: (paper: { title: string; abstract: string }, query: string) => Promise<boolean>;
  // Stream progress callback
  onProgress: (
    phase: ResearchPhase,
    subQuestionId?: string,
    sourcesFound?: number
  ) => Promise<void>;
}

/**
 * The user's own sources are searched for every sub-question when the notebook channel is on: the
 * planner often routes sub-questions to web or academic only, and the notebook search is local and
 * cheap (#558).
 */
export function withNotebookChannel(
  channels: SourceChannel[],
  enabledChannels: SourceChannel[]
): SourceChannel[] {
  if (!enabledChannels.includes("notebook") || channels.includes("notebook")) return channels;
  return ["notebook", ...channels];
}

const PAPER_SCREEN_CONCURRENCY = 4;

type TopicScreen = NonNullable<ResearchNodeDeps["isPaperOnTopic"]>;

/** Verdicts per screen function, so one run never screens a paper twice (sub-questions overlap). */
const topicVerdicts = new WeakMap<TopicScreen, Map<string, Promise<boolean>>>();

/** The screen with each verdict remembered by paper and question; a failed call is not kept. */
export function rememberTopicVerdicts(screen: TopicScreen): TopicScreen {
  let verdicts = topicVerdicts.get(screen);
  if (!verdicts) {
    verdicts = new Map();
    topicVerdicts.set(screen, verdicts);
  }
  const cache = verdicts;
  return (paper, query) => {
    const key = `${query}\u0000${paper.title}`;
    let verdict = cache.get(key);
    if (!verdict) {
      verdict = screen(paper, query);
      cache.set(key, verdict);
      verdict.catch(() => cache.delete(key));
    }
    return verdict;
  };
}

/**
 * Drops papers the screen calls clearly off topic. A failed screen keeps the paper: the check is
 * best-effort and must not empty the evidence when the model is down.
 */
export async function dropOffTopicPapers<
  T extends { title: string; snippet: string; rawContent?: string },
>(
  papers: T[],
  query: string,
  isPaperOnTopic: NonNullable<ResearchNodeDeps["isPaperOnTopic"]>
): Promise<T[]> {
  const verdicts = await allWithConcurrency(
    papers.map((paper) => async () => {
      try {
        return await isPaperOnTopic(
          { title: paper.title, abstract: paper.rawContent?.trim() || paper.snippet },
          query
        );
      } catch (err) {
        retrieverLog.warn("paper_screen_failed_keeping_paper", {
          title: paper.title.slice(0, 40),
          error: err instanceof Error ? err.message : String(err),
        });
        return true;
      }
    }),
    PAPER_SCREEN_CONCURRENCY
  );
  const kept = papers.filter((_, i) => verdicts[i]);
  if (kept.length < papers.length) {
    retrieverLog.info("off_topic_papers_dropped", {
      dropped: papers.length - kept.length,
      kept: kept.length,
    });
  }
  return kept;
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
    sourceChannels: withNotebookChannel(
      sq.sourceChannels.filter((ch) =>
        enabledChannels.includes(ch as SourceChannel)
      ) as SourceChannel[],
      enabledChannels
    ),
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
  const DEFAULT_MAX_RESULTS_PER_CHANNEL = 8;
  const EXTERNAL_RESULTS_HARD_CAP = 12;
  const maxResultsPerChannel = sourcePolicy.maxResultsPerChannel ?? DEFAULT_MAX_RESULTS_PER_CHANNEL;
  const externalMaxResults = Math.min(maxResultsPerChannel, EXTERNAL_RESULTS_HARD_CAP);
  // Hard cap on raw content length from any scraped source — prevents prompt bloat
  const MAX_EVIDENCE_CONTENT_LENGTH = 4000;
  const newEvidence: EvidenceEntry[] = [];
  const updatedSubQuestions = [...subQuestions];

  // Process each pending sub-question
  for (const sq of subQuestions) {
    if (sq.status !== "pending") continue;

    const allChunks: EvidenceEntry[] = [];

    // ── Notebook retrieval ──
    // First pass only: notebook search is deterministic, so a gap pass would get the same chunks.
    if (sq.sourceChannels.includes("notebook") && iteration === 0) {
      await deps.onProgress("retrieving_notebook", sq.id, 0);

      // The sub-question goes first: notebook search and its relevance floor are tuned on natural
      // questions, and the planner's keyword queries (written for web and paper indexes) rerank
      // below that floor, leaving one chunk per sub-question (#558). The keyword queries still run,
      // so a query the user edited at plan approval reaches the notebook.
      const searchQueries = [...new Set([sq.question, ...sq.searchQueries])];
      for (const searchQuery of searchQueries) {
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
          retrieverLog.error("web_discovery_failed", _err, {
            channel: primaryChannel,
            query: webQuery,
          });
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
              const page = await withTimeout(
                deps.loadWebPage(source.url),
                10_000,
                `loadWebPage(${source.url})`
              );
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
    if (sq.sourceChannels.includes("academic") && deps.discoverSources) {
      const academicQuery = sq.searchQueries[0];
      if (!academicQuery) {
        await deps.onProgress("retrieving_web", sq.id, 0);
      } else {
        await deps.onProgress("retrieving_web", sq.id, 0); // Reuse web phase for academic

        let discoveredPapers: DiscoveredResearchSource[] = [];

        try {
          // A wider pool when papers are screened: paper indexes match loosely, and the screen
          // drops most of a small pool, so the sub-question would keep no papers at all.
          discoveredPapers = await deps.discoverSources(
            academicQuery,
            ["academic"],
            deps.isPaperOnTopic ? EXTERNAL_RESULTS_HARD_CAP : externalMaxResults
          );
        } catch (_err) {
          retrieverLog.error("academic_discovery_failed", _err, { query: academicQuery });
        }

        // Discovery returns papers best first. Screen them a batch at a time, stopping once enough
        // on-topic papers are kept, then take the top results.
        let topPapers = discoveredPapers;
        if (deps.isPaperOnTopic && topPapers.length > 0) {
          const screen = rememberTopicVerdicts(deps.isPaperOnTopic);
          const kept: DiscoveredResearchSource[] = [];
          for (
            let start = 0;
            start < discoveredPapers.length && kept.length < externalMaxResults;
            start += externalMaxResults
          ) {
            const batch = discoveredPapers.slice(start, start + externalMaxResults);
            kept.push(...(await dropOffTopicPapers(batch, state.query, screen)));
          }
          topPapers = kept;
        }
        topPapers = topPapers.slice(0, externalMaxResults);

        // Papers are cited from their abstract. No full text: a landing page is mostly publisher
        // chrome, and a PDF's opening text is masthead and affiliations, which is what the evidence
        // table would show (#558).
        const academicChunks: EvidenceEntry[] = topPapers.map((paper) => ({
          subQuestionId: sq.id,
          sourceType: "academic",
          sourceTitle: paper.title,
          sourceUrl: paper.url,
          content: truncateEvidenceContent(
            paper.rawContent?.trim() || paper.snippet,
            MAX_EVIDENCE_CONTENT_LENGTH
          ),
          relevanceScore: paper.score,
          iteration,
          metadata: {
            doi: paper.metadata?.doi,
            citationCount: paper.metadata?.citationCount,
            authors: paper.metadata?.authors,
            year: paper.metadata?.year,
            sourceApi: paper.metadata?.sourceApi,
            pdfUrl: paper.metadata?.pdfUrl,
          },
        }));

        allChunks.push(...academicChunks);
      }
    }

    // Deduplicate by content similarity (simple exact match on first 200 chars). Entries with no
    // text (a paper without an abstract) are told apart by their source instead.
    const seen = new Set<string>();
    const deduped = allChunks.filter((e) => {
      const key = e.content.trim()
        ? e.content.slice(0, 200)
        : `source:${e.sourceUrl || e.sourceTitle}`;
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
  const MAX_EVIDENCE_PER_SQ = 8;
  const MAX_ENTRY_CHARS = 2_000;

  // Pick the evidence the writer sees, then truncate each entry for the prompt
  const packedBySubQuestion = packEvidenceForWriter(evidence, MAX_EVIDENCE_PER_SQ);
  const evidenceBySubQuestion: Record<string, EvidenceEntry[]> = {};
  for (const [sqId, entries] of Object.entries(packedBySubQuestion)) {
    evidenceBySubQuestion[sqId] = entries.map((e) => ({
      ...e,
      content: truncateEvidenceContent(e.content, MAX_ENTRY_CHARS),
    }));
  }

  let prompt = buildWriterPrompt(query, subQuestions, evidenceBySubQuestion);

  // ── Emergency secondary compression if still over budget ──
  if (prompt.length > MAX_PROMPT_CHARS) {
    // Reduce MAX_ENTRY_CHARS and re-truncate
    const budgetPerEntry = Math.max(
      500,
      Math.floor((MAX_PROMPT_CHARS - 5_000) / Math.max(1, evidence.length))
    );
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
      prompt =
        prompt.slice(0, lastBreak) + "\n\n[Additional evidence truncated to fit context window]";
    }
    retrieverLog.warn("prompt_hard_truncated", { originalLength, limitChars: MAX_PROMPT_CHARS });
  }

  const llm = createLLM({
    apiKey: deps.apiKey,
    mapModel: deps.smartModel,
    phase: "smart",
    temperatures: 0.4,
    maxTokens: 8000,
  });

  const response = await llm.invoke([{ role: "user", content: prompt }]);
  const finalResponse =
    typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  if (deps.ctx && deps.researchId) {
    await trackResearchStep(
      deps.ctx,
      deps.researchId,
      "research",
      "generating_report",
      "completed"
    );
  }

  return {
    finalResponse,
    // The writer's [N] markers number this evidence, so it replaces the full set: the citations,
    // references and evidence table are built from it and must count the same way (#558).
    evidence: subQuestions.flatMap((sq) => packedBySubQuestion[sq.id] ?? []),
    shouldStop: true,
    stopReason: "completed",
  };
}

const CHANNEL_ORDER: SourceChannel[] = ["notebook", "academic", "web", "news"];

/**
 * The evidence the writer sees per sub-question, at most `maxPerSubQuestion` entries. Scores are
 * not comparable across channels (notebook hybrid search, Tavily and academic ranking each use
 * their own scale), so entries are ranked within their channel and the channels take turns,
 * notebook first. One global sort let web and paper scores push the user's own sources out (#558).
 */
export function packEvidenceForWriter(
  evidence: EvidenceEntry[],
  maxPerSubQuestion: number
): Record<string, EvidenceEntry[]> {
  const bySubQuestion: Record<string, EvidenceEntry[]> = {};
  for (const entry of evidence) {
    (bySubQuestion[entry.subQuestionId] ??= []).push(entry);
  }

  const packed: Record<string, EvidenceEntry[]> = {};
  for (const [sqId, entries] of Object.entries(bySubQuestion)) {
    const channels = [...new Set(entries.map((e) => e.sourceType))].sort(
      (a, b) => channelRank(a) - channelRank(b)
    );
    const queues = channels.map((channel) =>
      entries
        .filter((e) => e.sourceType === channel)
        .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    );
    const picked: EvidenceEntry[] = [];
    while (picked.length < maxPerSubQuestion && queues.some((q) => q.length > 0)) {
      for (const queue of queues) {
        const next = queue.shift();
        if (next && picked.length < maxPerSubQuestion) picked.push(next);
      }
    }
    packed[sqId] = picked;
  }
  return packed;
}

function channelRank(channel: string): number {
  const index = CHANNEL_ORDER.indexOf(channel as SourceChannel);
  return index === -1 ? CHANNEL_ORDER.length : index;
}
