import {
  BookOpen,
  Check,
  ExternalLink,
  FileStack,
  Globe,
  GraduationCap,
  LayoutGrid,
  List,
  Loader2,
  Newspaper,
  Plus,
  Quote,
  Search,
  SlidersHorizontal,
  TrendingUp,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessionStorage } from "@/hooks/useSessionStorage";
import { Favicon } from "@/shared/components/Favicon";
import { useToast } from "@/shared/contexts/useToast";
import { Source, UnifiedDiscoveryResult } from "@/shared/types/index";
import { normalizeSourceUrlForNotebookMatch } from "@/shared/utils/sourceUrlMatch";
import { useCreateDocument, useUnifiedDiscovery } from "../services/documentsApi";
import {
  AcademicDiscoveryFiltersSection,
  buildAcademicDiscoveryApiFilters,
  type DiscoveryAcademicFilterState,
} from "./AcademicDiscoveryFiltersSection";

interface DiscoverSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSource: (source: Source) => void;
  /** Current notebook sources — used to show "Added" in sync (removal updates UI). */
  notebookSources: Source[];
  isAtLimit: boolean;
  userId?: string | null;
  noteId?: string | null;
  onDocumentUploaded?: (documentId: string) => void;
  /** Same pattern as "Discover sources" in Add source modal — return to the add-sources flow */
  onAddSourcesClick?: () => void;
}

interface FilterState {
  sourceTypes: ("web" | "news" | "academic" | "finance")[];
  timeRange?: "day" | "week" | "month" | "year";
  academic: DiscoveryAcademicFilterState;
  sortBy: "relevance" | "date" | "citations";
  maxResults: number;
}

const DEFAULT_FILTERS: FilterState = {
  sourceTypes: ["web"],
  sortBy: "relevance",
  maxResults: 20,
  academic: {},
};

/** Discovery total budget ceiling (Tavily caps `max_results` at 20). */
const MAX_DISCOVERY_TOTAL_RESULTS = 20;

/** One pastel system per type: filters, list border, icons, and grid labels stay aligned */
const SOURCE_TYPE_STYLES: Record<
  "web" | "news" | "academic" | "finance",
  {
    filterActive: string;
    filterInactive: string;
    listAccent: string;
    icon: string;
    typeChip: string;
  }
> = {
  web: {
    filterActive: "bg-sky-100/90 text-sky-950 border-sky-300/80 shadow-sm ring-1 ring-sky-200/50",
    filterInactive:
      "border-transparent bg-sky-50/50 text-sky-800/80 hover:bg-sky-100/80 hover:border-sky-200/50",
    listAccent: "border-l-sky-400/85",
    icon: "text-sky-800/80",
    typeChip: "border border-sky-200/60 bg-sky-100/80 text-sky-950",
  },
  news: {
    filterActive:
      "bg-amber-100/90 text-amber-950 border-amber-300/80 shadow-sm ring-1 ring-amber-200/50",
    filterInactive:
      "border-transparent bg-amber-50/50 text-amber-900/80 hover:bg-amber-100/80 hover:border-amber-200/50",
    listAccent: "border-l-amber-400/85",
    icon: "text-amber-800/90",
    typeChip: "border border-amber-200/60 bg-amber-100/80 text-amber-950",
  },
  academic: {
    filterActive:
      "bg-violet-100/90 text-violet-950 border-violet-300/80 shadow-sm ring-1 ring-violet-200/50",
    filterInactive:
      "border-transparent bg-violet-50/50 text-violet-900/80 hover:bg-violet-100/80 hover:border-violet-200/50",
    listAccent: "border-l-violet-400/85",
    icon: "text-violet-800/90",
    typeChip: "border border-violet-200/60 bg-violet-100/80 text-violet-950",
  },
  finance: {
    filterActive:
      "bg-emerald-100/90 text-emerald-950 border-emerald-300/80 shadow-sm ring-1 ring-emerald-200/50",
    filterInactive:
      "border-transparent bg-emerald-50/50 text-emerald-900/80 hover:bg-emerald-100/80 hover:border-emerald-200/50",
    listAccent: "border-l-emerald-400/85",
    icon: "text-emerald-800/90",
    typeChip: "border border-emerald-200/60 bg-emerald-100/80 text-emerald-950",
  },
};

