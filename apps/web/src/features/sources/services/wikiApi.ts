import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export interface WikiArticle {
  _id: string;
  path: string;
  type: "concept" | "connection" | "qa" | "index" | "log";
  title: string;
  content: string;
  sources: string[];
  frontmatter?: {
    slug?: string;
    summary?: string;
    sources?: string[];
    relatedConcepts?: string[];
    lastUpdated?: string;
  };
  wordCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Wiki {
  _id: string;
  notebookId: string;
  title: string;
  status: "draft" | "generating" | "completed" | "failed";
  generatedAt: number;
  lastRefreshedAt?: number;
  metadata?: {
    articleCounts?: {
      concepts?: number;
      connections?: number;
      total: number;
    };
    stats?: {
      totalWords?: number;
      compilationDuration?: number;
      tokenUsage?: {
        input: number;
        output: number;
        total: number;
      };
    };
  };
  error?: string;
  generationRunId?: number;
  articles?: WikiArticle[];
}

export function useWiki(notebookId: string | Id<"notebooks"> | null | undefined) {
  return useQuery(
    api.studio.wiki.index.get,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );
}

export function useWikiArticle(
  notebookId: string | Id<"notebooks"> | null | undefined,
  path: string | null
) {
  return useQuery(
    api.studio.wiki.index.getArticle,
    notebookId && path ? { notebookId: notebookId as Id<"notebooks">, path } : "skip"
  );
}

export function useCreateWiki() {
  const create = useMutation(api.studio.wiki.index.create);

  return async (notebookId: string | Id<"notebooks">) => {
    return await create({ notebookId: notebookId as Id<"notebooks"> });
  };
}

export function useRefreshWiki() {
  const refresh = useMutation(api.studio.wiki.index.refresh);

  return async (wikiId: string | Id<"wikis">) => {
    return await refresh({ wikiId: wikiId as Id<"wikis"> });
  };
}

export function useCancelWikiGeneration() {
  const cancel = useMutation(api.studio.wiki.index.cancelGeneration);

  return async (wikiId: string | Id<"wikis">) => {
    return await cancel({ wikiId: wikiId as Id<"wikis"> });
  };
}
