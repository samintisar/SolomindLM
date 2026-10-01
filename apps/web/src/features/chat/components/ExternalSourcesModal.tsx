import { ExternalLink, Globe, GraduationCap, Newspaper, Plus, TrendingUp } from "lucide-react";
import React, { useCallback, useState } from "react";
import { Favicon } from "@/shared/components/Favicon";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Spinner } from "@/shared/components/ui/spinner";
import { cn } from "@/shared/utils/cn";

export interface ExternalSource {
  title: string;
  url: string;
  snippet: string;
  sourceType: string;
  score?: number;
}

const SOURCE_TYPE_ICON: Record<string, React.ElementType> = {
  web: Globe,
  academic: GraduationCap,
  news: Newspaper,
  finance: TrendingUp,
};

interface ExternalSourcesContentProps {
  onClose: () => void;
  sources: ExternalSource[];
  onAddSelected: (sources: ExternalSource[]) => void;
  isLoading: boolean;
}

interface ExternalSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: ExternalSource[];
  onAddSelected: (sources: ExternalSource[]) => void;
  isLoading?: boolean;
}

const ExternalSourcesContent: React.FC<ExternalSourcesContentProps> = ({
  onClose,
  sources,
  onAddSelected,
  isLoading,
}) => {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const toggleIndex = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const allSelected = sources.length > 0 && selected.size === sources.length;

  const handleAdd = () => {
    const chosen = sources.filter((_, i) => selected.has(i));
    if (chosen.length > 0) {
      onAddSelected(chosen);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Sources</DialogTitle>
        <DialogDescription>Choose which sources to add to this notebook.</DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setSelected(allSelected ? new Set() : new Set(sources.map((_, i) => i)))}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
        <span className="font-sans text-xs text-muted-foreground tabular-nums">
          {selected.size} selected
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ul className="flex flex-col gap-2">
          {sources.map((source, index) => {
            const Icon = SOURCE_TYPE_ICON[source.sourceType] ?? Globe;
            const isChecked = selected.has(index);
            return (
              <li key={`${source.url}-${index}`}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-sans transition-colors hover:bg-accent/40",
                    isChecked && "border-primary/40 bg-primary/5"
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={isChecked}
                    onCheckedChange={() => toggleIndex(index)}
                    aria-label={`Include ${source.title}`}
                  />
                  {source.sourceType === "web" ? (
                    <Favicon url={source.url} size={16} className="mt-0.5 shrink-0" />
                  ) : (
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        title={source.title}
                        className="line-clamp-2 min-w-0 text-sm font-semibold break-words hover:underline"
                        // Defensive: keeps link clicks from reaching ancestor click handlers.
                        // (Clicking an <a href> inside a <label> never activates the label's control.)
                        onClick={(e) => e.stopPropagation()}
                      >
                        {source.title}
                        <ExternalLink
                          className="ml-1.5 inline size-3.5 align-text-bottom text-muted-foreground"
                          aria-hidden
                        />
                      </a>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge variant="outline">{source.sourceType}</Badge>
                      {source.score !== undefined ? (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Score {source.score.toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                    {source.snippet ? (
                      <p className="line-clamp-2 text-xs break-words text-muted-foreground">
                        {source.snippet}
                      </p>
                    ) : null}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="button" onClick={handleAdd} disabled={selected.size === 0 || isLoading}>
          {isLoading ? <Spinner aria-hidden /> : <Plus aria-hidden />}
          {isLoading ? "Adding…" : selected.size === 0 ? "Add to notebook" : `Add ${selected.size}`}
        </Button>
      </DialogFooter>
    </>
  );
};

export const ExternalSourcesModal: React.FC<ExternalSourcesModalProps> = ({
  isOpen,
  onClose,
  isLoading = false,
  ...rest
}) => (
  <Dialog
    open={isOpen}
    // Escape and overlay clicks are ignored while a request is in flight.
    onOpenChange={(open) => {
      if (!open && !isLoading) onClose();
    }}
  >
    {/* Radix unmounts the content on close, so the selection resets on every opening. */}
    <DialogContent size="wide">
      <ExternalSourcesContent onClose={onClose} isLoading={isLoading} {...rest} />
    </DialogContent>
  </Dialog>
);
