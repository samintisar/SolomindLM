
import React, { useState } from 'react';
import { X, MessageSquareText, Check } from 'lucide-react';

interface CustomizeWrittenQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: WrittenQuestionsConfig) => void;
}

export interface WrittenQuestionsConfig {
  count: 'fewer' | 'standard' | 'more';
  difficulty: 'easy' | 'medium' | 'hard';
  questionType: 'short' | 'essay';
  focus: string;
}

export const CustomizeWrittenQuestionsModal: React.FC<CustomizeWrittenQuestionsModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
}) => {
  const [count, setCount] = useState<WrittenQuestionsConfig['count']>('standard');
  const [difficulty, setDifficulty] = useState<WrittenQuestionsConfig['difficulty']>('medium');
  const [questionType, setQuestionType] = useState<WrittenQuestionsConfig['questionType']>('short');
  const [focus, setFocus] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-120 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl bg-card text-card-foreground rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary/50 rounded-lg">
              <MessageSquareText className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-sans tracking-tight">Customize Written Questions</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary/50 rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 md:p-10 space-y-10 bg-card/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-8">
            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans block">Number of Questions</label>
              <div className="flex bg-background border border-border rounded-full p-1">
                {(['fewer', 'standard', 'more'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setCount(opt)}
                    className={`
                      flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all flex-1
                      ${count === opt
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'}
                    `}
                  >
                    {count === opt && <Check className="w-3 h-3" />}
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans block">Question Type</label>
              <div className="flex bg-background border border-border rounded-full p-1">
                {(['short', 'essay'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setQuestionType(opt)}
                    className={`
                      flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all flex-1
                      ${questionType === opt
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'}
                    `}
                  >
                    {questionType === opt && <Check className="w-3 h-3" />}
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans block">Difficulty Level</label>
              <div className="flex bg-background border border-border rounded-full p-1">
                {(['easy', 'medium', 'hard'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setDifficulty(opt)}
                    className={`
                      flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all flex-1
                      ${difficulty === opt
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'}
                    `}
                  >
                    {difficulty === opt && <Check className="w-3 h-3" />}
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">Area of Focus</label>
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
              className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-all shadow-md active:scale-95 text-sm"
            >
              Generate Written Questions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
