import React, { useState } from 'react';
import { Sparkles, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Note } from '@/shared/types/index';

export interface FlashcardViewProps {
  note: Note;
}

export const FlashcardView: React.FC<FlashcardViewProps> = ({ note }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const cards = note.flashcards || [];

    const handleNext = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex((prev) => (prev + 1) % cards.length), 200);
    };

    const handlePrev = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length), 200);
    };

    if (cards.length === 0) return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center animate-spin">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <p className="text-muted-foreground font-serif italic">Generating flashcards from your sources...</p>
      </div>
    );

    const currentCard = cards[currentIndex];

    return (
        <div className="flex flex-col h-full items-center justify-center p-4 sm:p-6 bg-secondary/10 animate-in fade-in slide-in-from-right-4 duration-300 gap-4 sm:gap-6 overflow-y-auto">
            <div className="w-full max-w-lg min-h-0 flex-shrink-0 perspective-1000 group cursor-pointer" style={{ aspectRatio: '3 / 2' }} onClick={() => setIsFlipped(!isFlipped)}>
                <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d shadow-xl rounded-xl border border-border ${isFlipped ? 'rotate-y-180' : ''}`}>

                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-card rounded-xl flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 text-center">
                         <span className="text-xs uppercase tracking-widest text-muted-foreground absolute top-4 sm:top-6 flex-shrink-0">Front</span>
                         <p className="text-base sm:text-lg lg:text-2xl font-bold font-serif text-foreground line-clamp-6 overflow-y-auto max-h-[calc(100%-3rem)]">{currentCard.front}</p>
                         <div className="absolute bottom-4 sm:bottom-6 text-xs text-muted-foreground/50 flex items-center gap-2 flex-shrink-0">
                             <RotateCw className="w-3 h-3" /> Click to flip
                         </div>
                    </div>

                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-primary/5 rounded-xl flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 text-center border-2 border-primary/20 overflow-hidden">
                         <span className="text-xs uppercase tracking-widest text-primary/70 absolute top-4 sm:top-6 flex-shrink-0">Back</span>
                         <p className="text-base sm:text-lg lg:text-2xl font-medium font-serif text-foreground line-clamp-6 overflow-y-auto max-h-[calc(100%-3rem)]">{currentCard.back}</p>
                    </div>

                </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
                <button onClick={handlePrev} className="p-2 sm:p-3 rounded-full hover:bg-card border border-transparent hover:border-border transition-all flex-shrink-0">
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <span className="font-mono text-xs sm:text-sm font-medium whitespace-nowrap">
                    {currentIndex + 1} / {cards.length}
                </span>
                <button onClick={handleNext} className="p-2 sm:p-3 rounded-full hover:bg-card border border-transparent hover:border-border transition-all flex-shrink-0">
                    <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
            </div>

             <style>{`
                .perspective-1000 { perspective: 1000px; }
                .transform-style-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
            `}</style>
        </div>
    );
};
