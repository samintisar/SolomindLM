import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Brain,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  RotateCw,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlashcardBack,
  FlashcardFront,
} from "@/features/studio/components/flashcards/FlashcardContent";
import { FlipCard } from "@/features/studio/components/flashcards/FlipCard";
import { useDueCards } from "@/features/studio/hooks/useDueCards";
import {
  useAddCard,
  useCardReview,
  useDeleteCard,
  useFlashcard,
  useUpdateCard,
  useUpdateFlashcardPreferences,
  useUpdateFlashcardProgress,
} from "@/features/studio/services/flashcardsApi";
import { Button } from "@/shared/components/ui/button";
import { ButtonGroup } from "@/shared/components/ui/button-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { Progress } from "@/shared/components/ui/progress";
import { Toggle } from "@/shared/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Flashcard, FlashcardNote } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";
import { EditCardModal } from "./EditCardModal";
import { ProficiencyBadge } from "./ProficiencyBadge";
import { type DueFlashcard, StudyMode } from "./StudyMode";

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

  // Due cards for study mode, from the deck already loaded (a deck switch resets to the new note's cards)
  const dueCards = useDueCards(allCards);

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

  const boundedBrowseIndex =
    filteredCards.length === 0 ? 0 : Math.min(Math.max(0, currentIndex), filteredCards.length - 1);
  const currentCard = filteredCards.length > 0 ? filteredCards[boundedBrowseIndex] : undefined;
  const activeStudyCards = mode === "study" ? studySessionCards : dueCards;

  const modeToggles = [
    { value: "browse", name: "Browse Mode", tip: "Browse", icon: <BookOpen /> },
    { value: "study", name: "Study Mode", tip: "Study", icon: <Brain /> },
    { value: "edit", name: "Edit Mode", tip: "Edit", icon: <Edit3 /> },
  ] as const;

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col gap-4 bg-background p-4 animate-in fade-in duration-300 sm:gap-6 sm:p-6 lg:p-8",
        onBack && "pt-16 md:pt-0"
      )}
    >
      {/* Mobile Back Button */}
      {onBack && (mode === "browse" || mode === "study") && (
        <div className="absolute top-0 right-0 left-0 z-20 flex items-center gap-2 border-b border-border bg-background px-4 py-3 md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
          <span className="truncate text-sm font-medium">{note.title}</span>
        </div>
      )}

      {/* Header Controls */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <ButtonGroup variant="tray" aria-label="Mode">
            {modeToggles.map(({ value, name, tip, icon }) => (
              <Tooltip key={value}>
                {/* The trigger overrides the toggle's data-state; the pressed look comes from the tray's aria-pressed styling. */}
                <TooltipTrigger asChild>
                  <Toggle
                    size="sm"
                    pressed={mode === value}
                    onPressedChange={(pressed) => {
                      if (pressed) handleModeChange(value);
                    }}
                    disabled={value === "study" && dueCards.length === 0}
                    aria-label={name}
                  >
                    {icon}
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent>{tip}</TooltipContent>
              </Tooltip>
            ))}
          </ButtonGroup>

          {mode === "browse" && currentCard && <ProficiencyBadge card={currentCard} />}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {mode === "browse" && (
            <ButtonGroup variant="tray" aria-label="Which cards to show">
              <Toggle
                size="sm"
                pressed={!showMastered}
                onPressedChange={(pressed) => {
                  if (pressed) void setShowMasteredPreference(false);
                }}
              >
                <span className="px-1.5">Due</span>
              </Toggle>
              <Toggle
                size="sm"
                pressed={showMastered}
                onPressedChange={(pressed) => {
                  if (pressed) void setShowMasteredPreference(true);
                }}
              >
                <span className="px-1.5">All</span>
              </Toggle>
            </ButtonGroup>
          )}

          {mode === "study" && activeStudyCards.length > 0 && (
            <span className="font-sans text-sm leading-none font-medium text-foreground tabular-nums">
              {activeStudyCards.length}
              <span className="ml-1 font-normal text-muted-foreground">due</span>
            </span>
          )}

          {mode === "edit" && (
            <Button size="sm" onClick={handleAddCard}>
              <Plus />
              Add Card
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
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
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Brain />
              </EmptyMedia>
              <EmptyTitle>All caught up</EmptyTitle>
              <EmptyDescription>
                No cards are due for review right now. Check back later.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => handleModeChange("browse")}>Back to browse</Button>
            </EmptyContent>
          </Empty>
        )}

        {(mode === "browse" || mode === "edit") &&
          filteredCards.length === 0 &&
          displayNote.status === "failed" && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AlertTriangle className="text-destructive" />
                </EmptyMedia>
                <EmptyTitle>Generation failed</EmptyTitle>
                <EmptyDescription>
                  {displayNote.metadata?.error ||
                    "Something went wrong while generating these flashcards."}
                </EmptyDescription>
              </EmptyHeader>
              {onBack && (
                <EmptyContent>
                  <Button onClick={onBack}>Back to Studio to try again</Button>
                </EmptyContent>
              )}
            </Empty>
          )}

        {(mode === "browse" || mode === "edit") &&
          filteredCards.length === 0 &&
          displayNote.status !== "failed" && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BookOpen />
                </EmptyMedia>
                <EmptyTitle>
                  {showMastered ? "No flashcards yet" : "All cards are mastered!"}
                </EmptyTitle>
                <EmptyDescription>
                  {showMastered
                    ? "Cards will show up here once they are added."
                    : "Show all cards to review them."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

        {(mode === "browse" || mode === "edit") && filteredCards.length > 0 && currentCard && (
          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6">
            <FlipCard
              flipped={isFlipped}
              front={<FlashcardFront card={currentCard} />}
              back={<FlashcardBack card={currentCard} />}
              frontFooter={
                <p
                  className={cn(
                    "mt-2 flex shrink-0 items-center gap-1.5 font-sans text-sm",
                    mode === "edit" ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <RotateCw className="size-3 opacity-70" aria-hidden />
                  <span>{mode === "browse" ? "Tap or Space to flip" : "Tap to edit"}</span>
                </p>
              }
              backFooter={
                mode === "browse" ? (
                  <p className="mt-2 flex shrink-0 items-center gap-1.5 font-sans text-sm text-muted-foreground">
                    <RotateCw className="size-3 opacity-70" aria-hidden />
                    <span>Tap or Space to flip back</span>
                  </p>
                ) : undefined
              }
              onActivate={() => {
                if (mode === "browse") {
                  setIsFlipped(!isFlipped);
                } else if (mode === "edit") {
                  handleEditCard(boundedBrowseIndex);
                }
              }}
              label={
                mode === "browse"
                  ? isFlipped
                    ? "Flashcard answer. Press Enter or Space to show question."
                    : "Flashcard question. Press Enter or Space to reveal answer."
                  : "Edit this flashcard"
              }
              tone={mode === "edit" ? "edit" : "default"}
              className="mx-auto max-w-xl"
            />

            {/* Navigation: previous, progress, next */}
            <div className="mx-auto flex w-full max-w-xl shrink-0 flex-col items-stretch gap-2.5">
              <div className="flex items-center gap-3 sm:gap-4">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={handlePrev}
                  aria-label="Previous card"
                >
                  <ChevronLeft />
                </Button>
                <Progress
                  value={((boundedBrowseIndex + 1) / filteredCards.length) * 100}
                  size="sm"
                  aria-label={`Card ${boundedBrowseIndex + 1} of ${filteredCards.length}`}
                  getValueLabel={() => `Card ${boundedBrowseIndex + 1} of ${filteredCards.length}`}
                  className="flex-1"
                />
                <Button variant="secondary" size="icon" onClick={handleNext} aria-label="Next card">
                  <ChevronRight />
                </Button>
              </div>
              <p className="text-center font-sans text-sm text-muted-foreground tabular-nums">
                {boundedBrowseIndex + 1} of {filteredCards.length}
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
    </div>
  );
};
