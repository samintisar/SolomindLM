import React, { useState } from "react";
import { X, MessageSquareText, Check } from "lucide-react";
import { StudioModalDiscoverPromptsButton } from "./StudioModalDiscoverPromptsButton";

interface CustomizeWrittenQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: WrittenQuestionsConfig) => void;
  embedded?: boolean;
}

export interface WrittenQuestionsConfig {
  count: "fewer" | "standard" | "more";
  difficulty: "easy" | "medium" | "hard";
  questionType: "short" | "essay";
  focus: string;
}

export const CustomizeWrittenQuestionsModal: React.FC<CustomizeWrittenQuestionsModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  embedded = false,
}) => {
  const [count, setCount] = useState<WrittenQuestionsConfig["count"]>("standard");
  const [difficulty, setDifficulty] = useState<WrittenQuestionsConfig["difficulty"]>("medium");
  const [questionType, setQuestionType] = useState<WrittenQuestionsConfig["questionType"]>("short");
  const [focus, setFocus] = useState("");

  if (!isOpen) return null;

  const overlayClass = embedded
    ? "absolute inset-0 z-50 flex min-h-0 items-center justify-center p-2 sm:p-3 animate-in fade-in duration-200"
    : "fixed inset-0 z-120 flex items-center justify-center p-4 animate-in fade-in duration-200";

  return (
    <div className={overlayClass}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-full min-h-0 w-full max-w-4xl flex-col overflow-x-hidden rounded-xl border border-border bg-card font-sans text-card-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary/50 rounded-lg">
              <MessageSquareText className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-sans tracking-tight">
              Customize Written Questions
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StudioModalDiscoverPromptsButton />
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 transition-colors hover:bg-secondary/50"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-10 space-y-10 bg-card/50">
          <div className="space-y-4">
            <label className="block font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Number of Questions
            </label>
            <div className="flex w-full min-w-0 bg-background border border-border rounded-xl p-1">
              {(["fewer", "standard", "more"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setCount(opt)}
                  className={`
                    flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-all sm:px-3
                    ${
                      count === opt
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }
                  `}
                >
                  {count === opt && <Check className="h-3 w-3 shrink-0" aria-hidden />}
                  <span className="whitespace-nowrap">
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-x-8">
            <div className="space-y-4">
              <label className="block font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Question Type
              </label>
              <div className="flex w-full min-w-0 bg-background border border-border rounded-xl p-1">
                {(["short", "essay"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setQuestionType(opt)}
                    className={`
                      flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all
                      ${
                        questionType === opt
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    {questionType === opt && <Check className="h-3 w-3 shrink-0" aria-hidden />}
                    <span className="truncate">{opt.charAt(0).toUpperCase() + opt.slice(1)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="block font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Difficulty Level
              </label>
              <div className="flex w-full min-w-0 bg-background border border-border rounded-xl p-1">
                {(["easy", "medium", "hard"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setDifficulty(opt)}
                    className={`
                      flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-all sm:px-2.5
                      ${
                        difficulty === opt
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    {difficulty === opt && <Check className="h-3 w-3 shrink-0" aria-hidden />}
                    <span className="truncate">{opt.charAt(0).toUpperCase() + opt.slice(1)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
              Area of Focus
            </label>
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. Focus on 'Database Normalization' concepts or create a comprehensive review..."
              className="w-full h-32 bg-background border border-border rounded-xl p-6 text-base leading-relaxed font-serif focus:outline-none focus:ring-1 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground/30"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => onGenerate({ count, difficulty, questionType, focus })}
              className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all shadow-md active:scale-95 text-sm"
            >
              Generate Written Questions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