const SOURCE_TYPE_CONFIG = {
  web: { label: "Web", icon: Globe },
  news: { label: "News", icon: Newspaper },
  academic: { label: "Academic", icon: GraduationCap },
  finance: { label: "Finance", icon: TrendingUp },
} as const;

type SourceType = keyof typeof SOURCE_TYPE_CONFIG;

const META_CHIP =
  "inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground leading-none";

const ADD_BTN_BASE =
  "flex-shrink-0 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 px-3 py-1.5";

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Hide snippets that duplicate the title or are an obvious title-prefix repeat from APIs */
function isSnippetMeaningful(title: string, snippet: string): boolean {
  const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
  const t = norm(title);
  const s = norm(snippet);
  if (!s) return false;
  if (s === t) return false;
  if (t.length > 0 && t.startsWith(s)) return false;
  return true;
}

function formatAcademicByline(r: UnifiedDiscoveryResult): string | null {
  if (r.sourceType !== "academic") return null;
  const parts: string[] = [];
  if (r.metadata.publicationYear) parts.push(String(r.metadata.publicationYear));
  else if (r.publishedDate) {
    const d = new Date(r.publishedDate);
    if (!Number.isNaN(d.getTime())) parts.push(String(d.getFullYear()));
  }
  if (r.metadata.venue) parts.push(r.metadata.venue);
  if (r.metadata.authors?.length) {
    const a = r.metadata.authors;
    parts.push(a.length > 1 ? `${a[0]} et al.` : a[0]!);
  }
  return parts.length ? parts.join(" · ") : null;
}

