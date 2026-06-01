import { Bookmark, HelpCircle, X } from "lucide-react";
import React, { useState } from "react";
import { SaveAsPromptModal } from "./SaveAsPromptModal";
import { StudioModalDiscoverPromptsButton } from "./StudioModalDiscoverPromptsButton";

interface CustomizeQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: QuizConfig) => void;
  /** When true, positions the overlay inside a relative parent instead of the viewport. */
  embedded?: boolean;
}

export interface QuizConfig {
  count: "fewer" | "standard" | "more";
  difficulty: "easy" | "medium" | "hard";
  focus: string;
}

export const CustomizeQuizModal: React.FC<CustomizeQuizModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  embedded = false,
}) => {
  const [count, setCount] = useState<QuizConfig["count"]>("standard");
  const [difficulty, setDifficulty] = useState<QuizConfig["difficulty"]>("medium");
  const [focus, setFocus] = useState("");
  const [saveAsPromptModalOpen, setSaveAsPromptModalOpen] = useState(false);

  if (!isOpen) return null;

  const overlayClass = embedded
    ? "absolute inset-0 z-50 flex min-h-0 items-center justify-center p-2 sm:p-3 animate-in fade-in duration-200"
    : "fixed inset-0 z-120 flex items-center justify-center p-4 animate-in fade-in duration-200";

  return (
    <div className={overlayClass}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card font-sans text-card-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary/50 rounded-lg">
              <HelpCircle className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-sans tracking-tight">Customize Quiz</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StudioModalDiscoverPromptsButton studioTool="quiz" onApplyPrompt={setFocus} />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
                Number of Questions
              </label>
              <div className="flex bg-background border border-border rounded-xl p-1 w-fit">
                {(["fewer", "standard", "more"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setCount(opt)}
                    className={`
                      flex items-center justify-center px-6 py-2 rounded-xl text-xs font-bold transition-all
                      ${
                        count === opt
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
                Difficulty Level
              </label>
              <div className="flex bg-background border border-border rounded-xl p-1 w-fit">
                {(["easy", "medium", "hard"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setDifficulty(opt)}
                    className={`
                      flex items-center justify-center px-6 py-2 rounded-xl text-xs font-bold transition-all
                      ${
                        difficulty === opt
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
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
              placeholder="e.g. Create a 'Final Exam' style review or focus on 'Boyce-Codd Normal Form'..."
              className="w-full h-44 bg-background border border-border rounded-xl p-6 text-base leading-relaxed font-serif focus:outline-none focus:ring-1 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground/30"
            />
            <button
              type="button"
              onClick={() => setSaveAsPromptModalOpen(true)}
              disabled={!focus.trim()}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Bookmark className="w-3.5 h-3.5" />
              Save as reusable prompt
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => onGenerate({ count, difficulty, focus })}
              className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all shadow-md active:scale-95 text-sm"
            >
              Generate Quiz
            </button>
          </div>
        </div>
      </div>

      {/* Save as Prompt Modal */}
      <SaveAsPromptModal
        isOpen={saveAsPromptModalOpen}
        onClose={() => setSaveAsPromptModalOpen(false)}
        studioTool="quiz"
        initialPromptText={focus}
      />
    </div>
  );
};
