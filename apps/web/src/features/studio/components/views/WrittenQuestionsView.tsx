import React, { useState, useEffect } from 'react';
import {
  MessageSquareText,
  CheckCircle2,
  Award,
  AlertCircle,
  Eye,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { WrittenQuestionsNote, WrittenQuestionAnswer } from '@/shared/types/index';
import { writtenQuestionsApi } from '@/features/studio/services/writtenQuestionsApi';

export interface WrittenQuestionsViewProps {
  note: WrittenQuestionsNote;
  onNoteUpdate?: (note: WrittenQuestionsNote) => void;
}

export const WrittenQuestionsView: React.FC<WrittenQuestionsViewProps> = ({ note, onNoteUpdate }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, WrittenQuestionAnswer>>(note.userAnswers || {});
  const [showResults, setShowResults] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Sync userAnswers with note.userAnswers
  useEffect(() => {
    if (note.userAnswers) {
      setUserAnswers(note.userAnswers);
    }
  }, [note.userAnswers]);

  // Use questions from the note
  const questions = note.questions || [];
  const currentQuestion = questions[currentIndex];

  // If no questions, show loading state
  if (questions.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Generating questions...</p>
        </div>
      </div>
    );
  }

  const currentAnswer = userAnswers[currentQuestion.id]?.answer || '';
  const currentGradedResult = userAnswers[currentQuestion.id]?.graded
    ? {
        score: userAnswers[currentQuestion.id].score || 0,
        maxScore: userAnswers[currentQuestion.id].maxScore || 0,
        feedback: userAnswers[currentQuestion.id].feedback || '',
        strengths: userAnswers[currentQuestion.id].strengths || [],
        improvements: userAnswers[currentQuestion.id].improvements || [],
      }
    : undefined;

  // Check if current question is answered
  const isAnswered = currentAnswer.trim().length > 0;
  const isGraded = !!currentGradedResult;

  // Calculate total progress
  const answeredCount = Object.keys(userAnswers).filter((qid) => userAnswers[qid]?.answer?.trim().length > 0).length;
  const totalCount = questions.length;

  const handleSubmitAnswer = async () => {
    if (!isAnswered || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Submit answer for grading
      await writtenQuestionsApi.submitAnswer({
        writtenQuestionsId: note.id,
        questionId: currentQuestion.id,
        answer: currentAnswer,
      });

      // Poll for graded result
      await writtenQuestionsApi.pollGradedResult(
        note.id,
        currentQuestion.id,
        (graded) => {
          // Optionally show polling state
          console.log('Grading status:', graded ? 'Complete' : 'In progress...');
        }
      );

      // Refresh the note to get the graded result
      const updatedNote = await writtenQuestionsApi.getWrittenQuestions(note.id);
      if (onNoteUpdate) {
        onNoteUpdate(updatedNote);
      }
    } catch (error) {
      console.error('Failed to submit answer:', error);
      alert(error instanceof Error ? error.message : 'Failed to submit answer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowResults(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleAnswerChange = (answer: string) => {
    setUserAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: { ...(prev[currentQuestion.id] || { answer: '', graded: false }), answer },
    }));
  };

  const resetQuestions = async () => {
    setIsResetting(true);
    try {
      // Call API to reset all answers on the server
      const updatedNote = await writtenQuestionsApi.resetAnswers(note.id);
      if (onNoteUpdate) {
        onNoteUpdate(updatedNote);
      }
      // Reset local state
      setCurrentIndex(0);
      setShowResults(false);
      setReviewMode(false);
      setUserAnswers({});
    } catch (error) {
      console.error('Failed to reset answers:', error);
      alert(error instanceof Error ? error.message : 'Failed to reset answers');
    } finally {
      setIsResetting(false);
    }
  };

  const reviewAnswers = () => {
    setCurrentIndex(0);
    setShowResults(false);
    setReviewMode(true);
  };

  // Calculate final score
  const calculateTotalScore = () => {
    let totalScore = 0;

    // Sum up scores from graded answers only
    Object.values(userAnswers).forEach((answerObj) => {
      if (answerObj?.graded) {
        totalScore += answerObj.score || 0;
      }
    });

    // Calculate total possible points from ALL questions, not just answered ones
    const maxTotalScore = questions.reduce((sum, q) => sum + (q.rubric?.maxPoints || 0), 0);

    return { score: totalScore, maxScore: maxTotalScore };
  };

  if (showResults) {
    const { score, maxScore } = calculateTotalScore();
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    return (
      <div className="flex flex-col h-full items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center space-y-6 max-w-md w-full bg-card p-10 rounded-2xl border border-border shadow-lg">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
            <Award className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-2xl font-bold font-serif mb-2">Assessment Complete!</h3>
            <p className="text-muted-foreground">
              You scored {score} out of {maxScore} points
            </p>
          </div>
          <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-1000 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="text-sm text-muted-foreground">{percentage}%</div>
          <div className="flex gap-3">
            <button
              onClick={reviewAnswers}
              className="flex-1 py-3 bg-secondary text-secondary-foreground font-bold rounded-lg hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Review
            </button>
            <button
              onClick={resetQuestions}
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
        <div className="max-w-3xl mx-auto w-full p-8 md:p-12 min-h-full flex flex-col">
          {/* Review Mode Banner */}
          {reviewMode && (
            <div className="mb-6 p-4 bg-vintage-amber-50 dark:bg-vintage-amber-900/20 border border-vintage-amber-200 dark:border-vintage-amber-800 rounded-xl flex items-center gap-3">
              <Eye className="w-5 h-5 text-vintage-amber-700 dark:text-vintage-amber-300 shrink-0" />
              <div>
                <span className="text-sm font-semibold text-vintage-amber-800 dark:text-vintage-amber-200">
                  Review Mode
                </span>
                <p className="text-xs text-vintage-amber-700 dark:text-vintage-amber-300">
                  You are viewing your previous answers. Editing is disabled.
                </p>
              </div>
            </div>
          )}

          {/* Progress Header */}
          <div className="mb-8">
            <div className="flex justify-between text-[10px] md:text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 font-sans">
              <span>Question {currentIndex + 1}</span>
              <span>
                {answeredCount} of {totalCount} Answered
              </span>
            </div>
            <div className="w-full bg-secondary/50 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Question Type Badge */}
          <div className="mb-4">
            {currentQuestion.questionType === 'short' ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-foreground border border-border">
                <MessageSquareText className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide">SHORT ANSWER</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-foreground border border-border">
                <MessageSquareText className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide">ESSAY</span>
                <span className="text-xs font-semibold text-muted-foreground ml-1">
                  {currentQuestion.rubric.maxPoints} pts
                </span>
              </div>
            )}
          </div>

          {/* Question */}
          <div className="w-full prose prose-stone dark:prose-invert max-w-none font-serif leading-relaxed text-foreground mb-6 text-lg md:text-xl">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                img: () => null,
                a: ({ node, children, ...props }) => <span className="text-foreground">{children}</span>,
                video: () => null,
                audio: () => null,
                iframe: () => null,
                table: ({ children }) => (
                  <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">{children}</table>
                ),
                thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
                th: ({ children }) => (
                  <th className="px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-4 py-2 text-foreground border-r border-border last:border-r-0">{children}</td>
                ),
              }}
            >
              {currentQuestion.question}
            </ReactMarkdown>
          </div>

          {/* Answer Input or Graded Result */}
          {!isGraded ? (
            <div className="flex-1 flex flex-col">
              <textarea
                value={currentAnswer}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder={
                  currentQuestion.questionType === 'short'
                    ? 'Type your short answer here (1-3 sentences)...'
                    : 'Type your detailed answer here...'
                }
                disabled={reviewMode}
                className={`flex-1 w-full bg-background border-2 rounded-xl p-6 text-base leading-relaxed font-serif focus:outline-none focus:ring-1 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground/40 ${
                  isAnswered ? 'border-primary' : 'border-border'
                } ${reviewMode ? 'opacity-70 cursor-not-allowed bg-muted/30' : ''}`}
                style={{ minHeight: currentQuestion.questionType === 'short' ? '120px' : '280px' }}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 font-mono">
                <span>{currentAnswer.length} characters</span>
                <span>{currentAnswer.split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>
          ) : (
            /* Graded Result Display */
            <div className="flex-1 space-y-4">
              {/* Score Banner */}
              <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                    <div>
                      <span className="text-sm font-semibold text-primary">Answer Graded</span>
                      <div className="text-2xl font-bold text-primary mt-0.5">
                        {currentGradedResult.score} / {currentGradedResult.maxScore}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Score</div>
                    <div className="text-lg font-bold text-foreground">
                      {Math.round((currentGradedResult.score / currentGradedResult.maxScore) * 100)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Your Answer */}
              <div className="p-4 bg-secondary/30 rounded-xl border border-border">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your Answer</span>
                <div className="mt-2 text-base leading-relaxed text-foreground whitespace-pre-wrap font-serif">
                  {userAnswers[currentQuestion.id]?.answer || ''}
                </div>
              </div>

              {/* Feedback */}
              <div className="p-4 bg-vintage-blue-50 dark:bg-vintage-blue-50 rounded-xl border border-vintage-blue-200 dark:border-vintage-blue-200">
                <span className="text-sm font-bold uppercase tracking-wide text-vintage-blue-700 dark:text-vintage-blue-700">
                  Feedback
                </span>
                <div className="mt-2 text-base leading-relaxed text-vintage-blue-700 dark:text-vintage-blue-700">
                  {currentGradedResult.feedback}
                </div>
              </div>

              {/* Strengths */}
              {currentGradedResult.strengths && currentGradedResult.strengths.length > 0 && (
                <div className="p-4 bg-vintage-green-50 dark:bg-vintage-green-50 rounded-xl border border-vintage-green-200 dark:border-vintage-green-200">
                  <span className="text-sm font-bold uppercase tracking-wide text-vintage-green-700 dark:text-vintage-green-700">
                    Strengths
                  </span>
                  <ul className="mt-2 space-y-2">
                    {currentGradedResult.strengths.map((strength, idx) => (
                      <li key={idx} className="text-base text-vintage-green-700 dark:text-vintage-green-700 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-1" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improvements */}
              {currentGradedResult.improvements && currentGradedResult.improvements.length > 0 && (
                <div className="p-4 bg-vintage-orange-50 dark:bg-vintage-orange-50 rounded-xl border border-vintage-orange-200 dark:border-vintage-orange-200">
                  <span className="text-sm font-bold uppercase tracking-wide text-vintage-orange-700 dark:text-vintage-orange-700">
                    Areas for Improvement
                  </span>
                  <ul className="mt-2 space-y-2">
                    {currentGradedResult.improvements.map((improvement, idx) => (
                      <li key={idx} className="text-base text-vintage-orange-700 dark:text-vintage-orange-700 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-1" />
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="shrink-0 p-4 md:px-12 md:py-6 border-t border-border bg-background/80 backdrop-blur-md z-10">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between">
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
              {currentIndex === questions.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>

          {!isGraded && !reviewMode && (
            <button
              onClick={handleSubmitAnswer}
              disabled={!isAnswered || isSubmitting}
              className="px-6 py-2 bg-vintage-green-600 hover:bg-vintage-green-700 text-white text-sm font-bold rounded-full transition-all shadow-md active:translate-y-0.5 min-w-[100px] disabled:opacity-50 disabled:hover:bg-vintage-green-600 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Grading...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Submit
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
