import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  GraduationCap,
  Loader2,
  Newspaper,
  Plus,
  BookOpen,
} from "lucide-react";
import { Favicon } from "@/shared/components/Favicon";
import type { Id } from "@convex/_generated/dataModel";
import { useResearchRunEvidence } from "../services/researchApi";
import { useAddExternalSources } from "../../sources/services/documentsApi";
import {
  buildDeepResearchDisplaySources,
  type ResearchEvidenceRow,
} from "../utils/deepResearchSources";

const SOURCE_TYPE_ICON: Record<string, React.ElementType> = {
  notebook: BookOpen,
  web: Globe,
  academic: GraduationCap,
  news: Newspaper,
};

const STATUS_LABEL = {
  usedInAnswer: "Used in answer",
  searchedOnly: "Searched only",
} as const;

const STATUS_CLASS = {
  usedInAnswer:
    "border-primary/30 bg-primary/10 text-primary",
  searchedOnly:
    "border-border/60 bg-muted/40 text-muted-foreground",
} as const;

interface DeepResearchSourcesSectionProps {
  researchRunId: string;
  answerContent: string;
  notebookId?: string;
  onOpenNotebookSource?: (documentId: string) => void;
  notebookDocumentIds?: Set<string>;
}

export const DeepResearchSourcesSection: React.FC<DeepResearchSourcesSectionProps> = ({
  researchRunId,
  answerContent,
  notebookId,
  onOpenNotebookSource,
  notebookDocumentIds,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const evidence = useResearchRunEvidence(researchRunId);

  const addExternalSources = useAddExternalSources();

  const sources = useMemo(() => {
    if (!evidence?.length) return [];
    return buildDeepResearchDisplaySources(
      evidence as ResearchEvidenceRow[],
      answerContent
    );
  }, [evidence, answerContent]);

  const usedCount = sources.filter((s) => s.status === "usedInAnswer").length;

  if (evidence === undefined) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading sources…
      </div>
    );
  }

  if (sources.length === 0) {
    return null;
  }

  const handleAddToNotebook = async (source: (typeof sources)[0]) => {
    if (!notebookId || !source.sourceUrl) return;
    setAddingKey(source.key);
    try {
      await addExternalSources({
        notebookId: notebookId as Id<"notebooks">,
        sources: [
          {
            title: source.sourceTitle,
            url: source.sourceUrl,
            snippet: source.contentSnippet.slice(0, 500),
            sourceType: source.sourceType === "academic" ? "academic" : "web",
          },
        ],
      });
    } finally {
      setAddingKey(null);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-card/50 font-sans">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/30"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold text-foreground">Sources searched</span>
        <span className="text-xs text-muted-foreground">
          {sources.length} total · {usedCount} used in answer
        </span>
      </button>

      {expanded ? (
        <ul className="divide-y divide-border border-t border-border/60">
          {sources.map((source) => {
            const Icon = SOURCE_TYPE_ICON[source.sourceType] ?? Globe;
            const isNotebook = source.sourceType === "notebook" && !!source.documentId;
            const canOpenInNotebook =
              isNotebook &&
              source.documentId &&
              onOpenNotebookSource &&
              notebookDocumentIds?.has(source.documentId);
            const isExternal = !source.documentId && !!source.sourceUrl;

            return (
              <li key={source.key} className="flex gap-3 px-4 py-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  {source.sourceUrl ? (
                    <Favicon url={source.sourceUrl} className="size-4" />
                  ) : (
                    <Icon className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLASS[source.status]}`}
                    >
                      {STATUS_LABEL[source.status]}
                    </span>
                    <span className="rounded-md border border-border/50 bg-background/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                      {source.sourceType}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium leading-snug text-foreground line-clamp-2">
                    {source.sourceTitle}
                  </p>
                  {source.contentSnippet ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      {source.contentSnippet}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {isExternal ? (
                      <>
                        <a
                          href={source.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary"
                        >
                          <ExternalLink className="size-3" />
                          Open
                        </a>
                        {notebookId ? (
                          <button
                            type="button"
                            disabled={addingKey === source.key}
                            onClick={() => void handleAddToNotebook(source)}
                            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                          >
                            {addingKey === source.key ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Plus className="size-3" />
                            )}
                            Add to notebook
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {canOpenInNotebook ? (
                      <button
                        type="button"
                        onClick={() => onOpenNotebookSource!(source.documentId!)}
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary"
                      >
                        <BookOpen className="size-3" />
                        Open in sources
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
