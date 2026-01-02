
import React, { useState } from 'react';
import { X, Presentation, Check } from 'lucide-react';

interface CreateSlideDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: SlideDeckConfig) => void;
}

export interface SlideDeckConfig {
  format: 'detailed' | 'presenter';
  length: 'short' | 'default' | 'long';
  style: string;
}

const FORMATS = [
  {
    id: 'detailed',
    title: 'Detailed Deck',
    description: 'A comprehensive deck with full text and details, perfect for emailing or reading on its own.',
  },
  {
    id: 'presenter',
    title: 'Presenter Slides',
    description: 'Clean, visual slides with key talking points to support you while you speak.',
  },
];

export const CreateSlideDeckModal: React.FC<CreateSlideDeckModalProps> = ({ isOpen, onClose, onGenerate }) => {
  const [format, setFormat] = useState<SlideDeckConfig['format']>('detailed');
  const [length, setLength] = useState<SlideDeckConfig['length']>('default');
  const [style, setStyle] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl bg-card text-card-foreground rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary/50 rounded-lg">
                <Presentation className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-sans tracking-tight">Customize Slide Deck</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary/50 rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 md:p-10 space-y-10 bg-card/50">
          {/* Format Selection */}
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">Format</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setFormat(fmt.id as SlideDeckConfig['format'])}
                  className={`
                    group relative flex flex-col p-4 rounded-lg border transition-all cursor-pointer text-left
                    ${format === fmt.id
                      ? 'bg-primary/10 border-primary/50 shadow-md'
                      : 'bg-card border-border/50 hover:border-primary/40 hover:bg-secondary/30 shadow-sm hover:shadow-md'}
                  `}
                >
                  {format === fmt.id && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary-foreground" />
                    </div>
                  )}
                  <h4 className="text-sm font-bold mb-1.5 font-serif group-hover:text-primary transition-colors pr-6">{fmt.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 font-serif">
                    {fmt.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Length Selection */}
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">Length</label>
            <div className="flex flex-wrap gap-2">
              {(['short', 'default', 'long'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setLength(opt)}
                  className={`
                    flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all border
                    ${length === opt 
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
                      : 'bg-background border-border text-muted-foreground hover:bg-secondary'}
                  `}
                >
                  {length === opt && <Check className="w-3 h-3" />}
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Style Input */}
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">Style or Audience Preferences</label>
            <textarea
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. 'Create a deck for beginners using a bold and playful style with focus on step-by-step instructions.' or leave blank for default styling..."
              className="w-full h-44 bg-background border border-border rounded-xl p-6 text-base leading-relaxed font-serif focus:outline-none focus:ring-1 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground/30"
            />
          </div>

          {/* Generate Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => onGenerate({ format, length, style })}
              className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-all shadow-md active:scale-95 text-sm"
            >
              Generate Slide Deck
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
