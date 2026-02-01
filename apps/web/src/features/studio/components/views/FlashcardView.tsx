import React, { useState, lazy, Suspense } from 'react';
import { RotateCw, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { FlashcardNote } from '@/shared/types/index';
import { sanitizeMarkdown } from '@/shared/utils';

const MarkdownRenderer = lazy(() =>
  import('@/shared/components/MarkdownRenderer').then((m) => ({ default: m.default }))
);

export interface FlashcardViewProps {
  note: FlashcardNote;
  onBack?: () => void;
}

export const FlashcardView: React.FC<FlashcardViewProps> = ({ note, onBack }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const cards = note.flashcards;

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
        <p className="text-muted-foreground font-serif italic">No flashcards available</p>
      </div>
    );

    const currentCard = cards[currentIndex];

    return (
        <div className={`flex flex-col h-full items-center justify-center p-4 sm:p-6 bg-secondary/10 animate-in fade-in slide-in-from-right-4 duration-300 gap-4 sm:gap-6 relative ${onBack ? 'md:pt-0 pt-16' : ''}`}>
            {/* Mobile Back Button */}
            {onBack && (
                <div className="md:hidden absolute top-0 left-0 right-0 flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm z-20">
                    <button
                        onClick={onBack}
                        className="p-1.5 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition-colors transition-transform text-foreground flex items-center justify-center shrink-0 touch-manipulation"
                        aria-label="Back to Studio"
                    >
                        <ArrowLeft className="w-5 h-5 shrink-0" />
                    </button>
                    <span className="text-sm font-semibold text-foreground truncate">{note.title}</span>
                </div>
            )}
            <div className="w-full max-w-lg min-h-0 shrink-0 perspective-1000 group cursor-pointer" style={{ aspectRatio: '3 / 2' }} onClick={() => setIsFlipped(!isFlipped)}>
                <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d shadow-xl rounded-xl border border-border ${isFlipped ? 'rotate-y-180' : ''}`}>

                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-card rounded-xl flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 text-center">
                         <span className="text-xs uppercase tracking-widest text-muted-foreground absolute top-4 sm:top-6 shrink-0">Front</span>
                         <div className="text-base sm:text-lg lg:text-2xl font-bold font-serif text-foreground line-clamp-6 overflow-y-auto max-h-[calc(100%-3rem)] w-full prose prose-stone dark:prose-invert max-w-none">
                             <Suspense fallback={<div className="animate-pulse h-5 bg-secondary/30 rounded w-full" />}>
                                 <MarkdownRenderer
                                     components={{
                                         img: () => null,
                                         a: ({ node, children, ...props }) => <span className="text-foreground">{children}</span>,
                                         video: () => null,
                                         audio: () => null,
                                         iframe: () => null,
                                         table: ({ children }) => <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">{children}</table>,
                                         thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
                                         tbody: ({ children }) => <tbody>{children}</tbody>,
                                         tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
                                         th: ({ children }) => <th className="px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0">{children}</th>,
                                         td: ({ children }) => <td className="px-4 py-2 text-foreground border-r border-border last:border-r-0">{children}</td>,
                                     }}
                                 >
                                     {sanitizeMarkdown(currentCard.front)}
                                 </MarkdownRenderer>
                             </Suspense>
                         </div>
                         <div className="absolute bottom-4 sm:bottom-6 text-xs text-muted-foreground/50 flex items-center gap-2 shrink-0">
                             <RotateCw className="w-3 h-3" /> Click to flip
                         </div>
                    </div>

                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-secondary rounded-xl flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 text-center overflow-hidden">
                         <span className="text-xs uppercase tracking-widest text-secondary-foreground/60 absolute top-4 sm:top-6 shrink-0">Back</span>
                         <div className="text-base sm:text-lg lg:text-2xl font-medium font-serif text-foreground line-clamp-6 overflow-y-auto max-h-[calc(100%-3rem)] w-full prose prose-stone dark:prose-invert max-w-none">
                             <Suspense fallback={<div className="animate-pulse h-5 bg-secondary/30 rounded w-full" />}>
                                 <MarkdownRenderer
                                     components={{
                                         img: () => null,
                                         a: ({ node, children, ...props }) => <span className="text-foreground">{children}</span>,
                                         video: () => null,
                                         audio: () => null,
                                         iframe: () => null,
                                         table: ({ children }) => <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">{children}</table>,
                                         thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
                                         tbody: ({ children }) => <tbody>{children}</tbody>,
                                         tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
                                         th: ({ children }) => <th className="px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0">{children}</th>,
                                         td: ({ children }) => <td className="px-4 py-2 text-foreground border-r border-border last:border-r-0">{children}</td>,
                                     }}
                                 >
                                     {sanitizeMarkdown(currentCard.back)}
                                 </MarkdownRenderer>
                             </Suspense>
                         </div>
                    </div>

                </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                <button onClick={handlePrev} className="p-2 sm:p-3 rounded-full hover:bg-card active:bg-card/80 active:scale-[0.97] border border-transparent hover:border-border transition-all shrink-0 touch-manipulation">
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <span className="font-mono text-xs sm:text-sm font-medium whitespace-nowrap">
                    {currentIndex + 1} / {cards.length}
                </span>
                <button onClick={handleNext} className="p-2 sm:p-3 rounded-full hover:bg-card active:bg-card/80 active:scale-[0.97] border border-transparent hover:border-border transition-all shrink-0 touch-manipulation">
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
