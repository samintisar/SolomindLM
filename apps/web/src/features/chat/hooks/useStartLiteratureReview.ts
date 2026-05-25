import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type LiteratureReviewSearchOptions = {
  researchDatabase: "all" | "pubmed" | "arxiv";
  academicFilters?: {
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
    hasFullText?: boolean;
    fieldOfStudyTerms?: string[];
  };
};

export type StartLiteratureReviewResult = {
  sessionId: Id<"literatureReviewSessions">;
  conversationId: Id<"conversations">;
};

export interface UseStartLiteratureReviewReturn {
  startLiteratureReview: (
    query: string,
    notebookId: Id<"notebooks">,
    searchOptions?: LiteratureReviewSearchOptions,
    conversationId?: Id<"conversations">,
    smartModel?: string
  ) => Promise<StartLiteratureReviewResult>;
  isStarting: boolean;
  error: string | null;
}

export function useStartLiteratureReview(): UseStartLiteratureReviewReturn {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startMutation = useMutation(api.studio.literature_tables.index.startLiteratureReview);

  const startLiteratureReview = useCallback(
    async (
      query: string,
      notebookId: Id<"notebooks">,
      searchOptions?: LiteratureReviewSearchOptions,
      conversationId?: Id<"conversations">,
      smartModel?: string
    ): Promise<StartLiteratureReviewResult> => {
      setIsStarting(true);
      setError(null);
      try {
        const result = await startMutation({
          query,
          notebookId,
          searchOptions,
          conversationId,
          ...(smartModel ? { smartModel } : {}),
        });
        return {
          sessionId: result.sessionId as Id<"literatureReviewSessions">,
          conversationId: result.conversationId as Id<"conversations">,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start literature review";
        setError(message);
        throw err;
      } finally {
        setIsStarting(false);
      }
    },
    [startMutation]
  );

  return { startLiteratureReview, isStarting, error };
}
