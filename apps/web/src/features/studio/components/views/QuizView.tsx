import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Lightbulb,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Info,
  Eye,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { QuizNote } from '@/shared/types/index';
import { quizzesApi } from '@/features/studio/services/quizzesApi';

export interface QuizViewProps {
  note: QuizNote;
  onNoteUpdate?: (note: QuizNote) => void;
}

export const QuizView: React.FC<QuizViewProps> = ({ note, onNoteUpdate }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState<Record<number, number>>(note.userAnswers || {});
    const [showResults, setShowResults] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const [reviewMode, setReviewMode] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    // Sync userAnswers with note.userAnswers
    useEffect(() => {
        if (note.userAnswers) {
            setUserAnswers(note.userAnswers);
        }
    }, [note.userAnswers]);

    const questions = note.questions;
    const currentQuestion = questions[currentIndex];

    // Derived state
    const isAnswered = userAnswers[currentIndex] !== undefined;
    const selectedOption = userAnswers[currentIndex] ?? null;

    const handleSelect = async (index: number) => {
        if (isAnswered || reviewMode) return;

        // Update local state immediately for responsiveness
        setUserAnswers(prev => ({...prev, [currentIndex]: index}));

        // Submit to server in the background
        try {
            await quizzesApi.submitAnswer(note.id, currentIndex, index);
            // Optionally refresh the note to get updated data
            // We can do this silently or wait for next sync
        } catch (error) {
            console.error('Failed to submit answer:', error);
            // Revert the local state on error
            setUserAnswers(prev => {
                const newState = { ...prev };
                delete newState[currentIndex];
                return newState;
            });
        }
    };

    const handleNext = () => {
        setShowHint(false);
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            setShowResults(true);
        }
    };

    const handlePrev = () => {
        setShowHint(false);
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const resetQuiz = async () => {
        setIsResetting(true);
        try {
            // Call API to reset all answers on the server
            const updatedNote = await quizzesApi.resetAnswers(note.id);
            if (onNoteUpdate) {
                onNoteUpdate(updatedNote);
            }
            // Reset local state
            setCurrentIndex(0);
            setUserAnswers({});
            setShowResults(false);
            setShowHint(false);
            setReviewMode(false);
        } catch (error) {
            console.error('Failed to reset answers:', error);
            alert(error instanceof Error ? error.message : 'Failed to reset answers');
        } finally {
            setIsResetting(false);
        }
    };

    const reviewQuiz = () => {
        setCurrentIndex(0);
        setShowResults(false);
        setReviewMode(true);
        setShowHint(false);
    };

    if (questions.length === 0) return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center animate-spin">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <p className="text-muted-foreground font-serif italic">Generating quiz from your sources...</p>
      </div>
    );

    if (showResults) {
        const score = Object.entries(userAnswers).reduce((acc, [qIdx, aIdx]) => {
            return acc + (questions[parseInt(qIdx)].answer === aIdx ? 1 : 0);
        }, 0);

        return (
            <div className="flex flex-col h-full items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center space-y-6 max-w-md w-full bg-card p-10 rounded-2xl border border-border shadow-lg">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                        <Sparkles className="w-10 h-10" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold font-serif mb-2">Quiz Complete!</h3>
                        <p className="text-muted-foreground">You scored {score} out of {questions.length}</p>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                        <div
                            className="bg-primary h-full transition-all duration-1000 ease-out"
                            style={{ width: `${((score / questions.length) * 100)}%` }}
                        />
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={reviewQuiz}
                            className="flex-1 py-3 bg-secondary text-secondary-foreground font-bold rounded-lg hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
                        >
                            <Eye className="w-4 h-4" />
                            Review
                        </button>
                        <button
                            onClick={resetQuiz}
                            disabled={isResetting}
                            className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isResetting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                    Resetting...
                                </>
                            ) : (
                                'Try Again'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300 relative">
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto w-full p-8 md:p-12 min-h-full flex flex-col">
                    {/* Review Mode Banner */}
                    {reviewMode && (
                        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-3">
                            <Eye className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0" />
                            <div>
                                <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                                    Review Mode
                                </span>
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                    You are viewing your previous answers. Selection is disabled.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="mb-8">
                        <div className="flex justify-between text-[10px] md:text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 font-sans">
                            <span>Question {currentIndex + 1}</span>
                            <span>{questions.length} Total</span>
                        </div>
                        <div className="w-full bg-secondary/50 rounded-full h-1.5 overflow-hidden">
                            <div
                                className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                            />
                        </div>
                    </div>

                    <div className="w-full prose prose-stone dark:prose-invert max-w-none font-serif leading-relaxed text-foreground mb-10 text-lg md:text-2xl">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
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
                            {currentQuestion.question}
                        </ReactMarkdown>
                    </div>

                    <div className="space-y-4 flex-1 pb-10">
                        {currentQuestion.options.map((option, idx) => {
                            let stateStyles = "border-border hover:bg-secondary/50 hover:border-primary/50";

                            if (isAnswered || reviewMode) {
                                if (idx === currentQuestion.answer) {
                                    stateStyles = "bg-green-500/25 border-green-600 text-green-700 dark:text-green-400";
                                } else if (idx === selectedOption) {
                                    stateStyles = "bg-destructive/25 border-destructive text-destructive";
                                } else {
                                    stateStyles = "opacity-50 border-border";
                                }
                            } else if (selectedOption === idx) {
                                stateStyles = "border-primary bg-primary/5";
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleSelect(idx)}
                                    disabled={isAnswered || reviewMode}
                                    className={`w-full text-left p-5 md:p-6 rounded-xl border-2 transition-all flex items-center justify-between group ${stateStyles} ${reviewMode ? 'cursor-not-allowed' : ''}`}
                                >
                                    <div className="flex-1 prose prose-stone dark:prose-invert max-w-none font-serif text-base md:text-lg">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm, remarkMath]}
                                            rehypePlugins={[rehypeKatex]}
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
                                                p: ({ children }) => <span className="font-medium">{children}</span>,
                                            }}
                                        >
                                            {option}
                                        </ReactMarkdown>
                                    </div>
                                    {isAnswered && idx === currentQuestion.answer && <CheckCircle2 className="w-5 h-5 text-success" />}
                                    {isAnswered && idx === selectedOption && idx !== currentQuestion.answer && <XCircle className="w-5 h-5 text-destructive" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Explanation shown after answering */}
                    {isAnswered && (
                        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <span className="font-semibold text-sm text-blue-800 dark:text-blue-200">Explanation</span>
                                    <div className="text-sm text-blue-700 dark:text-blue-300 mt-1.5 leading-relaxed prose prose-sm prose-stone dark:prose-invert max-w-none">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm, remarkMath]}
                                            rehypePlugins={[rehypeKatex]}
                                            components={{
                                                img: () => null,
                                                a: ({ node, children, ...props }) => <span className="text-blue-700 dark:text-blue-300">{children}</span>,
                                                video: () => null,
                                                audio: () => null,
                                                iframe: () => null,
                                                table: ({ children }) => <table className="w-full border-collapse border border-blue-300 dark:border-blue-600 rounded-lg overflow-hidden">{children}</table>,
                                                thead: ({ children }) => <thead className="bg-blue-200/50 dark:bg-blue-800/50">{children}</thead>,
                                                tbody: ({ children }) => <tbody>{children}</tbody>,
                                                tr: ({ children }) => <tr className="border-b border-blue-300 dark:border-blue-600">{children}</tr>,
                                                th: ({ children }) => <th className="px-4 py-2 text-left font-semibold text-blue-800 dark:text-blue-200 border-r border-blue-300 dark:border-blue-600 last:border-r-0">{children}</th>,
                                                td: ({ children }) => <td className="px-4 py-2 text-blue-700 dark:text-blue-300 border-r border-blue-300 dark:border-blue-600 last:border-r-0">{children}</td>,
                                                p: ({ children }) => <p className="text-sm text-blue-700 dark:text-blue-300">{children}</p>,
                                            }}
                                        >
                                            {currentQuestion.explanation}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="shrink-0 p-4 md:px-12 md:py-6 border-t border-border bg-background/80 backdrop-blur-md z-10">
                <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
                    {!reviewMode && (
                    <div className="relative">
                        <button
                            onClick={() => setShowHint(!showHint)}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 hover:bg-secondary text-sm font-medium transition-colors text-muted-foreground hover:text-foreground"
                        >
                           <Lightbulb className="w-4 h-4" />
                           <span>Hint</span>
                           <ChevronUp className={`w-3 h-3 transition-transform ${showHint ? 'rotate-180' : ''}`} />
                        </button>
                        {showHint && (
                             <div className="absolute bottom-full left-0 mb-3 w-72 p-4 bg-popover border border-border rounded-xl shadow-xl text-sm leading-relaxed animate-in fade-in slide-in-from-bottom-2 z-20">
                                 <span className="font-bold block mb-1 text-xs uppercase tracking-wide text-primary">Hint</span>
                                 {currentQuestion.hint || "Try to recall the definition from your notes."}
                             </div>
                        )}
                    </div>
                    )}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePrev}
                            disabled={currentIndex === 0}
                            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
                        >
                            Previous
                        </button>
                        <button
                            onClick={handleNext}
                            className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-full hover:bg-primary/90 transition-all shadow-md active:translate-y-0.5 min-w-[100px]"
                        >
                             {currentIndex === questions.length - 1 ? "Finish" : "Next"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
