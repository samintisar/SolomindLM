import React, { useState, useEffect } from "react";
import {
  X,
  Search,
  Globe,
  Plus,
  Loader2,
  ExternalLink,
  Newspaper,
  GraduationCap,
  TrendingUp,
  Filter,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Quote,
  Users,
  Calendar,
  FileText,
} from "lucide-react";
import { Source } from "@/shared/types/index";
import { useUnifiedDiscovery, useCreateDocument } from "../services/documentsApi";
import { useToast } from "@/shared/contexts/ToastContext";
import { useSessionStorage } from "@/hooks/useSessionStorage";

interface DiscoverSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSource: (source: Source) => void;
  isAtLimit: boolean;
  userId?: string | null;
  noteId?: string | null;
  onDocumentUploaded?: (documentId: string) => void;
}

interface FilterState {
  sourceTypes: ("web" | "news" | "academic" | "finance")[];
  timeRange?: "day" | "week" | "month" | "year";
  academic: {
    publicationYearFrom?: number;
    publicationYearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
    hasFullText?: boolean;
  };
  sortBy: "relevance" | "date" | "citations";
  maxResults: number;
}

const DEFAULT_FILTERS: FilterState = {
  sourceTypes: ["web"],
  sortBy: "relevance",
  maxResults: 20,
  academic: {},
};

const SOURCE_TYPE_CONFIG = {
  web: {
    label: "Web",
    icon: Globe,
    color: "text-vintage-blue-500",
    bgColor: "bg-vintage-blue-50",
    borderColor: "border-vintage-blue-200",
  },
  news: {
    label: "News",
    icon: Newspaper,
    color: "text-vintage-amber-500",
    bgColor: "bg-vintage-amber-50",
    borderColor: "border-vintage-amber-200",
  },
  academic: {
    label: "Academic",
    icon: GraduationCap,
    color: "text-vintage-green-500",
    bgColor: "bg-vintage-green-50",
    borderColor: "border-vintage-green-200",
  },
  finance: {
    label: "Finance",
    icon: TrendingUp,
    color: "text-vintage-orange-500",
    bgColor: "bg-vintage-orange-50",
    borderColor: "border-vintage-orange-200",
  },
};

