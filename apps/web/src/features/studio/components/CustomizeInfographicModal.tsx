import React, { useState, useRef } from "react";
import { X, Image, Bookmark, ChevronLeft, ChevronRight } from "lucide-react";
import { StudioModalDiscoverPromptsButton } from "./StudioModalDiscoverPromptsButton";
import { SaveAsPromptModal } from "./SaveAsPromptModal";

interface VisualStyle {
  id: string;
  label: string;
  hint: string;
}

const VISUAL_STYLES: VisualStyle[] = [
  { id: "auto", label: "Auto-select", hint: "Balanced layout and palette from your content" },
  { id: "sketch_note", label: "Sketch Note", hint: "Loose lines, markers, and handwritten labels" },
  { id: "kawaii", label: "Kawaii", hint: "Soft pastels, rounded shapes, friendly emphasis" },
  {
    id: "professional",
    label: "Professional",
    hint: "Clean grids, restrained color, crisp hierarchy",
  },
  { id: "scientific", label: "Scientific", hint: "Diagrams, scales, and precise annotations" },
  { id: "anime", label: "Anime", hint: "Bold color blocks, expressive outlines, motion cues" },
  { id: "clay", label: "Clay", hint: "Soft volumes, gentle shadows, tactile surfaces" },
  { id: "editorial", label: "Editorial", hint: "Magazine rhythm, strong headline, column flow" },
  {
    id: "instructional",
    label: "Instructional",
    hint: "Numbered flow, clear steps, minimal decoration",
  },
  { id: "bento_grid", label: "Bento Grid", hint: "Modular tiles with varied weights and spacing" },
  { id: "bricks", label: "Bricks", hint: "Stacked blocks with mortar rhythm and repetition" },
];

function VisualStylePreview({ styleId }: { styleId: string }) {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const id = VISUAL_STYLES.some((s) => s.id === styleId) ? styleId : "auto";
  const src = `${base}studio/infographic-styles/${id}.svg`;

  return (
    <div className="relative h-16 w-full overflow-hidden rounded-lg border border-border/50 bg-muted/30">
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover object-center"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

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
            <StudioModalDiscoverPromptsButton
              studioTool="infographic"
              onApplyPrompt={setCustomPrompt}
            />
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
                      ${
                        orientation === opt
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
                      ${
                        detailLevel === opt
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

          {/* Visual style */}
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
              Choose visual style
            </label>
            <div className="flex min-h-0 items-center gap-2">
              <button
                type="button"
                aria-label="Scroll styles left"
                onClick={() => scroll("left")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/50 hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div
                ref={scrollRef}
                className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto pb-1 scrollbar-hide scroll-smooth"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {VISUAL_STYLES.map((style) => {
                  const selected = visualStyle === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setVisualStyle(style.id)}
                      className={`
                        flex min-w-[148px] max-w-[168px] shrink-0 flex-col gap-2.5 rounded-xl border p-3 text-left transition-all
                        ${
                          selected
                            ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/25"
                            : "border-border/50 bg-card hover:border-primary/35 hover:bg-secondary/25"
                        }
                      `}
                    >
                      <VisualStylePreview styleId={style.id} />
                      <div className="min-w-0 space-y-1">
                        <span
                          className={`block text-xs font-semibold leading-snug ${selected ? "text-primary" : "text-foreground"}`}
                        >
                          {style.label}
                        </span>
                        <span className="block text-[10px] leading-snug text-muted-foreground line-clamp-2">
                          {style.hint}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                aria-label="Scroll styles right"
                onClick={() => scroll("right")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/50 hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
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
