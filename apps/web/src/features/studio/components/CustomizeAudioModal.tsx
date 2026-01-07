
import React, { useState } from 'react';
import { X, AudioLines, Check } from 'lucide-react';

interface AudioFormat {
  id: string;
  title: string;
  description: string;
}

const FORMATS: AudioFormat[] = [
  {
    id: 'deep_dive',
    title: 'Deep Dive',
    description: 'A lively conversation between two hosts, unpacking and connecting topics in your sources'
  },
  {
    id: 'brief',
    title: 'Brief',
    description: 'A bite-sized overview to help you grasp the core ideas from your sources quickly'
  },
  {
    id: 'critique',
    title: 'Critique',
    description: 'An expert review of your sources, offering constructive feedback to help you improve your material'
  },
  {
    id: 'debate',
    title: 'Debate',
    description: 'A thoughtful debate between two hosts, illuminating different perspectives on your sources'
  }
];

interface CustomizeAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: AudioConfig) => void;
}

export interface AudioConfig {
  formatId: string;
  length: 'short' | 'default' | 'long';
  focus: string;
}

export const CustomizeAudioModal: React.FC<CustomizeAudioModalProps> = ({ isOpen, onClose, onGenerate }) => {
  const [selectedFormat, setSelectedFormat] = useState('deep_dive');
  const [length, setLength] = useState<AudioConfig['length']>('default');
  const [focus, setFocus] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-120 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-5xl bg-card text-card-foreground rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary/50 rounded-lg">
                <AudioLines className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-sans tracking-tight">Customize Audio Overview</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary/50 rounded-full transition-colors group">
            <X className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        </div>

        <div className="p-6 md:p-10 space-y-10 overflow-y-auto max-h-[85vh] bg-card/50">
          {/* Format Selection */}
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">Format</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {FORMATS.map((format) => (
                <button
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  className={`
                    relative flex flex-col p-5 rounded-xl border text-left transition-all h-full
                    ${selectedFormat === format.id 
                      ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20' 
                      : 'bg-card border-border/50 hover:border-primary/40 hover:bg-secondary/30'}
                  `}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className={`font-bold text-sm ${selectedFormat === format.id ? 'text-primary' : 'text-foreground'}`}>{format.title}</span>
                    {selectedFormat === format.id && (
                      <div className="p-1 rounded-full bg-primary text-primary-foreground">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed font-serif">
                    {format.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">Length</label>
            <div className="flex bg-background border border-border rounded-full p-1 w-fit">
              {(['short', 'default', 'long'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setLength(opt)}
                  className={`
                    flex items-center justify-center gap-2 px-6 py-2 rounded-full text-xs font-bold transition-all
                    ${length === opt 
                      ? 'bg-primary text-primary-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'}
                  `}
                >
                  {length === opt && <Check className="w-3 h-3" />}
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Focus Area */}
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">What should the AI hosts focus on in this episode?</label>
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="Things to try&#10;• Focus on a specific source (&quot;only cover the article about Italy&quot;)&#10;• Focus on a specific topic (&quot;just discuss the novel's main character&quot;)&#10;• Target a specific audience (&quot;explain to someone new to biology&quot;)"
              className="w-full h-44 bg-background border border-border rounded-xl p-6 text-base leading-relaxed font-serif focus:outline-none focus:ring-1 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground/30"
            />
          </div>

          {/* Footer Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => onGenerate({ formatId: selectedFormat, length, focus })}
              className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full transition-all shadow-md active:scale-95 text-sm"
            >
              Generate Audio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
