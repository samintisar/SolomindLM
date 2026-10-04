import { CircleAlert, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUserLimits } from "@/features/billing/services/subscriptionApi";
import { useSessionStorage } from "@/hooks/useSessionStorage";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { ItemGroup } from "@/shared/components/ui/item";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Spinner } from "@/shared/components/ui/spinner";
import { useToast } from "@/shared/contexts/useToast";
import type { Source, UnifiedDiscoveryResult } from "@/shared/types/index";
import { useCreateDocument, useUnifiedDiscovery } from "../../services/documentsApi";
import { buildAcademicDiscoveryApiFilters } from "../AcademicDiscoveryFiltersSection";
import { DiscoveryResultItem } from "./DiscoveryResultItem";
import { DiscoveryToolbar } from "./DiscoveryToolbar";
import { isInNotebook, notebookDiscoveryKeys } from "./discoveryFormat";
import {
  applyFilterPatch,
  DEFAULT_FILTERS,
  type FilterState,
  MAX_DISCOVERY_TOTAL_RESULTS,
} from "./filterState";

export interface DiscoverSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSource: (source: Source) => void;
  /** Current notebook sources: results already in the notebook show as added. */
  notebookSources: Source[];
  userId?: string | null;
  noteId?: string | null;
  onDocumentUploaded?: (documentId: string) => void;
  /** Hands off to the add-sources dialog, the reverse of its "Discover sources" option. */
  onAddSourcesClick?: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function overflowNote(remaining: number): string {
  if (remaining === 0) return "No more sources fit in this notebook.";
  if (remaining === 1) return "Only 1 more source fits in this notebook.";
  return `Only ${remaining} more sources fit in this notebook.`;
}

const withId = (ids: Set<string>, id: string) => new Set(ids).add(id);
const withoutIds = (ids: Set<string>, remove: Iterable<string>) => {
  const next = new Set(ids);
  for (const id of remove) next.delete(id);
  return next;
};