function normalizeDiscoveryKey(id: string): string {
  return id.replace(/^https:\/\/openalex\.org\//i, "").toLowerCase();
}

function normalizeDoiKey(doi: string | undefined): string | null {
  if (!doi?.trim()) return null;
  const d = doi
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .trim()
    .toLowerCase();
  return d || null;
}

/** Discovery-row hint aligned with notebook `fulltextStatus` / product copy */
function academicAccessChip(
  r: UnifiedDiscoveryResult
): { label: string; className: string; title?: string } | null {
  if (r.sourceType !== "academic") return null;
  const pdf = Boolean(r.metadata.pdfUrl?.trim());
  if (pdf) {
    return {
      label: "OA PDF",
      title:
        "An open-access PDF is available. We try to ingest it; some repositories block automated downloads.",
      className: `${META_CHIP} border-emerald-200/70 bg-emerald-50/80 text-emerald-950`,
    };
  }
  if (r.metadata.openAccess) {
    return {
      label: "Open access",
      className: `${META_CHIP} border-violet-200/70 bg-violet-50/80 text-violet-950`,
    };
  }
  if (r.metadata.landingPageUrl?.trim() || r.metadata.doi?.trim()) {
    return {
      label: "External access",
      className: `${META_CHIP} border-amber-200/70 bg-amber-50/80 text-amber-950`,
    };
  }
  return {
    label: "Metadata only",
    className: `${META_CHIP} border-border/80 bg-muted/40 text-muted-foreground`,
  };
}

function getScoreBadge(score: number) {
  const base =
    "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none";
  if (score >= 0.8) {
    return {
      label: "high relevance",
      className: `${base} border border-green-300/80 bg-green-100/90 text-green-950`,
    };
  }
  if (score >= 0.6) {
    return {
      label: "medium relevance",
      className: `${base} border border-amber-300/80 bg-amber-100/90 text-amber-950`,
    };
  }
  return {
    label: "low relevance",
    className: `${base} border border-rose-300/80 bg-rose-100/90 text-rose-950`,
  };
}

export const DiscoverSourcesModal: React.FC<DiscoverSourcesModalProps> = ({
  isOpen,
  onClose,
  onAddSource,
  notebookSources,
  isAtLimit,
  userId,
  noteId,
  onDocumentUploaded,
  onAddSourcesClick,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedDiscoveryResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [filters, setFilters] = useSessionStorage<FilterState>(
    "discovery-filters",
    DEFAULT_FILTERS
  );

  const notebookDiscoveryKeys = useMemo(() => {
    const s = new Set<string>();
    for (const source of notebookSources) {
      const u = source.url?.trim();
      if (u) s.add(normalizeSourceUrlForNotebookMatch(u));
      const oa = source.paper?.openAlexId?.trim();
      if (oa) s.add(`oa:${normalizeDiscoveryKey(oa)}`);
      const dk = normalizeDoiKey(source.paper?.doi);
      if (dk) s.add(`doi:${dk}`);
    }
    return s;
  }, [notebookSources]);

  const isDiscoveryResultInNotebook = useCallback(
    (r: UnifiedDiscoveryResult) => {
      if (notebookDiscoveryKeys.has(normalizeSourceUrlForNotebookMatch(r.url))) return true;
      if (r.sourceType !== "academic") return false;
      const oa = r.metadata.openAlexId?.trim();
      if (oa && notebookDiscoveryKeys.has(`oa:${normalizeDiscoveryKey(oa)}`)) return true;
      const dk = normalizeDoiKey(r.metadata.doi);
      if (dk && notebookDiscoveryKeys.has(`doi:${dk}`)) return true;
      return false;
    },
    [notebookDiscoveryKeys]
  );

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
  const { error: showError } = useToast();
  const filterRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close filter popover on outside click
  useEffect(() => {
    if (!showFilters) return;
    const handleClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showFilters]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showFilters) {
        setShowFilters(false);
        return;
      }
      if (e.key === "Escape") {
        onClose();
        return;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showFilters, onClose]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
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

      setResults(response.sources);
      if (response.sources.length === 0) {
        const rateLimitWarning = response.warnings?.[0];
        setError(
          rateLimitWarning ?? "No sources found. Try a different query or adjust your filters."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSingle = async (result: UnifiedDiscoveryResult) => {
    if (isAtLimit || !userId || !noteId || isDiscoveryResultInNotebook(result)) return;

    setAddingIds((prev) => new Set(prev).add(result.id));

    try {
      await addResult(result);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(result.id);
        return next;
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(result.id);
        return next;
      });
    }
  };

  const handleAddSelected = async () => {
    if (isAtLimit || !userId || !noteId) return;

    const toAdd = results.filter(
      (r) => selectedIds.has(r.id) && !isDiscoveryResultInNotebook(r) && !addingIds.has(r.id)
    );
    if (toAdd.length === 0) return;

    setAddingIds((prev) => {
      const next = new Set(prev);
      toAdd.forEach((r) => next.add(r.id));
      return next;
    });

    let _succeeded = 0;
    for (const result of toAdd) {
      try {
        await addResult(result);
        _succeeded++;
      } catch (err) {
        showError(err instanceof Error ? err.message : "Failed to add source");
      }
    }

    setAddingIds((prev) => {
      const next = new Set(prev);
      toAdd.forEach((r) => next.delete(r.id));
      return next;
    });
    setSelectedIds(new Set());
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSourceType = (type: SourceType) => {
    setFilters((prev) => {
      const types = prev.sourceTypes.includes(type)
        ? prev.sourceTypes.filter((t) => t !== type)
        : [...prev.sourceTypes, type];
      return { ...prev, sourceTypes: types.length > 0 ? types : ["web"] };
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedCount = selectedIds.size;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-card text-card-foreground rounded-xl shadow-2xl border border-border flex flex-col max-h-[90vh] min-h-0 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — matches AddSourceModal */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center">
              <FileStack className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold">SolomindLM</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary/50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls stay outside overflow-y-auto so the Filters popover is not clipped */}
        <div className="flex flex-1 min-h-0 flex-col">
          <div
            className={`relative z-10 shrink-0 px-6 md:px-10 pt-6 md:pt-10 space-y-4 bg-card/50 ${
              results.length > 0 ? "pb-3" : "pb-6 md:pb-10 border-b border-border/30"
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-2xl font-medium">Discover sources</h3>
              {onAddSourcesClick && (
                <button
                  type="button"
                  onClick={onAddSourcesClick}
                  className="hidden sm:inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-secondary/50 transition-colors text-sm font-medium"
                >
                  <FileStack className="w-4 h-4 shrink-0" />
                  Add sources
                </button>
              )}
            </div>

            <div className="border border-border/50 rounded-xl p-5 bg-card shadow-sm">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for articles, papers, or websites..."
                  className="w-full pl-10 pr-28 py-3 bg-secondary/20 border border-border rounded-lg text-sm focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
                />
                <button
                  type="submit"
                  disabled={isLoading || !query.trim()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all inline-flex items-center gap-1.5"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                </button>
              </form>
            </div>

            <div className="border border-border/50 rounded-xl p-4 bg-card shadow-sm flex flex-wrap items-center gap-2">
              {(
                Object.entries(SOURCE_TYPE_CONFIG) as [
                  SourceType,
                  (typeof SOURCE_TYPE_CONFIG)[SourceType],
                ][]
              ).map(([key, config]) => {
                const Icon = config.icon;
                const isActive = filters.sourceTypes.includes(key);
                const pastel = SOURCE_TYPE_STYLES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleSourceType(key)}
                    className={`inline-flex h-9 items-center gap-1.5 px-3.5 rounded-lg border text-sm font-medium transition-all ${
                      isActive ? pastel.filterActive : pastel.filterInactive
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {config.label}
                  </button>
                );
              })}

              <div className="flex-1 min-w-4" />

              <div ref={filterRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={`inline-flex h-9 items-center gap-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                    showFilters
                      ? "border-border bg-secondary/50 text-foreground"
                      : "border-transparent bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:border-border"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                  Filters
                </button>
                {showFilters && (
                  <div className="absolute right-0 top-full z-20 mt-2 max-h-[min(70vh,520px)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card p-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
                    <p className="text-sm font-semibold text-foreground">Filters</p>

                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Time range
                        </label>
                        <select
                          value={filters.timeRange || ""}
                          onChange={(e) =>
                            setFilters((prev) => ({
                              ...prev,
                              timeRange: (e.target.value || undefined) as FilterState["timeRange"],
                            }))
                          }
                          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
                        >
                          <option value="">All time</option>
                          <option value="day">Past day</option>
                          <option value="week">Past week</option>
                          <option value="month">Past month</option>
                          <option value="year">Past year</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Sort by
                        </label>
                        <select
                          value={filters.sortBy}
                          onChange={(e) =>
                            setFilters((prev) => ({
                              ...prev,
                              sortBy: e.target.value as FilterState["sortBy"],
                            }))
                          }
                          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
                        >
                          <option value="relevance">Relevance</option>
                          <option value="date">Date</option>
                          <option value="citations">Citations</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Total results: {filters.maxResults}
                        </label>
                        <input
                          type="range"
                          min={5}
                          max={MAX_DISCOVERY_TOTAL_RESULTS}
                          step={5}
                          value={filters.maxResults}
                          onChange={(e) =>
                            setFilters((prev) => ({
                              ...prev,
                              maxResults: parseInt(e.target.value, 10),
                            }))
                          }
                          className="w-full"
                        />
                      </div>
                    </div>

                    {filters.sourceTypes.includes("academic") && (
                      <AcademicDiscoveryFiltersSection
                        academic={filters.academic}
                        setAcademic={(patch) =>
                          setFilters((prev) => ({
                            ...prev,
                            academic: { ...prev.academic, ...patch },
                          }))
                        }
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                      className="mt-3 w-full rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
                    >
                      Reset filters
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setViewMode((v) => (v === "list" ? "grid" : "list"))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:border-border transition-colors shrink-0"
                title={viewMode === "list" ? "Grid view" : "List view"}
              >
                {viewMode === "list" ? (
                  <LayoutGrid className="w-4 h-4" />
                ) : (
                  <List className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div
            className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-card/50 px-6 md:px-10 ${selectedCount > 0 ? "pb-0" : "pb-6"}`}
          >
            {isLoading ? (
              <div className="flex flex-col items-center justify-center min-h-80 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <div>
                  <p className="font-medium text-sm">Searching across sources...</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Finding the most relevant sources for you.
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center min-h-80 text-center p-6">
                <p className="text-destructive font-medium text-sm mb-0.5">
                  Search encountered an issue
                </p>
                <p className="text-muted-foreground text-xs">{error}</p>
              </div>
            ) : results.length > 0 ? (
              viewMode === "list" ? (
                <div className="space-y-2 pt-1">
                  {results.map((result) => (
                    <ResultRow
                      key={result.id}
                      result={result}
                      isSelected={selectedIds.has(result.id)}
                      isAdding={addingIds.has(result.id)}
                      isAdded={isDiscoveryResultInNotebook(result)}
                      isAtLimit={isAtLimit}
                      onToggleSelect={() => toggleSelect(result.id)}
                      onAdd={() => handleAddSingle(result)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 py-4">
                  {results.map((result) => (
                    <ResultCard
                      key={result.id}
                      result={result}
                      isAdding={addingIds.has(result.id)}
                      isAdded={isDiscoveryResultInNotebook(result)}
                      isAtLimit={isAtLimit}
                      onAdd={() => handleAddSingle(result)}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center min-h-80 text-center opacity-40">
                <Search className="w-8 h-8 mb-3" />
                <p className="text-sm italic">Enter a topic to discover related sources</p>
              </div>
            )}
          </div>
        </div>

        {selectedCount > 0 && (
          <div className="flex items-center justify-between p-4 bg-secondary/10 border-t border-border gap-3 shrink-0 rounded-b-xl animate-in slide-in-from-bottom-2 duration-200">
            <span className="text-sm text-muted-foreground font-medium">
              {selectedCount} selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md hover:border-border/80 transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleAddSelected}
                disabled={isAtLimit}
                className="px-4 py-1.5 text-xs font-semibold bg-primary/10 text-primary rounded-md hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-50"
              >
                Add selected
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── List row ────────────────────────────────────────────────────────────────

interface ResultRowProps {
  result: UnifiedDiscoveryResult;
  isSelected: boolean;
  isAdding: boolean;
  isAdded: boolean;
  isAtLimit: boolean;
  onToggleSelect: () => void;
  onAdd: () => void;
}

const ResultRow: React.FC<ResultRowProps> = ({
  result,
  isSelected,
  isAdding,
  isAdded,
  isAtLimit,
  onToggleSelect,
  onAdd,
}) => {
  const badge = getScoreBadge(result.score);
  const typeConfig = SOURCE_TYPE_CONFIG[result.sourceType];
  const typeStyle = SOURCE_TYPE_STYLES[result.sourceType];
  const TypeIcon = typeConfig.icon;
  const byline = formatAcademicByline(result);
  const showSnippet = isSnippetMeaningful(result.title, result.snippet);
  const accessChip = academicAccessChip(result);

  return (
    <div
      onClick={onToggleSelect}
      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all border-l-[3px] ${typeStyle.listAccent} ${
        isSelected
          ? "bg-primary/5 border-primary/25 ring-1 ring-primary/10 shadow-sm"
          : "bg-card/50 border-border/60 hover:border-border hover:bg-secondary/30"
      }`}
    >
      <div
        className={`w-4 h-4 mt-0.5 rounded shrink-0 flex items-center justify-center border transition-colors ${
          isSelected ? "bg-primary border-primary" : "border-border"
        }`}
      >
        {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          <TypeIcon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${typeStyle.icon}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
              {result.title}
            </p>
            {byline && (
              <p className="text-[11px] text-muted-foreground/90 mt-0.5 line-clamp-1">{byline}</p>
            )}
            {showSnippet && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                {result.snippet}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none ${typeStyle.typeChip}`}
          >
            {typeConfig.label}
          </span>
          <span className={`${META_CHIP} gap-1`}>
            <Favicon url={result.url} size={12} />
            {result.metadata.domain || getHostname(result.url)}
          </span>
          {badge && <span className={badge.className}>{badge.label}</span>}
          {accessChip && (
            <span
              className={`${accessChip.className} inline-flex items-center gap-0.5`}
              title={accessChip.title}
            >
              {result.sourceType === "academic" && (
                <BookOpen className="w-2.5 h-2.5 shrink-0" aria-hidden />
              )}
              {accessChip.label}
            </span>
          )}
          {result.sourceType === "academic" && result.metadata.citationCount !== undefined && (
            <span className={META_CHIP}>
              <Quote className="w-2.5 h-2.5 shrink-0" />
              {result.metadata.citationCount.toLocaleString()} cites
            </span>
          )}
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
            aria-label="Open source in new tab"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isAdded) return;
          onAdd();
        }}
        disabled={isAdded || isAdding || isAtLimit}
        className={`${ADD_BTN_BASE} ${
          isAdded || isAtLimit
            ? "bg-secondary text-muted-foreground cursor-default"
            : isAdding
              ? "bg-primary/50 text-primary-foreground cursor-wait"
              : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
        }`}
        title={isAtLimit ? "Source limit reached" : undefined}
      >
        {isAdding ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : isAdded ? (
          "Added"
        ) : isAtLimit ? (
          "Limit"
        ) : (
          <>
            <Plus className="w-3 h-3" />
            Add
          </>
        )}
      </button>
    </div>
  );
};

// ── Grid card (fallback view) ───────────────────────────────────────────────

interface ResultCardProps {
  result: UnifiedDiscoveryResult;
  isAdding: boolean;
  isAdded: boolean;
  isAtLimit: boolean;
  onAdd: () => void;
}

const ResultCard: React.FC<ResultCardProps> = ({ result, isAdding, isAdded, isAtLimit, onAdd }) => {
  const badge = getScoreBadge(result.score);
  const config = SOURCE_TYPE_CONFIG[result.sourceType];
  const typeStyle = SOURCE_TYPE_STYLES[result.sourceType];
  const Icon = config.icon;
  const byline = formatAcademicByline(result);
  const showSnippet = isSnippetMeaningful(result.title, result.snippet);
  const accessChip = academicAccessChip(result);

  return (
    <div
      className={`group rounded-xl border border-border/50 border-l-[3px] ${typeStyle.listAccent} bg-card p-5 shadow-sm transition-all flex flex-col justify-between hover:border-primary/20 hover:shadow-md`}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${typeStyle.typeChip}`}
          >
            <Icon className={`h-3 w-3 ${typeStyle.icon}`} />
            {config.label}
          </div>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <h3 className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {result.title}
        </h3>
        {byline && <p className="text-[11px] text-muted-foreground/90 line-clamp-1">{byline}</p>}

        {showSnippet && (
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {result.snippet}
          </p>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`${META_CHIP} gap-1`}>
            <Favicon url={result.url} size={12} />
            {result.metadata.domain || getHostname(result.url)}
          </span>
          {badge && <span className={badge.className}>{badge.label}</span>}
          {accessChip && (
            <span
              className={`${accessChip.className} inline-flex items-center gap-0.5`}
              title={accessChip.title}
            >
              {result.sourceType === "academic" && (
                <BookOpen className="w-2.5 h-2.5 shrink-0" aria-hidden />
              )}
              {accessChip.label}
            </span>
          )}
          {result.sourceType === "academic" && result.metadata.citationCount !== undefined && (
            <span className={META_CHIP}>
              <Quote className="w-2.5 h-2.5 shrink-0" />
              {result.metadata.citationCount.toLocaleString()} cites
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-border/30 flex justify-end">
        <button
          type="button"
          onClick={onAdd}
          disabled={isAdded || isAdding || isAtLimit}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            isAdded || isAtLimit
              ? "bg-secondary text-muted-foreground cursor-default"
              : isAdding
                ? "bg-primary/50 text-primary-foreground cursor-wait"
                : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
          }`}
          title={isAtLimit ? "Source limit reached" : undefined}
        >
          {isAdding ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isAdded ? (
            "Added"
          ) : isAtLimit ? (
            "Limit"
          ) : (
            <>
              <Plus className="w-3 h-3" />
              Add
            </>
          )}
        </button>
      </div>
    </div>
  );
};
