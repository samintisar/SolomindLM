import React, { useState, useRef } from "react";
import { X, Image, Bookmark, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { StudioModalDiscoverPromptsButton } from "./StudioModalDiscoverPromptsButton";
import { SaveAsPromptModal } from "./SaveAsPromptModal";

interface VisualStyle {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const VISUAL_STYLES: VisualStyle[] = [
  { id: "auto", label: "Auto-select", icon: <span className="text-lg">✨</span> },
  { id: "sketch_note", label: "Sketch Note", icon: <span className="text-lg">✏️</span> },
  { id: "kawaii", label: "Kawaii", icon: <span className="text-lg">🎀</span> },
  { id: "professional", label: "Professional", icon: <span className="text-lg">💼</span> },
  { id: "scientific", label: "Scientific", icon: <span className="text-lg">🔬</span> },
  { id: "anime", label: "Anime", icon: <span className="text-lg">🎌</span> },
  { id: "clay", label: "Clay", icon: <span className="text-lg">🏺</span> },
  { id: "editorial", label: "Editorial", icon: <span className="text-lg">📰</span> },
  { id: "instructional", label: "Instructional", icon: <span className="text-lg">📋</span> },
  { id: "bento_grid", label: "Bento Grid", icon: <span className="text-lg">🍱</span> },
  { id: "bricks", label: "Bricks", icon: <span className="text-lg">🧱</span> },
];

interface CustomizeInfographicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: InfographicConfig) => void;
  embedded?: boolean;
}

export interface InfographicConfig {
  orientation: "landscape" | "portrait" | "square";
  visualStyle: string;
  detailLevel: "concise" | "standard";
  customPrompt: string;
}

export const CustomizeInfographicModal: React.FC<CustomizeInfographicModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  embedded = false,
}) => {
  const [orientation, setOrientation] = useState<InfographicConfig["orientation"]>("landscape");
  const [visualStyle, setVisualStyle] = useState("auto");
  const [detailLevel, setDetailLevel] = useState<InfographicConfig["detailLevel"]>("standard");
  const [customPrompt, setCustomPrompt] = useState("");
  const [saveAsPromptModalOpen, setSaveAsPromptModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const overlayClass = embedded
    ? "absolute inset-0 z-50 flex min-h-0 items-center justify-center p-2 sm:p-3 animate-in fade-in duration-200"
    : "fixed inset-0 z-120 flex items-center justify-center p-4 animate-in fade-in duration-200";

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className={overlayClass}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card font-sans text-card-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary/50 rounded-lg">
              <Image className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-sans tracking-tight">Customize Infographic</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StudioModalDiscoverPromptsButton studioTool="infographic" onApplyPrompt={setCustomPrompt} />
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 transition-colors hover:bg-secondary/50"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-10 space-y-10 overflow-y-auto max-h-[85vh] bg-card/50">
          {/* Orientation + Detail Level */}
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-10">
            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
                Choose orientation
              </label>
              <div className="flex bg-background border border-border rounded-xl p-1 w-fit">
                {(["landscape", "portrait", "square"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setOrientation(opt)}
                    className={`
                      flex items-center justify-center px-6 py-2 rounded-xl text-xs font-bold transition-all
                      ${orientation === opt
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
                Level of detail
              </label>
              <div className="flex bg-background border border-border rounded-xl p-1 w-fit">
                {(["concise", "standard"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setDetailLevel(opt)}
                    className={`
                      flex items-center justify-center px-6 py-2 rounded-xl text-xs font-bold transition-all
                      ${detailLevel === opt
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

          {/* Visual Style Carousel */}
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
              Choose visual style
            </label>
            <div className="relative group">
              <button
                onClick={() => scroll("left")}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-card border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div
                ref={scrollRef}
                className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {VISUAL_STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setVisualStyle(style.id)}
                    className={`
                      relative flex-shrink-0 flex flex-col items-center gap-2 p-3 rounded-xl border text-left transition-all w-[110px]
                      ${visualStyle === style.id
                        ? "bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20"
                        : "bg-card border-border/50 hover:border-primary/40 hover:bg-secondary/30"
                      }
                    `}
                  >
                    <div className={`
                      w-full aspect-square rounded-lg flex items-center justify-center text-2xl
                      ${visualStyle === style.id ? "bg-primary/10" : "bg-secondary/50"}
                    `}>
                      {style.icon}
                    </div>
                    <span className={`text-[11px] font-medium text-center leading-tight ${visualStyle === style.id ? "text-primary" : "text-foreground"}`}>
                      {style.label}
                    </span>
                    {visualStyle === style.id && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => scroll("right")}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-card border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Custom Prompt */}
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
              Describe the infographic you want to create
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder='Guide the style, color, or focus: "Use a blue color theme and highlight the 3 key stats."'
              className="w-full h-32 bg-background border border-border rounded-xl p-6 text-base leading-relaxed font-serif focus:outline-none focus:ring-1 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground/30"
            />
            <button
              type="button"
              onClick={() => setSaveAsPromptModalOpen(true)}
              disabled={!customPrompt.trim()}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Bookmark className="w-3.5 h-3.5" />
              Save as reusable prompt
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() =>
                onGenerate({
                  orientation,
                  visualStyle,
                  detailLevel,
                  customPrompt,
                })
              }
              className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all shadow-md active:scale-95 text-sm"
            >
              Generate
            </button>
          </div>
        </div>
      </div>

      {/* Save as Prompt Modal */}
      <SaveAsPromptModal
        isOpen={saveAsPromptModalOpen}
        onClose={() => setSaveAsPromptModalOpen(false)}
        studioTool="infographic"
        initialPromptText={customPrompt}
      />
    </div>
  );
};