export function DiscoverSourcesDialog({
  open,
  onOpenChange,
  onAddSource,
  notebookSources,
  userId,
  noteId,
  onDocumentUploaded,
  onAddSourcesClick,
}: DiscoverSourcesDialogProps) {
  // Search state lives here, above DialogContent, so reopening shows the last search.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedDiscoveryResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [addingIds, setAddingIds] = useState<Set<string>>(() => new Set());
  // True only while "Add selected" runs; row adds don't drive the footer spinner.
  const [bulkAdding, setBulkAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [filters, setFilters] = useSessionStorage<FilterState>(
    "discovery-filters",
    DEFAULT_FILTERS
  );
  // Only the latest search may write results; earlier responses are dropped.
  const requestRef = useRef(0);
  // Set when closing to hand off to the add dialog, so focus does not return to the trigger.
  const handoffRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount.
  useEffect(() => {
    setFilters((prev) =>
      prev.maxResults > MAX_DISCOVERY_TOTAL_RESULTS
        ? { ...prev, maxResults: MAX_DISCOVERY_TOTAL_RESULTS }
        : prev
    );
    // One-time clamp for session keys saved when the slider allowed 50.
  }, []);

  const discover = useUnifiedDiscovery();
  const createDocument = useCreateDocument();
  const { error: showError, success } = useToast();
  const { sourceLimit, isLoading: limitsLoading } = useUserLimits();

  const keys = useMemo(() => notebookDiscoveryKeys(notebookSources), [notebookSources]);
  const inNotebook = (r: UnifiedDiscoveryResult) => isInNotebook(r, keys);

  // While the subscription loads the cap is unknown: don't gate on it (the server enforces it).
  const limitReached = !limitsLoading && notebookSources.length >= sourceLimit;
  const remaining = limitsLoading
    ? Number.POSITIVE_INFINITY
    : Math.max(0, sourceLimit - notebookSources.length);

  const busy = addingIds.size > 0;
  const selectable = results.filter((r) => !inNotebook(r));
  const selectedCount = selectable.filter((r) => selectedIds.has(r.id)).length;
  const addCount = Math.min(selectedCount, remaining);
  const canAdd = Boolean(userId && noteId);

  const handleSearch = async () => {
    if (!query.trim() || busy) return;
    const id = ++requestRef.current;

    setIsLoading(true);
    setHasSearched(true);
    setError(null);
    setWarning(null);
    setResults([]);
    setSelectedIds(new Set());

    try {
      const response = await discover({
        query: query.trim(),
        sourceTypes: filters.sourceTypes,
        timeRange: filters.timeRange,
        academicFilters: filters.sourceTypes.includes("academic")
          ? buildAcademicDiscoveryApiFilters(filters.academic)
          : undefined,
        maxResults: filters.maxResults,
        sortBy: filters.sortBy,
      });
      if (id !== requestRef.current) return;
      setResults(response.sources);
      if (response.sources.length === 0) setWarning(response.warnings?.[0] ?? null);
    } catch (err) {
      if (id !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Search failed. Please try again.");
    } finally {
      if (id === requestRef.current) setIsLoading(false);
    }
  };

  const addResult = async (result: UnifiedDiscoveryResult) => {
    if (result.sourceType === "academic") {
      const response = await createDocument({
        notebookId: noteId!,
        type: "paper_record",
        fileName: result.title || "Paper",
        paperRecord: {
          abstract: result.snippet || "",
          authors: result.metadata.authors ?? [],
          doi: result.metadata.doi,
          venue: result.metadata.venue,
          publicationYear: result.metadata.publicationYear,
          openAlexId: result.metadata.openAlexId,
          isOa: result.metadata.openAccess ?? false,
          pdfUrl: result.metadata.pdfUrl,
          landingPageUrl: result.metadata.landingPageUrl,
          license: result.metadata.license,
        },
      });

      const newSource: Source = {
        id: response.documentId,
        title: result.title,
        type: "PAPER",
        date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        selected: true,
        status: "pending",
        url: result.metadata.landingPageUrl || result.url,
        paper: {
          doi: result.metadata.doi,
          openAlexId: result.metadata.openAlexId,
        },
      };

      onAddSource(newSource);
      onDocumentUploaded?.(response.documentId);
      return;
    }

    const response = await createDocument({
      notebookId: noteId!,
      type: "url",
      source: result.url,
      fileName: result.title || result.url,
    });

    const newSource: Source = {
      id: response.documentId,
      title: result.title,
      type: "WEB",
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      selected: true,
      status: "pending",
      url: result.url,
      remoteRefreshKind: "url",
    };

    onAddSource(newSource);
    onDocumentUploaded?.(response.documentId);
  };

  const handleAddSingle = async (result: UnifiedDiscoveryResult) => {
    if (limitReached || !canAdd || bulkAdding || inNotebook(result)) return;

    setAddingIds((prev) => withId(prev, result.id));
    try {
      await addResult(result);
      setSelectedIds((prev) => withoutIds(prev, [result.id]));
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setAddingIds((prev) => withoutIds(prev, [result.id]));
    }
  };

  const handleAddSelected = async () => {
    if (limitReached || !canAdd || bulkAdding) return;

    const toAdd = results
      .filter((r) => selectedIds.has(r.id) && !inNotebook(r) && !addingIds.has(r.id))
      .slice(0, remaining);
    if (toAdd.length === 0) return;

    setBulkAdding(true);
    setAddingIds((prev) => {
      const next = new Set(prev);
      for (const r of toAdd) next.add(r.id);
      return next;
    });

    const added: string[] = [];
    try {
      for (const result of toAdd) {
        try {
          await addResult(result);
          added.push(result.id);
        } catch (err) {
          showError(err instanceof Error ? err.message : "Failed to add source");
        }
      }
    } finally {
      setBulkAdding(false);
      setAddingIds((prev) =>
        withoutIds(
          prev,
          toAdd.map((r) => r.id)
        )
      );
    }
    if (added.length > 0) {
      success(added.length === 1 ? "Added 1 source" : `Added ${added.length} sources`);
      // Failures stay selected so they can be retried.
      setSelectedIds((prev) => withoutIds(prev, added));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllOrClear = () => {
    if (selectedCount > 0) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectable.slice(0, remaining).map((r) => r.id)));
  };

  // Text for the persistent live region; empty until the first search.
  const liveMessage = (() => {
    if (isLoading) return "Searching…";
    if (error) return error;
    if (!hasSearched) return "";
    if (results.length === 0) return "No sources found";
    return plural(results.length, "result");
  })();

  const renderResults = () => {
    if (isLoading) {
      return (
        <div aria-hidden className="flex flex-col gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      );
    }
    if (error) {
      return (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }
    if (!hasSearched) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>Find sources to add</EmptyTitle>
            <EmptyDescription>Search the web, news, academic papers or finance.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    if (results.length === 0) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No sources found</EmptyTitle>
            <EmptyDescription>{warning ?? "Try different keywords or filters."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{plural(results.length, "result")}</p>
        <ItemGroup variant="grouped">
          {results.map((result) => (
            <DiscoveryResultItem
              key={result.id}
              result={result}
              selected={selectedIds.has(result.id)}
              inNotebook={inNotebook(result)}
              adding={addingIds.has(result.id)}
              limitReached={limitReached}
              disabled={!canAdd || bulkAdding}
              onToggle={() => toggleSelect(result.id)}
              onAdd={() => void handleAddSingle(result)}
            />
          ))}
        </ItemGroup>
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        size="wide"
        padding="none"
        showCloseButton={false}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
        onCloseAutoFocus={(e) => {
          if (handoffRef.current) {
            e.preventDefault();
            handoffRef.current = false;
          }
        }}
      >
        <div className="flex items-center gap-2 px-6 pt-6 pb-4">
          <DialogHeader className="min-w-0 flex-1 text-left">
            <DialogTitle>
              <span className="font-display text-xl">Discover sources</span>
            </DialogTitle>
            <DialogDescription>
              Search the web, news, papers and finance, then add what you need.
            </DialogDescription>
          </DialogHeader>
          {onAddSourcesClick && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              disabled={busy}
              onClick={() => {
                handoffRef.current = true;
                onOpenChange(false);
                onAddSourcesClick();
              }}
            >
              <Plus aria-hidden />
              Add sources
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" disabled={busy}>
              <X />
            </Button>
          </DialogClose>
        </div>

        {/* Pinned above the scrolling results so the search stays reachable. */}
        <div className="px-6 pb-4">
          <DiscoveryToolbar
            query={query}
            onQueryChange={setQuery}
            onSearch={() => void handleSearch()}
            isLoading={isLoading}
            disabled={busy}
            filters={filters}
            onFiltersChange={(patch) => setFilters((prev) => applyFilterPatch(prev, patch))}
            onFiltersReset={() => setFilters(DEFAULT_FILTERS)}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">
          {renderResults()}
          {/* Mounted for the dialog's lifetime so changes to its text are announced. */}
          <p aria-live="polite" className="sr-only">
            {liveMessage}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-muted/40 px-6 py-3 font-sans text-sm">
          <span className="text-muted-foreground">
            {selectedCount} of {selectable.length} selected
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={selectable.length === 0 || (selectedCount === 0 && remaining === 0)}
            onClick={selectAllOrClear}
          >
            {selectedCount > 0 ? "Clear" : "Select all"}
          </Button>
          {selectedCount > remaining && (
            <span className="order-last basis-full text-xs text-muted-foreground">
              {overflowNote(remaining)}
            </span>
          )}
          <Button
            type="button"
            className="ml-auto"
            disabled={addCount === 0 || busy || limitReached || !canAdd}
            onClick={() => void handleAddSelected()}
          >
            {bulkAdding && <Spinner aria-hidden />}
            {addCount === 0 ? "Add selected" : `Add ${plural(addCount, "source")}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
