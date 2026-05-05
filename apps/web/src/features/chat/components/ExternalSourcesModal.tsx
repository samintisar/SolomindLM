import React, { useCallback, useEffect, useState } from "react";
import { Globe, GraduationCap, Newspaper, Plus, X, ExternalLink } from "lucide-react";
import { Favicon } from "@/shared/components/Favicon";

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

};

interface ExternalSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: ExternalSource[];
  onAddSelected: (sources: ExternalSource[]) => void;
  isLoading?: boolean;
}

export const ExternalSourcesModal: React.FC<ExternalSourcesModalProps> = ({
  isOpen,
  onClose,
  sources,
  onAddSelected,
  isLoading = false,
}) => {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(new Set());
    }
  }, [isOpen]);

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

  const selectAll = useCallback(() => {
    setSelected(new Set(sources.map((_, i) => i)));
  }, [sources]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleAdd = () => {
    const chosen = sources.filter((_, i) => selected.has(i));
    if (chosen.length > 0) {
      onAddSelected(chosen);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-120 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-sources-modal-title"
        className="relative flex max-h-[90vh] min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card font-sans text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-card p-6">
          <div className="flex min-w-0 items-center gap-3">
            <Globe className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <h2
              id="external-sources-modal-title"
              className="truncate text-xl font-bold tracking-tight text-foreground"
            >
              Sources
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-card px-6 py-3">
          <button
            type="button"
            onClick={allSelected ? deselectAll : selectAll}
            className="text-sm font-semibold text-primary transition-colors hover:text-primary/90 hover:underline underline-offset-4"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <span className="tabular-nums text-xs text-muted-foreground">
            {selected.size} selected
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card/50 p-6">
          <ul className="space-y-2">
            {sources.map((source, index) => {
              const Icon = SOURCE_TYPE_ICON[source.sourceType] ?? Globe;
              const isChecked = selected.has(index);
              return (
                <li key={`${source.url}-${index}`}>
                  <label
                    className={[
                      "group flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-[border-color,background-color,box-shadow] duration-200",
                      isChecked
                        ? "border-border/55 bg-secondary/30 shadow-sm"
                        : "border-border/45 bg-card/90 hover:border-border/65 hover:bg-secondary/15",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-input text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      checked={isChecked}
                      onChange={() => toggleIndex(index)}
                      aria-label={`Include ${source.title}`}
                    />
                    {source.sourceType === "web" ? (
                      <Favicon url={source.url} size={16} className="mt-0.5 shrink-0 opacity-90" />
                    ) : (
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 truncate font-serif text-[0.9375rem] font-semibold leading-snug tracking-tight text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {source.title}
                        </a>
                        <ExternalLink
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="rounded-lg border border-border/50 bg-background/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                          {source.sourceType}
                        </span>
                        {source.score !== undefined ? (
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            Score {source.score.toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-secondary/10 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-xl px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selected.size === 0 || isLoading}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-all bg-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            {isLoading
              ? "Adding…"
              : selected.size === 0
                ? "Add to notebook"
                : `Add ${selected.size}`}
          </button>
        </div>
      </div>
    </div>
  );
};
