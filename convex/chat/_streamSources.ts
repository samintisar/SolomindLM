"use node";

import { refineWebSearchQuery } from "../_agents/chat/searchQueryRefiner";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { ServiceLogger } from "../_lib/logging/serviceLogger";
import {
  academicDiscoverSources,
  type DiscoverAcademicPapersResult,
} from "../_services/search/AcademicSearchService.js";
import type { StreamSourcePolicy } from "./stream";

export interface DiscoveredSource {
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
    sourceApi?: string;
  };
}

export interface DiscoverSourcesOptions {
  /** Whether to refine the query via LLM before searching. */
  refineQuery?: boolean;
  /** Fallback max results per channel when caller does not specify. */
  defaultMaxResults?: number;
  /** Tavily search depth. */
  searchDepth?: "basic" | "advanced";
  /** Whether to request raw content from Tavily. */
  includeRawContent?: boolean;
  /** Optional logger for warnings. */
  log?: Pick<ServiceLogger, "warn">;
}

/**
 * Creates a closure that discovers external sources (web/news/academic)
 * using the configured source policy.
 */
export function createDiscoverSources(
  ctx: ActionCtx,
  sourcePolicy: StreamSourcePolicy,
  options: DiscoverSourcesOptions = {}
) {
  const {
    refineQuery = false,
    defaultMaxResults = 10,
    searchDepth,
    includeRawContent,
    log,
  } = options;

  return async (
    query: string,
    channels: Array<"web" | "news" | "academic">,
    maxResults?: number
  ): Promise<DiscoveredSource[]> => {
    const promises: Promise<DiscoveredSource[]>[] = [];
    const webChannels = channels.filter((ch) => ch === "web" || ch === "news");
    const academicChannels = channels.filter((ch) => ch === "academic");

    const resolvedQuery = refineQuery ? await refineWebSearchQuery(query) : query;
    const resolvedMax = maxResults ?? defaultMaxResults;

    if (webChannels.length > 0) {
      for (const channel of webChannels) {
        const topic = channel === "web" ? "general" : channel;
        promises.push(
          ctx
            .runAction(internal._services.search.TavilySearchService.discoverSourcesInternal, {
              query: resolvedQuery,
              maxResults: resolvedMax,
              topic,
              ...(searchDepth ? { searchDepth } : {}),
              ...(includeRawContent !== undefined ? { includeRawContent } : {}),
            })
            .then(
              (
                results: Array<{
                  title?: string;
                  url?: string;
                  snippet?: string;
                  content?: string;
                  score?: number;
                  rawContent?: string;
                }>
              ) =>
                results.map((r) => ({
                  title: r.title ?? "Untitled",
                  url: r.url ?? "",
                  snippet: r.snippet ?? r.content ?? "",
                  sourceType: channel,
                  score: r.score,
                  rawContent: r.rawContent,
                }))
            )
            .catch((e: unknown) => {
              log?.warn("web_search_failed", { channel, topic, error: String(e) });
              return [];
            })
        );
      }
    }

    if (academicChannels.length > 0) {
      const af = sourcePolicy.academicFilters;
      promises.push(
        ctx
          .runAction(
            internal._services.search.AcademicSearchService.discoverAcademicPapersInternal,
            {
              query: resolvedQuery,
              maxResults: resolvedMax,
              ...(af ?? {}),
            }
          )
          .then((payload: DiscoverAcademicPapersResult) =>
            (academicDiscoverSources(payload) as any[]).map((r: any) => ({
              title: r.title ?? "Untitled",
              url: r.url ?? "",
              snippet: r.snippet ?? r.abstract ?? "",
              sourceType: r.sourceType ?? r.metadata?.sourceApi ?? "web",
              score: r.score,
              rawContent: r.rawContent,
              metadata: {
                pdfUrl: r.metadata?.pdfUrl,
                doi: r.metadata?.doi,
                citationCount: r.metadata?.citationCount,
                sourceApi: r.metadata?.sourceApi,
              },
            }))
          )
          .catch((e: unknown) => {
            log?.warn("academic_search_failed", { error: String(e) });
            return [];
          })
      );
    }

    const results = await Promise.all(promises);
    return results.flat();
  };
}

/** External chunk shape for the LLM context. */
export interface ExternalChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  content: string;
  chunkIndex: number;
  similarity: number;
  metadata?: { sectionTitle?: string };
}

/**
 * Discovers external sources for chat streaming and builds both
 * frontend-facing metadata and LLM-ready chunks.
 */
export async function discoverChatExternalSources(
  ctx: ActionCtx,
  message: string,
  sourcePolicy: StreamSourcePolicy,
  log: Pick<ServiceLogger, "info" | "warn">
): Promise<{
  sources: Array<Omit<DiscoveredSource, "rawContent">>;
  chunks: ExternalChunk[];
}> {
  const externalChannels = (sourcePolicy.channels ?? ["notebook"]).filter(
    (ch) => ch !== "notebook"
  );

  if (externalChannels.length === 0) {
    return { sources: [], chunks: [] };
  }

  const maxPerChannel = Math.ceil(10 / externalChannels.length);

  const discover = createDiscoverSources(ctx, sourcePolicy, {
    refineQuery: true,
    defaultMaxResults: maxPerChannel,
    searchDepth: "basic",
    includeRawContent: false,
    log,
  });

  const allResults = await discover(
    message,
    externalChannels.filter((ch): ch is "web" | "news" | "academic" =>
      ["web", "news", "academic"].includes(ch)
    ),
    maxPerChannel
  );

  // Sort by score descending, cap at 5
  allResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topResults = allResults.slice(0, 5);

  const sources = topResults.map(({ rawContent: _rc, ...rest }) => rest);

  const CHUNK_SIZE = 3000;
  const chunks: ExternalChunk[] = topResults
    .filter((r) => {
      const hasRawContent = r.rawContent && r.rawContent.trim().length > 100;
      const hasSnippet = r.snippet && r.snippet.trim().length > 50;
      return hasRawContent || hasSnippet;
    })
    .map((r, i) => {
      const hasRawContent = r.rawContent && r.rawContent.trim().length > 100;
      const raw = hasRawContent ? r.rawContent!.trim() : r.snippet.trim();

      const pieces: string[] = [];
      for (let start = 0; start < raw.length; start += CHUNK_SIZE) {
        pieces.push(raw.slice(start, start + CHUNK_SIZE));
      }
      const content = pieces.slice(0, 2).join("\n\n---\n\n") || raw;
      return {
        id: `ext_${i}`,
        sourceId: `ext_${i}`,
        sourceTitle: r.title,
        sourceUrl: r.url,
        content,
        chunkIndex: 0,
        similarity: 0.5,
        metadata: {
          sectionTitle: `${r.sourceType === "academic" ? "Academic" : "Web"} source (${r.sourceType})`,
        },
      };
    });

  log.info("external_search_complete", {
    channels: externalChannels,
    resultCount: sources.length,
    chunksForLLM: chunks.length,
  });

  return { sources, chunks };
}
