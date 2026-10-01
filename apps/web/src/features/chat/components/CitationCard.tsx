import { Plus } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Favicon } from "@/shared/components/Favicon";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Spinner } from "@/shared/components/ui/spinner";
import type { ReferenceChunk } from "@/shared/types/index";
import {
  citationMarkdownComponents,
  getSourceHost,
  prepareCitationExcerpt,
} from "../utils/citationContent";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

interface CitationCardProps {
  /** The citation number shown on the chip (not the retrieval chunk id). */
  refId: number;
  reference: ReferenceChunk;
  /** When set, the title opens this notebook source in the sources panel. */
  onOpenInSources?: () => void;
  /** When set, shows "Add to notebook" for an external source. A returned promise shows a pending state. */
  onAddToNotebook?: () => void | Promise<unknown>;
}

/** Content of the citation popover: source header, scrollable excerpt, optional add action. */
export function CitationCard({
  refId,
  reference,
  onOpenInSources,
  onAddToNotebook,
}: CitationCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const sourceHost = useMemo(() => getSourceHost(reference.sourceUrl), [reference.sourceUrl]);
  const excerpt = useMemo(
    () => prepareCitationExcerpt(reference.content, reference.sourceTitle),
    [reference.content, reference.sourceTitle]
  );

  const handleAdd = async () => {
    if (!onAddToNotebook || isAdding) return;
    setIsAdding(true);
    try {
      await onAddToNotebook();
    } finally {
      setIsAdding(false);
    }
  };

  const title = <span className="line-clamp-2 wrap-break-word">{reference.sourceTitle}</span>;

  return (
    <>
      <div className="flex min-w-0 shrink-0 items-start gap-2 px-4 pt-4 pb-3">
        {reference.sourceUrl && (
          <Favicon url={reference.sourceUrl} size={14} className="mt-0.5 rounded-sm" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Reference {refId}
            {sourceHost ? ` • ${sourceHost}` : ""}
          </p>
          {onOpenInSources ? (
            <button
              type="button"
              onClick={onOpenInSources}
              className="mt-1 block w-full cursor-pointer rounded-sm text-left font-sans text-sm font-semibold leading-snug text-foreground hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </button>
          ) : reference.sourceUrl ? (
            <a
              href={reference.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block rounded-sm font-sans text-sm font-semibold leading-snug text-foreground hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </a>
          ) : (
            <span className="mt-1 block font-sans text-sm font-semibold leading-snug text-foreground">
              {title}
            </span>
          )}
        </div>
      </div>
      <div className="max-h-64 min-h-0 overflow-y-auto overscroll-contain border-t border-border/60 px-4 py-3 leading-relaxed wrap-break-word">
        <Suspense fallback={<Skeleton className="h-4 w-full" />}>
          <MarkdownRenderer components={citationMarkdownComponents}>{excerpt}</MarkdownRenderer>
        </Suspense>
      </div>
      {onAddToNotebook && (
        <div className="shrink-0 border-t border-border/60 p-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            disabled={isAdding}
            onClick={() => void handleAdd()}
          >
            {isAdding ? <Spinner aria-hidden /> : <Plus aria-hidden />}
            Add to notebook
          </Button>
        </div>
      )}
    </>
  );
}
