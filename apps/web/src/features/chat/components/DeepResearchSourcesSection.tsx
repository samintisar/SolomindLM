import type { Id } from "@convex/_generated/dataModel";
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  Globe,
  GraduationCap,
  Newspaper,
  Plus,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { Favicon } from "@/shared/components/Favicon";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { Spinner } from "@/shared/components/ui/spinner";
import { useToast } from "@/shared/contexts/useToast";
import { useAddExternalSources } from "../../sources/services/documentsApi";
import { useResearchRunEvidence } from "../services/researchApi";
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

const STATUS_VARIANT = {
  usedInAnswer: "default",
  searchedOnly: "secondary",
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
  const { success, error: toastError } = useToast();

  const evidence = useResearchRunEvidence(researchRunId);

  const addExternalSources = useAddExternalSources();

  const sources = useMemo(() => {
    if (!evidence?.length) return [];
    return buildDeepResearchDisplaySources(evidence as ResearchEvidenceRow[], answerContent);
  }, [evidence, answerContent]);

  const usedCount = sources.filter((s) => s.status === "usedInAnswer").length;

  if (evidence === undefined) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
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
      const ids = await addExternalSources({
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
      // The mutation skips URLs already in the notebook, so ids can be shorter than the input.
      success(ids.length === 0 ? "Already in this notebook" : "Added to sources");
    } catch (e) {
      console.error("Failed to add research source:", e);
      toastError("Couldn't add this source. Please try again.");
    } finally {
      setAddingKey(null);
    }
  };

  return (
    <Card variant="flush" className="mt-4">
      <div className="font-sans">
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="chip" className="group/trigger w-full justify-start">
              <ChevronRight
                className="text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]/trigger:rotate-90"
                aria-hidden
              />
              <span>Sources searched</span>
              <span className="text-xs font-normal text-muted-foreground">
                {sources.length} total · {usedCount} used in answer
              </span>
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <ul className="divide-y divide-border border-t border-border">
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
                    <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {source.sourceUrl ? (
                        <Favicon
                          url={source.sourceUrl}
                          size={20}
                          fit="cover"
                          className="size-full min-h-full min-w-full rounded-md"
                        />
                      ) : (
                        <Icon className="size-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={STATUS_VARIANT[source.status]}>
                          {STATUS_LABEL[source.status]}
                        </Badge>
                        <Badge variant="outline">{source.sourceType}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-foreground">
                        {source.sourceTitle}
                      </p>
                      {source.contentSnippet ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {source.contentSnippet}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {isExternal ? (
                          <>
                            <Button asChild variant="outline" size="sm">
                              <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink aria-hidden />
                                Open
                              </a>
                            </Button>
                            {notebookId ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={addingKey === source.key}
                                onClick={() => void handleAddToNotebook(source)}
                              >
                                {addingKey === source.key ? <Spinner /> : <Plus aria-hidden />}
                                Add to notebook
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {canOpenInNotebook ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenNotebookSource!(source.documentId!)}
                          >
                            <BookOpen aria-hidden />
                            Open in sources
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Card>
  );
};
