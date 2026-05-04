import React, { useState } from "react";
import {
  X,
  Search,
  Star,
  Bookmark,
  Flag,
  Loader2,
  Compass,
  Library,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  MessageSquareQuote,
} from "lucide-react";
import {
  usePublicPrompts,
  useMyPrompts,
  useSavePublicPrompt,
  useRatePrompt,
  usePublishPrompt,
  useUnpublishPrompt,
  useDeletePrompt,
  useReportPrompt,
  type StudioTool,
  type PromptSortBy,
  type PublicPrompt,
} from "../services/promptsApi";
import { useToast } from "@/shared/contexts/ToastContext";
import type { Id } from "@convex/_generated/dataModel";

// ── Props ──────────────────────────────────────────────────────────────

interface DiscoverStudioPromptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  studioTool: StudioTool;
  /** Called when user clicks "Use" — fills the parent modal's prompt field. */
  onApplyPrompt: (promptText: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: PromptSortBy; label: string }[] = [
  { value: "saves", label: "Most saved" },
  { value: "rating", label: "Highest rated" },
  { value: "newest", label: "Newest" },
];

const TOOL_LABELS: Record<StudioTool, string> = {
  report: "Reports",
  spreadsheet: "Spreadsheets",
  infographic: "Infographics",
  flashcards: "Flashcards",
  quiz: "Quizzes",
  audio: "Audio",
  writtenQuestions: "Written Questions",
  mindmap: "Mind Maps",
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

function formatCount(n: number | undefined): string {
  if (n === undefined || n === null) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Component ──────────────────────────────────────────────────────────

export const DiscoverStudioPromptsModal: React.FC<DiscoverStudioPromptsModalProps> = ({
  isOpen,
  onClose,
  studioTool,
  onApplyPrompt,
}) => {
  const [activeTab, setActiveTab] = useState<"public" | "my">("public");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<PromptSortBy>("saves");
  const [sortOpen, setSortOpen] = useState(false);

  // Reporting state
  const [reportingId, setReportingId] = useState<Id<"studioPrompts"> | null>(null);

  // Rating follow-up state
  const [ratingPromptId, setRatingPromptId] = useState<Id<"studioPrompts"> | null>(null);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-card text-card-foreground rounded-xl shadow-2xl border border-border flex flex-col max-h-[85vh] min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: tool context (eyebrow) + scoped title — avoids "Discover Prompts" + tool inline */}
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div className="flex min-w-0 items-center gap-3">
            <Compass className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {TOOL_LABELS[studioTool]}
              </p>
              <h2 className="text-lg font-bold leading-snug tracking-tight">
                Prompt library
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary/50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex border-b border-border/50 px-5">
          <button
            role="tab"
            aria-selected={activeTab === "public"}
            data-testid="discover-prompts-tab-public"
            onClick={() => setActiveTab("public")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "public"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Library className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            Public
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "my"}
            data-testid="discover-prompts-tab-my"
            onClick={() => setActiveTab("my")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "my"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bookmark className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            My Prompts
          </button>
        </div>

        {/* Search & Sort (public tab only) */}
        {activeTab === "public" && (
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border/30">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prompts..."
                className="w-full pl-8 pr-3 py-2 bg-secondary/20 border border-border rounded-lg text-sm focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setSortOpen(!sortOpen)}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
              >
                {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSortBy(opt.value);
                        setSortOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50 transition-colors ${
                        sortBy === opt.value ? "text-primary font-medium" : "text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === "public" ? (
            <PublicPromptsList
              studioTool={studioTool}
              sortBy={sortBy}
              searchQuery={searchQuery}
              onApplyPrompt={(text) => {
                onApplyPrompt(text);
                onClose();
              }}
              reportingId={reportingId}
              setReportingId={setReportingId}
              ratingPromptId={ratingPromptId}
              setRatingPromptId={setRatingPromptId}
            />
          ) : (
            <MyPromptsList
              studioTool={studioTool}
              onApplyPrompt={(text) => {
                onApplyPrompt(text);
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Public Prompts List ────────────────────────────────────────────────

interface PublicPromptsListProps {
  studioTool: StudioTool;
  sortBy: PromptSortBy;
  searchQuery: string;
  onApplyPrompt: (text: string) => void;
  reportingId: Id<"studioPrompts"> | null;
  setReportingId: (id: Id<"studioPrompts"> | null) => void;
  ratingPromptId: Id<"studioPrompts"> | null;
  setRatingPromptId: (id: Id<"studioPrompts"> | null) => void;
}

const PublicPromptsList: React.FC<PublicPromptsListProps> = ({
  studioTool,
  sortBy,
  searchQuery,
  onApplyPrompt,
  reportingId,
  setReportingId,
  ratingPromptId,
  setRatingPromptId,
}) => {
  const trimmedQuery = searchQuery.trim() || undefined;
  const result = usePublicPrompts(studioTool, sortBy, trimmedQuery);
  const savePrompt = useSavePublicPrompt();
  const ratePrompt = useRatePrompt();
  const reportPrompt = useReportPrompt();
  const { success, error: showError } = useToast();

  const prompts: PublicPrompt[] = (result?.page as PublicPrompt[] | undefined) ?? [];
  const isLoading = result === undefined;

  const handleSave = async (prompt: PublicPrompt) => {
    try {
      await savePrompt(prompt._id);
      success("Prompt saved to your library");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save prompt");
    }
  };

  const handleRate = async (promptId: Id<"studioPrompts">, rating: number) => {
    try {
      await ratePrompt(promptId, rating);
      setRatingPromptId(null);
      success("Rating submitted");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to rate prompt");
    }
  };

  const handleReport = async (promptId: Id<"studioPrompts">) => {
    try {
      await reportPrompt(promptId);
      setReportingId(null);
      success("Prompt reported");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to report prompt");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading prompts...</p>
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center opacity-50">
        <MessageSquareQuote className="w-8 h-8 mb-3" />
        <p className="text-sm italic">
          {trimmedQuery ? "No prompts match your search" : "No public prompts yet for this tool"}
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-3">
      {prompts.map((prompt) => (
        <PublicPromptCard
          key={prompt._id}
          prompt={prompt}
          onUse={() => onApplyPrompt(prompt.promptText)}
          onSave={() => handleSave(prompt)}
          onReport={() => setReportingId(prompt._id)}
          isReporting={reportingId === prompt._id}
          onSubmitReport={() => handleReport(prompt._id)}
          onCancelReport={() => setReportingId(null)}
          isRating={ratingPromptId === prompt._id}
          onRequestRate={() => setRatingPromptId(prompt._id)}
          onSubmitRating={(r) => handleRate(prompt._id, r)}
          onCancelRate={() => setRatingPromptId(null)}
        />
      ))}
    </div>
  );
};

// ── Public Prompt Card ─────────────────────────────────────────────────

interface PublicPromptCardProps {
  prompt: PublicPrompt;
  onUse: () => void;
  onSave: () => void;
  onReport: () => void;
  isReporting: boolean;
  onSubmitReport: () => void;
  onCancelReport: () => void;
  isRating: boolean;
  onRequestRate: () => void;
  onSubmitRating: (rating: number) => void;
  onCancelRate: () => void;
}

const PublicPromptCard: React.FC<PublicPromptCardProps> = ({
  prompt,
  onUse,
  onSave,
  onReport,
  isReporting,
  onSubmitReport,
  onCancelReport,
  isRating,
  onRequestRate,
  onSubmitRating,
  onCancelRate,
}) => {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 hover:border-border hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-1">
            {prompt.title}
          </h4>
          {prompt.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {prompt.description}
            </p>
          )}
        </div>
      </div>

      {/* Prompt preview */}
      <p className="mt-2 text-xs text-muted-foreground/80 leading-relaxed line-clamp-2 font-mono">
        {truncate(prompt.promptText, 120)}
      </p>

      {/* Stats */}
      <div className="flex items-center gap-3 mt-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Bookmark className="w-3 h-3" />
          {formatCount(prompt.saveCount)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Star className="w-3 h-3" />
          {prompt.ratingAverage?.toFixed(1) ?? "—"}
        </span>
      </div>

      {/* Inline rating row */}
      {isRating && (
        <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-border/30">
          <span className="text-[11px] text-muted-foreground mr-1">Rate:</span>
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              onClick={() => onSubmitRating(r)}
              className="p-0.5 hover:text-yellow-500 transition-colors"
            >
              <Star className="w-4 h-4" />
            </button>
          ))}
          <button
            onClick={onCancelRate}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Report confirmation row */}
      {isReporting && (
        <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-border/30">
          <span className="text-[11px] text-muted-foreground">Report this prompt?</span>
          <button
            onClick={onSubmitReport}
            className="text-[11px] font-medium text-destructive hover:underline"
          >
            Confirm
          </button>
          <button
            onClick={onCancelReport}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Actions */}
      {!isReporting && !isRating && (
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/30">
          <button
            onClick={onUse}
            className="px-3 py-1.5 text-xs font-semibold bg-primary/10 text-primary rounded-md hover:bg-primary hover:text-primary-foreground transition-all"
          >
            Use
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1.5 text-xs font-medium bg-secondary/50 text-foreground rounded-md hover:bg-secondary/80 transition-colors inline-flex items-center gap-1"
          >
            <Bookmark className="w-3 h-3" />
            Save
          </button>
          <button
            onClick={onRequestRate}
            className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <Star className="w-3 h-3" />
          </button>
          <button
            onClick={onReport}
            className="ml-auto px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
            title="Report"
          >
            <Flag className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

// ── My Prompts List ────────────────────────────────────────────────────

interface MyPromptsListProps {
  studioTool: StudioTool;
  onApplyPrompt: (text: string) => void;
}

const MyPromptsList: React.FC<MyPromptsListProps> = ({ studioTool, onApplyPrompt }) => {
  const result = useMyPrompts(studioTool);
  const publishPrompt = usePublishPrompt();
  const unpublishPrompt = useUnpublishPrompt();
  const deletePrompt = useDeletePrompt();
  const { success, error: showError } = useToast();

  const prompts: PublicPrompt[] = (result?.page as PublicPrompt[] | undefined) ?? [];
  const isLoading = result === undefined;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading your prompts...</p>
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center opacity-50">
        <Bookmark className="w-8 h-8 mb-3" />
        <p className="text-sm italic">You haven&apos;t saved any prompts yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Browse the Public tab to discover and save prompts
        </p>
      </div>
    );
  }

  const handlePublish = async (id: Id<"studioPrompts">) => {
    try {
      await publishPrompt(id);
      success("Prompt published");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to publish");
    }
  };

  const handleUnpublish = async (id: Id<"studioPrompts">) => {
    try {
      await unpublishPrompt(id);
      success("Prompt unpublished");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to unpublish");
    }
  };

  const handleDelete = async (id: Id<"studioPrompts">) => {
    try {
      await deletePrompt(id);
      success("Prompt deleted");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="p-5 space-y-3">
      {prompts.map((prompt: PublicPrompt) => (
        <div
          key={prompt._id}
          className="rounded-xl border border-border/60 bg-card p-4 hover:border-border hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-1">
                  {prompt.title}
                </h4>
                {prompt.visibility === "public" && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    Public
                  </span>
                )}
                {prompt.sourcePromptId && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                    Saved copy
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground/80 mt-1 font-mono line-clamp-2">
                {truncate(prompt.promptText, 120)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/30">
            <button
              onClick={() => onApplyPrompt(prompt.promptText)}
              className="px-3 py-1.5 text-xs font-semibold bg-primary/10 text-primary rounded-md hover:bg-primary hover:text-primary-foreground transition-all"
            >
              Use
            </button>
            {prompt.visibility === "private" ? (
              <button
                onClick={() => handlePublish(prompt._id)}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                Publish
              </button>
            ) : (
              <button
                onClick={() => handleUnpublish(prompt._id)}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <EyeOff className="w-3 h-3" />
                Unpublish
              </button>
            )}
            <button
              onClick={() => handleDelete(prompt._id)}
              className="ml-auto px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