export const DiscoverSourcesModal: React.FC<DiscoverSourcesModalProps> = ({
  isOpen,
  onClose,
  onAddSource,
  isAtLimit,
  userId,
  noteId,
  onDocumentUploaded,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [filtersChanged, setFiltersChanged] = useState(false);

  // Load/save filter preferences to session storage
  const [filters, setFilters] = useSessionStorage<FilterState>(
    "discovery-filters",
    DEFAULT_FILTERS
  );

  const discover = useUnifiedDiscovery();
  const createDocument = useCreateDocument();
  const { error: showError } = useToast();

  // Reset filters changed state when source types change
  useEffect(() => {
    setFiltersChanged(true);
  }, [filters]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResults([]);
    setFiltersChanged(false);

    try {
      const response = await discover({
        query: query.trim(),
        sourceTypes: filters.sourceTypes,
        timeRange: filters.timeRange,
        academicFilters: filters.academic,
        maxResults: filters.maxResults,
        sortBy: filters.sortBy,
      });

      setResults(response.sources);
      setFiltersChanged(false);

      if (response.sources.length === 0) {
        setError("No sources found. Try a different search query or adjust your filters.");
      }
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : "Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddResult = async (result: any) => {
    if (isAtLimit || !userId || !noteId) {
      return;
    }

    // Set loading state for this specific result
    setResults((prev) => prev.map((r) => (r.id === result.id ? { ...r, isAdding: true } : r)));

    try {
      const response = await createDocument({
        notebookId: noteId,
        type: "url",
        source: result.url,
        fileName: result.title || result.url,
      });

      // Create a Source object for the frontend
      const newSource: Source = {
        id: response.documentId,
        title: result.title,
        type: "WEB",
        date: new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        selected: true,
        status: "pending",
        url: result.url,
        remoteRefreshKind: "url",
      };

      onAddSource(newSource);

      // Trigger document upload callback to start polling for status updates
      onDocumentUploaded?.(response.documentId);

      // Mark as added
      setResults((prev) =>
        prev.map((r) => (r.url === result.url ? { ...r, isAdded: true, isAdding: false } : r))
      );
    } catch (err) {
      console.error("Add source error:", err);
      showError(err instanceof Error ? err.message : "Failed to add source");

      // Reset loading state
      setResults((prev) => prev.map((r) => (r.url === result.url ? { ...r, isAdding: false } : r)));
    }
  };

  const getHostname = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 0.8) return "High";
    if (score >= 0.6) return "Medium";
    return "Low";
  };

  const getScoreColor = (score: number): string => {
    if (score >= 0.8) return "text-success";
    if (score >= 0.6) return "text-warning";
    return "text-muted-foreground";
  };

  const updateFilters = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setFiltersChanged(true);
  };

  const toggleSourceType = (type: "web" | "news" | "academic" | "finance") => {
    const newTypes = filters.sourceTypes.includes(type)
      ? filters.sourceTypes.filter((t) => t !== type)
      : [...filters.sourceTypes, type];
    updateFilters({ sourceTypes: newTypes.length > 0 ? newTypes : ["web"] });
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setFiltersChanged(false);
  };

  const renderAcademicCard = (result: any) => {
    const config = SOURCE_TYPE_CONFIG[result.sourceType as keyof typeof SOURCE_TYPE_CONFIG];
    const Icon = config.icon;

    return (
      <div
        key={result.id}
        className="group relative bg-card border border-border p-5 rounded-xl shadow-sm hover:shadow-md hover:border-primary/30 transition-all flex flex-col justify-between h-full"
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${config.color}`}
            >
              <Icon className="w-3 h-3" />
              <span>{config.label} Paper</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase ${getScoreColor(result.score)}`}>
                {getScoreLabel(result.score)} relevance
              </span>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <h3 className="font-bold font-serif text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {result.title}
          </h3>

          {result.metadata.authors && result.metadata.authors.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-3 h-3" />
              <span className="line-clamp-1">
                {result.metadata.authors.slice(0, 3).join(", ")}
                {result.metadata.authors.length > 3 && " et al."}
              </span>
            </div>
          )}

          {result.metadata.venue && (
            <div className="text-xs text-muted-foreground italic">
              {result.metadata.venue}
              {result.metadata.publicationYear && ` • ${result.metadata.publicationYear}`}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            {result.metadata.citationCount !== undefined && (
              <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md">
                <Quote className="w-3 h-3" />
                <span>{result.metadata.citationCount} citations</span>
              </div>
            )}
            {result.metadata.openAccess && (
              <div className="flex items-center gap-1 px-2 py-1 bg-vintage-green-50 text-vintage-green-700 rounded-md border border-vintage-green-200">
                <BookOpen className="w-3 h-3" />
                <span>Open access</span>
              </div>
            )}
            {result.metadata.hasFullText && (
              <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md">
                <FileText className="w-3 h-3" />
                <span>Full text</span>
              </div>
            )}
          </div>

          {result.snippet && (
            <p className="text-sm text-muted-foreground font-serif line-clamp-3 leading-relaxed">
              {result.snippet}
            </p>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-border/30 flex justify-between items-center">
          <span className="text-xs font-mono text-muted-foreground truncate max-w-[150px]">
            {getHostname(result.url)}
          </span>
          <button
            onClick={() => handleAddResult(result)}
            disabled={result.isAdded || result.isAdding || isAtLimit}
            className={`
              px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5
              ${
                result.isAdded || isAtLimit
                  ? "bg-secondary text-muted-foreground cursor-default"
                  : result.isAdding
                    ? "bg-primary/50 text-primary-foreground cursor-wait"
                    : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground shadow-sm"
              }
            `}
            title={isAtLimit ? "Source limit reached" : undefined}
          >
            {result.isAdding ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Adding...
              </>
            ) : result.isAdded ? (
              "Added"
            ) : isAtLimit ? (
              "Limit reached"
            ) : (
              <>
                <Plus className="w-3 h-3" />
                Add to Notebook
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderWebCard = (result: any) => {
    const config = SOURCE_TYPE_CONFIG[result.sourceType as keyof typeof SOURCE_TYPE_CONFIG];
    const Icon = config.icon;

    return (
      <div
        key={result.id}
        className="group relative bg-card border border-border p-5 rounded-xl shadow-sm hover:shadow-md hover:border-primary/30 transition-all flex flex-col justify-between h-full"
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${config.color}`}
            >
              <Icon className="w-3 h-3" />
              <span>{config.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase ${getScoreColor(result.score)}`}>
                {getScoreLabel(result.score)} relevance
              </span>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <h3 className="font-bold font-serif text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {result.title}
          </h3>

          {result.publishedDate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>{new Date(result.publishedDate).toLocaleDateString()}</span>
            </div>
          )}

          <p className="text-sm text-muted-foreground font-serif line-clamp-3 leading-relaxed">
            {result.snippet}
          </p>
        </div>

        <div className="mt-6 pt-4 border-t border-border/30 flex justify-between items-center">
          <span className="text-xs font-mono text-muted-foreground truncate max-w-[150px]">
            {getHostname(result.url)}
          </span>
          <button
            onClick={() => handleAddResult(result)}
            disabled={result.isAdded || result.isAdding || isAtLimit}
            className={`
              px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5
              ${
                result.isAdded || isAtLimit
                  ? "bg-secondary text-muted-foreground cursor-default"
                  : result.isAdding
                    ? "bg-primary/50 text-primary-foreground cursor-wait"
                    : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground shadow-sm"
              }
            `}
            title={isAtLimit ? "Source limit reached" : undefined}
          >
            {result.isAdding ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Adding...
              </>
            ) : result.isAdded ? (
              "Added"
            ) : isAtLimit ? (
              "Limit reached"
            ) : (
              <>
                <Plus className="w-3 h-3" />
                Add to Notebook
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-7xl bg-card text-card-foreground rounded-xl shadow-2xl border border-border flex flex-col max-h-[90vh] overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg flex items-center justify-center">
              <Search className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Discover Sources</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary/50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden bg-card/50">
          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search Bar */}
            <div className="p-6 border-b border-border/30">
              <form onSubmit={handleSearch} className="relative group">
                <div className="relative">
                  <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search for articles, papers, or websites..."
                    className="w-full pl-12 pr-28 py-4 bg-background border-2 border-border rounded-xl text-lg font-serif focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50 shadow-sm leading-normal"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                    <Search className="w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || !query.trim()}
                    className="absolute right-2 top-2 bottom-2 px-5 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                  </button>
                </div>
              </form>
            </div>

            {/* Active Filters */}
            {(filters.sourceTypes.length > 1 ||
              filters.timeRange ||
              filters.academic.minCitations !== undefined ||
              filters.academic.openAccessOnly ||
              filters.academic.hasFullText) && (
              <div className="px-6 py-3 border-b border-border/30 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground">Active filters:</span>
                {filters.sourceTypes.map((type) => {
                  const config = SOURCE_TYPE_CONFIG[type];
                  const Icon = config.icon;
                  return (
                    <span
                      key={type}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${config.bgColor} ${config.color} ${config.borderColor} border`}
                    >
                      <Icon className="w-3 h-3" />
                      {config.label}
                    </span>
                  );
                })}
                {filters.timeRange && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                    {filters.timeRange}
                  </span>
                )}
                {filtersChanged && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}

            {/* Results Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
                  <div className="relative">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-lg font-sans">Searching across sources...</p>
                    <p className="text-sm text-muted-foreground font-serif">
                      Finding the most relevant sources for you.
                    </p>
                  </div>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-64 text-center p-8 bg-destructive/5 rounded-xl border border-destructive/20">
                  <p className="text-destructive font-medium mb-1">Search encountered an issue</p>
                  <p className="text-muted-foreground text-sm">{error}</p>
                </div>
              ) : results.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  {results.map((result) =>
                    result.sourceType === "academic"
                      ? renderAcademicCard(result)
                      : renderWebCard(result)
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center p-12 opacity-40">
                  <div className="w-16 h-16 bg-muted rounded-xl flex items-center justify-center mb-4 shrink-0">
                    <Search className="w-8 h-8" />
                  </div>
                  <p className="font-serif italic text-lg">
                    Enter a topic to discover related sources
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Filter Panel */}
          <div
            className={`w-80 border-l border-border/30 bg-card overflow-y-auto transition-all ${
              showFilters ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="p-4 space-y-6">
              {/* Filter Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <h3 className="font-bold text-sm">Filters</h3>
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="p-1 hover:bg-secondary rounded md:hidden"
                >
                  {showFilters ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Source Types */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-muted-foreground">Source Types</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(SOURCE_TYPE_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    const isSelected = filters.sourceTypes.includes(key as any);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleSourceType(key as any)}
                        className={`
                          flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all
                          ${
                            isSelected
                              ? `${config.bgColor} ${config.borderColor} ${config.color} border-current`
                              : "bg-muted border-border hover:border-border/80"
                          }
                        `}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-xs font-medium">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Range */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-muted-foreground">Time Range</h4>
                <select
                  value={filters.timeRange || ""}
                  onChange={(e) =>
                    updateFilters({
                      timeRange: (e.target.value || undefined) as any,
                    })
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">All time</option>
                  <option value="day">Past day</option>
                  <option value="week">Past week</option>
                  <option value="month">Past month</option>
                  <option value="year">Past year</option>
                </select>
              </div>

              {/* Academic Filters (conditional) */}
              {filters.sourceTypes.includes("academic") && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground">
                    Academic Filters
                  </h4>

                  {/* Min Citations */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Min Citations
                    </label>
                    <select
                      value={filters.academic.minCitations || ""}
                      onChange={(e) =>
                        updateFilters({
                          academic: {
                            ...filters.academic,
                            minCitations: e.target.value ? parseInt(e.target.value) : undefined,
                          },
                        })
                      }
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="">Any</option>
                      <option value="10">10+</option>
                      <option value="50">50+</option>
                      <option value="100">100+</option>
                      <option value="500">500+</option>
                    </select>
                  </div>

                  {/* Open Access Only */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.academic.openAccessOnly || false}
                      onChange={(e) =>
                        updateFilters({
                          academic: {
                            ...filters.academic,
                            openAccessOnly: e.target.checked || undefined,
                          },
                        })
                      }
                      className="w-4 h-4 rounded border-border"
                    />
                    <span className="text-sm">Open access only</span>
                  </label>

                  {/* Has Full Text */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.academic.hasFullText || false}
                      onChange={(e) =>
                        updateFilters({
                          academic: {
                            ...filters.academic,
                            hasFullText: e.target.checked || undefined,
                          },
                        })
                      }
                      className="w-4 h-4 rounded border-border"
                    />
                    <span className="text-sm">Has full text</span>
                  </label>
                </div>
              )}

              {/* Sort By */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-muted-foreground">Sort By</h4>
                <select
                  value={filters.sortBy}
                  onChange={(e) => updateFilters({ sortBy: e.target.value as any })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                >
                  <option value="relevance">Relevance</option>
                  <option value="date">Publication date</option>
                  <option value="citations">Citation count</option>
                </select>
              </div>

              {/* Result Count */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-muted-foreground">
                  Results per source: {filters.maxResults}
                </h4>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={filters.maxResults}
                  onChange={(e) => updateFilters({ maxResults: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>5</span>
                  <span>50</span>
                </div>
              </div>

              {/* Clear Filters */}
              <button
                onClick={clearFilters}
                className="w-full px-4 py-2 text-sm font-medium text-muted-foreground hover:text-destructive transition-colors border border-border rounded-lg hover:border-destructive/30"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
