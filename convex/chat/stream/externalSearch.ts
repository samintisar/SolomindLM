"use node";

import { internal } from "../../_generated/api";
import { refineWebSearchQuery } from "../../_agents/chat/searchQueryRefiner";
import type { ReferenceChunk } from "../../storage/ChatHistoryService";

export interface ExternalSource {
  title: string;
  url: string;
  snippet: string;
  sourceType: string;
  score?: number;
}

export async function runExternalSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  message: string,
  sourcePolicy: { channels: string[] } | undefined,
  chatStreamLog?: { info: (key: string, meta?: Record<string, unknown>) => void; warn: (key: string, meta?: Record<string, unknown>) => void },
  academicFilters?: {
    provider?: string;
    fieldsOfStudy?: string[];
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
    hasFullText?: boolean;
  }
): Promise<{ externalSources: ExternalSource[]; externalChunks: ReferenceChunk[] }> {
  const externalChannels = (sourcePolicy?.channels ?? ["notebook"]).filter(
    (ch) => ch !== "notebook"
  );
  let externalSources: ExternalSource[] = [];
  let externalChunks: ReferenceChunk[] = [];

  if (externalChannels.length > 0) {
    const maxPerChannel = Math.ceil(10 / externalChannels.length);

    const webChannels = externalChannels.filter((ch) => ["web", "news"].includes(ch));
    const academicChannels = externalChannels.filter((ch) => ch === "academic");

    const allResults: Array<{
      title: string;
      url: string;
      snippet: string;
      sourceType: string;
      score?: number;
      rawContent?: string;
    }> = [];

    if (webChannels.length > 0) {
      const channelToTopic = (ch: string) => (ch === "web" ? "general" : ch);
      const searchPromises: Promise<Array<(typeof allResults)[number]>>[] = [];

      const refinedQuery = await refineWebSearchQuery(message);

      for (const channel of webChannels) {
        const topic = channelToTopic(channel);
        searchPromises.push(
          ctx
            .runAction(internal._services.search.TavilySearchService.discoverSourcesInternal, {
              query: refinedQuery,
              maxResults: maxPerChannel,
              topic,
            })
            .then((results: any[]) =>
              results.map((r: any) => ({
                title: r.title ?? "Untitled",
                url: r.url ?? "",
                snippet: r.snippet ?? r.content ?? "",
                sourceType: channel,
                score: r.score,
                rawContent: r.rawContent ?? undefined,
              }))
            )
            .catch((e: unknown) => {
              chatStreamLog?.warn("web_search_failed", { channel, topic, error: String(e) });
              return [];
            })
        );
      }

      const settled = await Promise.allSettled(searchPromises);
      for (const result of settled) {
        if (result.status === "fulfilled") {
          allResults.push(...result.value.filter((s) => s.url));
        }
      }
    }

    if (academicChannels.length > 0) {
      const academicQuery = await refineWebSearchQuery(message);
      try {
        const academicResults = await ctx.runAction(
          internal._services.search.academic.AcademicSearchService.discoverAcademicPapersInternal,
          {
            query: academicQuery,
            maxResults: maxPerChannel,
            ...(academicFilters?.provider ? { provider: academicFilters.provider as "all" | "pubmed" | "arxiv" } : {}),
            ...(academicFilters?.fieldsOfStudy ? { fieldsOfStudy: academicFilters.fieldsOfStudy } : {}),
            ...(academicFilters?.publicationYearFrom ? { publicationYearFrom: academicFilters.publicationYearFrom } : {}),
            ...(academicFilters?.publicationYearTo ? { publicationYearTo: academicFilters.publicationYearTo } : {}),
            ...(academicFilters?.minCitations ? { minCitations: academicFilters.minCitations } : {}),
            ...(academicFilters?.openAccessOnly ? { openAccessOnly: academicFilters.openAccessOnly } : {}),
            ...(academicFilters?.hasFullText ? { hasFullText: academicFilters.hasFullText } : {}),
          }
        );
        allResults.push(
          ...academicResults.map((r: any) => ({
            title: r.title ?? "Untitled",
            url: r.url ?? "",
            snippet: r.snippet ?? r.abstract ?? "",
            sourceType: "academic",
            score: r.score,
            rawContent: r.rawContent ?? undefined,
          }))
        );
      } catch (e: unknown) {
        chatStreamLog?.warn("academic_search_failed", {
          query: academicQuery,
          error: e instanceof Error ? e.message : String(e),
          errorType: e instanceof Error ? e.constructor.name : typeof e,
          statusCode: (e as any)?.statusCode ?? (e as any)?.status ?? undefined,
          retryable: (e as any)?.retryable ?? undefined,
        });
      }
    }

    allResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const topResults = allResults.slice(0, 5);

    externalSources = topResults.map(({ rawContent: _rc, ...rest }) => rest);
    externalChunks = topResults
      .filter((r) => {
        const hasRawContent = r.rawContent && r.rawContent.trim().length > 100;
        const hasSnippet = r.snippet && r.snippet.trim().length > 50;
        return hasRawContent || hasSnippet;
      })
      .map((r, i) => {
        const hasRawContent = r.rawContent && r.rawContent.trim().length > 100;
        const raw = hasRawContent ? r.rawContent!.trim() : r.snippet.trim();

        const CHUNK_SIZE = 3000;
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
        } as ReferenceChunk;
      });

    chatStreamLog?.info("external_search_complete", {
      channels: externalChannels,
      resultCount: externalSources.length,
      chunksForLLM: externalChunks.length,
    });
  }

  return { externalSources, externalChunks };
}
