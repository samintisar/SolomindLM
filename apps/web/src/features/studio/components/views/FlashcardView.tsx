import {
  ArrowLeft,
  BookOpen,
  Brain,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  RotateCw,
} from "lucide-react";
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  useAddCard,
  useCardReview,
  useDeleteCard,
  useDueCards,
  useFlashcard,
  useUpdateCard,
  useUpdateFlashcardPreferences,
  useUpdateFlashcardProgress,
} from "@/features/studio/services/flashcardsApi";
import { Flashcard, FlashcardNote } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";
import { EditCardModal } from "./EditCardModal";
import { ProficiencyBadge } from "./ProficiencyBadge";
import { type DueFlashcard, StudyMode } from "./StudyMode";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

export interface FlashcardViewProps {
  note: FlashcardNote;
  onBack?: () => void;
}

type ViewMode = "browse" | "study" | "edit";

export const FlashcardView: React.FC<FlashcardViewProps> = ({ note, onBack }) => {
  // State
  const [mode, setMode] = useState<ViewMode>("browse");
  const [showMastered, setShowMastered] = useState((note.metadata as any)?.showMastered ?? false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | undefined>(undefined);
  const [editingCardIndex, setEditingCardIndex] = useState<number | undefined>(undefined);
  const [studySessionCards, setStudySessionCards] = useState<DueFlashcard[]>([]);

  // Hooks
  const latestNote = useFlashcard(note.id);
  const displayNote = latestNote ?? note;
  const allCards = displayNote.flashcards;
  const updateCard = useUpdateCard();
  const addCard = useAddCard();
  const deleteCard = useDeleteCard();
  const updatePreferences = useUpdateFlashcardPreferences();
  const submitCardReview = useCardReview();

  // Due cards for study mode
  const dueCardsData = useDueCards(note.id);
  const dueCards: DueFlashcard[] = useMemo(() => {
    if (!dueCardsData) return [];
    return dueCardsData.map((d: { index: number; card: Flashcard }) => d);
  }, [dueCardsData]);

  // Filter cards based on showMastered preference
  const filteredCards = useMemo(() => {
    if (!showMastered) {
      return allCards.filter((card) => {
        const interval = card.proficiency?.interval || 0;
        return interval < 21;
      });
    }
    return allCards;
  }, [allCards, showMastered]);

  // Initialize currentIndex from note.metadata.lastViewedIndex
  const hasInitializedIndex = useRef(false);

  useEffect(() => {
    if (!hasInitializedIndex.current && displayNote) {
      const savedIndex = (displayNote.metadata as any)?.lastViewedIndex ?? 0;
      const boundedIndex = Math.min(savedIndex, Math.max(0, filteredCards.length - 1));
      if (savedIndex > 0) {
        setCurrentIndex(boundedIndex);
      }
      hasInitializedIndex.current = true;
    }
  }, [displayNote, filteredCards.length]);

  useEffect(() => {
    setCurrentIndex((prev) =>
      filteredCards.length === 0 ? 0 : Math.min(prev, filteredCards.length - 1)
    );
  }, [filteredCards.length]);

  // Persist progress
  const stableCurrentIndex = useMemo(() => currentIndex, [currentIndex]);
  useUpdateFlashcardProgress(note.id, stableCurrentIndex);

  // Sync showMastered with server
  useEffect(() => {
    const serverShowMastered = (latestNote?.metadata as any)?.showMastered;
    if (serverShowMastered !== undefined && serverShowMastered !== showMastered) {
      setShowMastered(serverShowMastered);
    }
  }, [latestNote, showMastered]);

  // Handlers
  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev + 1) % filteredCards.length), 200);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(
      () => setCurrentIndex((prev) => (prev - 1 + filteredCards.length) % filteredCards.length),
      200
    );
  };

  const handleModeChange = (newMode: ViewMode) => {
    if (newMode === "study") {
      setStudySessionCards(dueCards);
    } else {
      setStudySessionCards([]);
    }
    setMode(newMode);
    setIsFlipped(false);
  };

  const setShowMasteredPreference = async (value: boolean) => {
    if (value === showMastered) return;
    setShowMastered(value);
    await updatePreferences(note.id, { showMastered: value });
  };

  const handleEditCard = (index: number) => {
    const cardIndex = allCards.findIndex((card) => card === filteredCards[index]);
    setEditingCard(allCards[cardIndex]);
    setEditingCardIndex(cardIndex);
    setEditModalOpen(true);
  };

  const handleAddCard = () => {
    setEditingCard(undefined);
    setEditingCardIndex(undefined);
    setEditModalOpen(true);
  };

  const handleSaveCard = async (data: { front: string; back: string }) => {
    if (editingCardIndex !== undefined) {
      await updateCard(note.id, editingCardIndex, {
        front: data.front,
        back: data.back,
      });
    } else {
      await addCard(note.id, data);
    }
    setEditModalOpen(false);
    setEditingCard(undefined);
    setEditingCardIndex(undefined);
  };

  const handleDeleteCard = async () => {
    if (editingCardIndex !== undefined) {
      await deleteCard(note.id, editingCardIndex);
      setEditModalOpen(false);
      setEditingCard(undefined);
      setEditingCardIndex(undefined);
      if (currentIndex >= filteredCards.length - 1) {
        setCurrentIndex(Math.max(0, filteredCards.length - 2));
      }
    }
  };

  const handleStudyComplete = (stats: {
    reviewed: number;
    correct: number;
    incorrect: number;
    longestStreak: number;
  }) => {
    console.log("Study complete:", stats);
  };

  const handleRateStudyCard = async (
    cardIndex: number,
    rating: "again" | "hard" | "good" | "easy"
  ) => {
    await submitCardReview(note.id, cardIndex, rating);
  };

  // Render different card types
  const renderCardFront = (card: Flashcard) => {
    const content = sanitizeMarkdown(card.front);

    switch (card.type) {
      case "true-false":
        return (
          <div className="space-y-8 w-full">
            <div className="prose prose-base sm:prose-lg max-w-none text-center">
              <Suspense
                fallback={<div className="animate-pulse h-6 bg-muted rounded w-3/4 mx-auto" />}
              >
                <MarkdownRenderer>{content}</MarkdownRenderer>
              </Suspense>
            </div>
            <div className="flex justify-center gap-16">
              <span className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">
                ✓ True
              </span>
              <span className="text-xl font-semibold text-rose-700 dark:text-rose-400">
                ✗ False
              </span>
            </div>
          </div>
        );

      case "fill-blank":
        return (
          <div className="prose prose-base sm:prose-lg max-w-none text-center w-full">
            <Suspense
              fallback={<div className="animate-pulse h-6 bg-muted rounded w-3/4 mx-auto" />}
            >
              <MarkdownRenderer>{content.replace(/_+/g, "______")}</MarkdownRenderer>
            </Suspense>
          </div>
        );

      default:
        return (
          <div className="prose prose-base sm:prose-lg max-w-none text-center w-full">
            <Suspense
              fallback={<div className="animate-pulse h-6 bg-muted rounded w-3/4 mx-auto" />}
            >
              <MarkdownRenderer>{content}</MarkdownRenderer>
            </Suspense>
          </div>
        );
    }
  };

  const boundedBrowseIndex =
    filteredCards.length === 0 ? 0 : Math.min(Math.max(0, currentIndex), filteredCards.length - 1);
  const currentCard = filteredCards.length > 0 ? filteredCards[boundedBrowseIndex] : undefined;
  const activeStudyCards = mode === "study" ? studySessionCards : dueCards;

  return (
    <div
      className={`flex flex-col h-full min-h-0 p-4 sm:p-6 lg:p-8 bg-background animate-in fade-in duration-300 gap-4 sm:gap-6 relative ${
        onBack ? "md:pt-0 pt-16" : ""
      }`}
    >
      {/* Mobile Back Button */}
      {onBack && (mode === "browse" || mode === "study") && (
        <div className="md:hidden absolute top-0 left-0 right-0 flex items-center gap-2 px-4 py-3 border-b border-border bg-background z-20">
          <button
            onClick={onBack}
            className="p-2 hover:bg-muted active:bg-muted/70 rounded-lg transition-colors"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium truncate">{note.title}</span>
        </div>
      )}

      {/* Header Controls */}
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-xl">
            <button
              type="button"
              onClick={() => handleModeChange("browse")}
              className={`p-2.5 rounded-lg transition-all ${
                mode === "browse"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="Browse Mode"
              aria-label="Browse Mode"
            >
              <BookOpen className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("study")}
              className={`p-2.5 rounded-lg transition-all ${
                (mode as string) === "study"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              disabled={dueCards.length === 0}
              title="Study Mode"
              aria-label="Study Mode"
            >
              <Brain className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("edit")}
              className={`p-2.5 rounded-lg transition-all ${
                mode === "edit"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="Edit Mode"
              aria-label="Edit Mode"
            >
              <Edit3 className="w-4.5 h-4.5" />
            </button>
          </div>

          {mode === "browse" && currentCard && <ProficiencyBadge card={currentCard} />}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {mode === "browse" && (
            <div
              className="flex items-center gap-0.5 p-1 bg-muted/50 rounded-xl"
              role="group"
              aria-label="Which cards to show"
            >
              <button
                type="button"
                onClick={() => void setShowMasteredPreference(false)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-all sm:text-sm ${
                  !showMastered
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Due
              </button>
              <button
                type="button"
                onClick={() => void setShowMasteredPreference(true)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-all sm:text-sm ${
                  showMastered
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                All
              </button>
            </div>
          )}

          {mode === "study" && activeStudyCards.length > 0 && (
            <span className="tabular-nums text-sm font-medium leading-none text-foreground/90">
              {activeStudyCards.length}
              <span className="ml-1 font-normal text-muted-foreground">due</span>
            </span>
          )}

          {mode === "edit" && (
            <button
              type="button"
              onClick={handleAddCard}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Card
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {mode === "study" && activeStudyCards.length > 0 && (
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center pb-1">
            <StudyMode
              cards={activeStudyCards}
              onComplete={handleStudyComplete}
              onRateCard={handleRateStudyCard}
              onExit={() => handleModeChange("browse")}
            />
          </div>
        )}

        {mode === "study" && activeStudyCards.length === 0 && (
          <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/20">
              <Brain className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="mb-2 text-2xl font-semibold">All caught up</h3>
              <p className="text-muted-foreground">
                No cards are due for review right now. Check back later.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleModeChange("browse")}
              className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90"
            >
              Back to browse
            </button>
          </div>
        )}

        {(mode === "browse" || mode === "edit") && filteredCards.length === 0 && (
          <div className="flex min-h-[40vh] flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-lg text-muted-foreground">
              {showMastered
                ? "No flashcards available. Try showing all cards."
                : "No flashcards available. All cards are mastered!"}
            </p>
          </div>
        )}

        {(mode === "browse" || mode === "edit") && filteredCards.length > 0 && currentCard && (
          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6">
            {/* Card Display */}
            <div
              role={mode === "browse" ? "button" : undefined}
              tabIndex={mode === "browse" ? 0 : undefined}
              aria-label={
                mode === "browse"
                  ? isFlipped
                    ? "Flashcard answer. Press Enter or Space to show question."
                    : "Flashcard question. Press Enter or Space to reveal answer."
                  : undefined
              }
              onKeyDown={(e) => {
                if (mode !== "browse") return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsFlipped((f) => !f);
                }
              }}
              className={`w-full max-w-xl mx-auto h-[min(40vh,22rem)] min-h-56 max-h-96 shrink-0 perspective-1000 group cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                mode === "edit" ? "cursor-pointer" : ""
              }`}
              onClick={() => {
                if (mode === "browse") {
                  setIsFlipped(!isFlipped);
                } else if (mode === "edit") {
                  handleEditCard(boundedBrowseIndex);
                }
              }}
            >
              <div
                className={`relative w-full h-full transition-transform duration-700 transform-style-3d shadow-lg rounded-2xl ${
                  isFlipped ? "rotate-y-180" : ""
                } ${mode === "edit" ? "ring-2 ring-primary ring-offset-2" : ""}`}
              >
                {/* Front */}
                <div className="absolute inset-0 backface-hidden bg-card rounded-2xl flex flex-col items-center p-5 sm:p-6 text-center overflow-hidden border border-border">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2 shrink-0">
                    Question
                  </span>
                  <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden text-base sm:text-lg font-medium text-foreground [scrollbar-gutter:stable]">
                    <div className="min-h-full w-full flex flex-col items-center justify-center py-1">
                      {renderCardFront(currentCard)}
                    </div>
                  </div>
                  <p
                    className={`mt-2 flex items-center justify-center gap-1.5 text-sm shrink-0 ${
                      mode === "browse" ? "text-muted-foreground" : "text-primary"
                    }`}
                  >
                    <RotateCw className="h-3 w-3 opacity-70" aria-hidden />
                    <span>{mode === "browse" ? "Tap or Space to flip" : "Tap to edit"}</span>
                  </p>
                </div>

                {/* Back */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-muted/30 rounded-2xl flex flex-col items-center p-5 sm:p-6 text-center overflow-hidden border border-border">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2 shrink-0">
                    Answer
                  </span>
                  <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden text-base sm:text-lg font-medium text-foreground [scrollbar-gutter:stable]">
                    <div className="min-h-full w-full flex flex-col items-center justify-center py-1 prose prose-base sm:prose-lg max-w-none text-center">
                      <Suspense
                        fallback={
                          <div className="animate-pulse h-6 bg-muted rounded w-3/4 mx-auto" />
                        }
                      >
                        <MarkdownRenderer
                          components={{
                            img: () => null,
                            a: ({ children }) => (
                              <span className="text-foreground">{children}</span>
                            ),
                            video: () => null,
                            audio: () => null,
                            iframe: () => null,
                            table: ({ children }) => (
                              <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">
                                {children}
                              </table>
                            ),
                            thead: ({ children }) => (
                              <thead className="bg-muted/50">{children}</thead>
                            ),
                            tbody: ({ children }) => <tbody>{children}</tbody>,
                            tr: ({ children }) => (
                              <tr className="border-b border-border">{children}</tr>
                            ),
                            th: ({ children }) => (
                              <th className="px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="px-4 py-2 text-foreground border-r border-border last:border-r-0">
                                {children}
                              </td>
                            ),
                          }}
                        >
                          {sanitizeMarkdown(currentCard.back)}
                        </MarkdownRenderer>
                      </Suspense>
                    </div>
                  </div>
                  {mode === "browse" && (
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground shrink-0">
                      <RotateCw className="h-3 w-3 opacity-70" aria-hidden />
                      <span>Tap or Space to flip back</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation: progress + circular arrows (distinct from header segments) */}
            <div className="flex w-full max-w-xl mx-auto shrink-0 flex-col items-stretch gap-2.5">
              <div className="flex items-center gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground active:scale-[0.96] touch-manipulation"
                  aria-label="Previous card"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div
                  className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={filteredCards.length}
                  aria-valuenow={boundedBrowseIndex + 1}
                  aria-label={`Card ${boundedBrowseIndex + 1} of ${filteredCards.length}`}
                >
                  <div
                    className="h-full rounded-full bg-foreground/25 transition-[width] duration-300 ease-out dark:bg-foreground/35"
                    style={{
                      width: `${((boundedBrowseIndex + 1) / filteredCards.length) * 100}%`,
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground active:scale-[0.96] touch-manipulation"
                  aria-label="Next card"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <p className="text-center text-sm tabular-nums leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">{boundedBrowseIndex + 1}</span>
                <span className="mx-2 text-base font-light text-foreground/35" aria-hidden>
                  ·
                </span>
                <span className="font-medium text-foreground/85">{filteredCards.length}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Edit Card Modal */}
      <EditCardModal
        isOpen={editModalOpen}
        card={editingCard}
        cardIndex={editingCardIndex}
        onSave={handleSaveCard}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingCard(undefined);
          setEditingCardIndex(undefined);
        }}
        onDelete={editingCardIndex !== undefined ? handleDeleteCard : undefined}
      />

      <style>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
      `}</style>
    </div>
  );
};
