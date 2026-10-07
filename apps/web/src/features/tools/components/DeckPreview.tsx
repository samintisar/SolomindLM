import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { useState } from "react";
import {
  FlashcardBack,
  FlashcardFront,
} from "@/features/studio/components/flashcards/FlashcardContent";
import { FlipCard } from "@/features/studio/components/flashcards/FlipCard";
import { Button } from "@/shared/components/ui/button";
import type { FreeDeckCard } from "../lib/freeToolClient";

function FlipHint({ children }: { children: string }) {
  return (
    <p className="mt-2 flex shrink-0 items-center gap-1.5 font-sans text-sm text-muted-foreground">
      <RotateCw className="size-3 opacity-70" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** One flip card with prev/next, then the whole deck as a list. */
export function DeckPreview({ cards }: { cards: FreeDeckCard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index];

  const go = (next: number) => {
    setIndex((next + cards.length) % cards.length);
    setFlipped(false);
  };

  return (
    <div className="space-y-6">
      <FlipCard
        className="mx-auto max-w-xl"
        flipped={flipped}
        onActivate={() => setFlipped((value) => !value)}
        label={`Card ${index + 1} of ${cards.length}`}
        front={<FlashcardFront card={card} />}
        back={<FlashcardBack card={card} />}
        frontFooter={<FlipHint>Tap or Space to flip</FlipHint>}
        backFooter={<FlipHint>Tap or Space to flip back</FlipHint>}
      />
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous card"
          onClick={() => go(index - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          {index + 1} / {cards.length}
        </span>
        <Button variant="ghost" size="icon" aria-label="Next card" onClick={() => go(index + 1)}>
          <ChevronRight />
        </Button>
      </div>
      <ol className="divide-y divide-border/50 rounded-2xl bg-card shadow-xs ring-1 ring-hairline">
        {cards.map((c, i) => (
          <li key={`${i}-${c.front}`} className="grid gap-1 px-5 py-4 sm:grid-cols-2 sm:gap-6">
            <p className="text-sm text-foreground">{c.front}</p>
            <p className="text-sm text-muted-foreground">{c.back}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
