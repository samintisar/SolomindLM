import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { PaperScope } from "@convex/literatureReview/notebookPapers";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";

type LiteratureReviewSearchOptions = {
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

/** Selected notebook PDFs and saved papers to include (#301); the server re-checks each one. */
type LiteratureReviewNotebookPapers = {
  documentIds: Id<"documents">[];
  paperScope: PaperScope;
};

type StartLiteratureReviewResult = {
  sessionId: Id<"literatureReviewSessions">;
  conversationId: Id<"conversations">;
};

export interface UseStartLiteratureReviewReturn {
  startLiteratureReview: (
    query: string,
    notebookId: Id<"notebooks">,
    searchOptions?: LiteratureReviewSearchOptions,
    conversationId?: Id<"conversations">,
    smartModel?: string,
    notebookPapers?: LiteratureReviewNotebookPapers
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
      smartModel?: string,
      notebookPapers?: LiteratureReviewNotebookPapers
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
          ...(notebookPapers && notebookPapers.documentIds.length > 0 ? notebookPapers : {}),
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
