import React, { useState } from 'react';
import { Sparkles, RotateCw, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import { FlashcardNote } from '@/shared/types/index';

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
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center animate-spin">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <p className="text-muted-foreground font-serif italic">Generating flashcards from your sources...</p>
      </div>
    );

    const currentCard = cards[currentIndex];

    return (
        <div className={`flex flex-col h-full items-center justify-center p-4 sm:p-6 bg-secondary/10 animate-in fade-in slide-in-from-right-4 duration-300 gap-4 sm:gap-6 overflow-y-auto relative ${onBack ? 'md:pt-0 pt-16' : ''}`}>
            {/* Mobile Back Button */}
            {onBack && (
                <div className="md:hidden absolute top-0 left-0 right-0 flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm z-20">
                    <button
                        onClick={onBack}
                        className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground flex items-center justify-center shrink-0"
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
                             <ReactMarkdown
                                 remarkPlugins={[remarkGfm, remarkMath]}
                                 rehypePlugins={[rehypeSanitize, rehypeKatex]}
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
                                 {currentCard.front}
                             </ReactMarkdown>
                         </div>
                         <div className="absolute bottom-4 sm:bottom-6 text-xs text-muted-foreground/50 flex items-center gap-2 shrink-0">
                             <RotateCw className="w-3 h-3" /> Click to flip
                         </div>
                    </div>

                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-secondary rounded-xl flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 text-center overflow-hidden">
                         <span className="text-xs uppercase tracking-widest text-secondary-foreground/60 absolute top-4 sm:top-6 shrink-0">Back</span>
                         <div className="text-base sm:text-lg lg:text-2xl font-medium font-serif text-foreground line-clamp-6 overflow-y-auto max-h-[calc(100%-3rem)] w-full prose prose-stone dark:prose-invert max-w-none">
                             <ReactMarkdown
                                 remarkPlugins={[remarkGfm, remarkMath]}
                                 rehypePlugins={[rehypeSanitize, rehypeKatex]}
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
                                 {currentCard.back}
                             </ReactMarkdown>
                         </div>
                    </div>

                </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                <button onClick={handlePrev} className="p-2 sm:p-3 rounded-full hover:bg-card border border-transparent hover:border-border transition-all shrink-0">
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <span className="font-mono text-xs sm:text-sm font-medium whitespace-nowrap">
                    {currentIndex + 1} / {cards.length}
                </span>
                <button onClick={handleNext} className="p-2 sm:p-3 rounded-full hover:bg-card border border-transparent hover:border-border transition-all shrink-0">
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
