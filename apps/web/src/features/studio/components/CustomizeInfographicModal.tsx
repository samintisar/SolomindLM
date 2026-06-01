import { Bookmark, Image, X } from "lucide-react";
import React, { useRef, useState } from "react";
import { SaveAsPromptModal } from "./SaveAsPromptModal";
import { StudioModalDiscoverPromptsButton } from "./StudioModalDiscoverPromptsButton";

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
  const frame =
    "relative h-16 w-full overflow-hidden rounded-lg border border-border/50 bg-muted/30";

  switch (styleId) {
    case "auto":
      return (
        <div className={frame}>
          <div className="absolute inset-0 bg-linear-to-br from-muted via-background to-primary/20" />
          <div className="absolute inset-x-2 bottom-2 h-2 rounded-sm bg-linear-to-r from-transparent via-primary/35 to-transparent" />
          <div className="absolute left-2 top-2 h-1.5 w-8 rounded-full bg-foreground/15" />
          <div className="absolute right-3 top-4 h-1 w-10 rounded-full bg-foreground/10" />
        </div>
      );
    case "sketch_note":
      return (
        <div className={frame}>
          <div className="absolute inset-2 rounded-md border border-dashed border-foreground/25 bg-background/40" />
          <div className="absolute left-3 top-3 h-px w-12 rotate-[-8deg] bg-foreground/30" />
          <div className="absolute bottom-3 right-3 h-6 w-10 rotate-3 rounded-sm border border-foreground/20 bg-secondary/40" />
        </div>
      );
    case "kawaii":
      return (
        <div className={frame}>
          <div className="absolute -left-2 bottom-1 h-10 w-14 rounded-full bg-pink-300/35 blur-[2px]" />
          <div className="absolute right-0 top-2 h-9 w-16 rounded-full bg-violet-300/30 blur-[2px]" />
          <div className="absolute left-1/3 top-4 h-7 w-12 rounded-2xl bg-rose-200/50" />
          <div className="absolute bottom-2 left-4 h-5 w-16 rounded-full bg-amber-100/60" />
        </div>
      );
    case "professional":
      return (
        <div className={frame}>
          <div className="absolute inset-x-0 top-0 h-2 bg-foreground/80" />
          <div className="absolute left-2 top-4 h-1 w-14 bg-foreground/20" />
          <div className="absolute left-2 top-7 grid w-[calc(100%-1rem)] grid-cols-3 gap-1">
            <div className="col-span-2 h-6 rounded-sm bg-foreground/10" />
            <div className="h-6 rounded-sm bg-foreground/15" />
            <div className="col-span-3 h-4 rounded-sm bg-foreground/8" />
          </div>
        </div>
      );
    case "scientific":
      return (
        <div className={frame}>
          <div
            className="absolute inset-0 opacity-[0.45]"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in oklch, var(--foreground) 14%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--foreground) 14%, transparent) 1px, transparent 1px)",
              backgroundSize: "10px 10px",
            }}
          />
          <div className="absolute left-2 top-2 h-8 w-px bg-primary/50" />
          <div className="absolute left-2 bottom-2 right-2 top-8 border-l border-b border-primary/40" />
          <div className="absolute bottom-2 left-3 right-5 h-px bg-primary/35" />
        </div>
      );
    case "anime":
      return (
        <div className={frame}>
          <div className="absolute inset-0 bg-linear-to-br from-cyan-400/25 via-background to-fuchsia-500/25" />
          <div className="absolute -right-1 top-1 h-10 w-14 -skew-x-12 rounded-sm bg-blue-500/35" />
          <div className="absolute bottom-2 left-2 h-8 w-20 rounded-md border-2 border-foreground/45 bg-background/30" />
        </div>
      );
    case "clay":
      return (
        <div className={frame}>
          <div className="absolute left-3 top-3 h-10 w-14 rounded-2xl bg-orange-200/45 shadow-[inset_0_-4px_0_rgba(0,0,0,0.06)]" />
          <div className="absolute bottom-2 right-4 h-9 w-11 rounded-xl bg-emerald-200/40 shadow-[inset_0_-3px_0_rgba(0,0,0,0.05)]" />
          <div className="absolute left-10 top-8 h-6 w-16 rounded-full bg-sky-200/35 shadow-[inset_0_-2px_0_rgba(0,0,0,0.05)]" />
        </div>
      );
    case "editorial":
      return (
        <div className={frame}>
          <div className="absolute inset-x-2 top-2 space-y-1">
            <div className="h-2 w-[85%] rounded-sm bg-foreground/75" />
            <div className="h-1 w-full rounded-full bg-foreground/15" />
            <div className="h-1 w-[92%] rounded-full bg-foreground/12" />
          </div>
          <div className="absolute bottom-2 left-2 right-2 grid grid-cols-3 gap-1.5">
            <div className="col-span-2 space-y-1">
              <div className="h-1 rounded-full bg-foreground/12" />
              <div className="h-1 rounded-full bg-foreground/10" />
              <div className="h-1 rounded-full bg-foreground/10" />
            </div>
            <div className="space-y-1 border-l border-border/60 pl-1.5">
              <div className="h-1 rounded-full bg-foreground/15" />
              <div className="h-1 rounded-full bg-foreground/12" />
            </div>
          </div>
        </div>
      );
    case "instructional":
      return (
        <div className={frame}>
          <div className="absolute left-2 top-2 flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              1
            </span>
            <div className="mt-0.5 space-y-1">
              <div className="h-1 w-20 rounded-full bg-foreground/18" />
              <div className="h-1 w-14 rounded-full bg-foreground/12" />
            </div>
          </div>
          <div className="absolute left-2 top-9 flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-foreground">
              2
            </span>
            <div className="mt-0.5 space-y-1">
              <div className="h-1 w-16 rounded-full bg-foreground/14" />
              <div className="h-1 w-20 rounded-full bg-foreground/10" />
            </div>
          </div>
        </div>
      );
    case "bento_grid":
      return (
        <div className={frame}>
          <div className="absolute inset-2 grid grid-cols-4 grid-rows-3 gap-1">
            <div className="col-span-2 row-span-2 rounded-md bg-foreground/12" />
            <div className="rounded-md bg-foreground/10" />
            <div className="rounded-md bg-foreground/10" />
            <div className="col-span-2 rounded-md bg-foreground/8" />
            <div className="rounded-md bg-foreground/14" />
            <div className="rounded-md bg-foreground/10" />
          </div>
        </div>
      );
    case "bricks":
      return (
        <div className={frame}>
          <div className="absolute inset-2 space-y-1">
            <div className="flex gap-1">
              <div className="h-5 flex-1 rounded-sm bg-foreground/14" />
              <div className="h-5 flex-1 rounded-sm bg-foreground/14" />
            </div>
            <div className="flex gap-1 pl-3">
              <div className="h-5 flex-1 rounded-sm bg-foreground/12" />
              <div className="h-5 flex-1 rounded-sm bg-foreground/12" />
            </div>
            <div className="flex gap-1">
              <div className="h-5 flex-1 rounded-sm bg-foreground/16" />
              <div className="h-5 flex-1 rounded-sm bg-foreground/14" />
            </div>
          </div>
        </div>
      );
    default:
      return <div className={frame} />;
  }
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
            <div className="flex min-h-0 items-stretch gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => scroll("left")}
                className="hidden shrink-0 self-center rounded-lg border border-border/60 bg-card px-2 py-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary/40 hover:text-foreground sm:block"
              >
                Prev
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
                        relative flex min-w-[148px] max-w-[168px] shrink-0 flex-col gap-2.5 rounded-xl border p-3 text-left transition-all
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
                      {selected && (
                        <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                          On
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => scroll("right")}
                className="hidden shrink-0 self-center rounded-lg border border-border/60 bg-card px-2 py-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary/40 hover:text-foreground sm:block"
              >
                Next
              </button>
            </div>
            <div className="flex justify-center gap-4 sm:hidden">
              <button
                type="button"
                onClick={() => scroll("left")}
                className="rounded-lg border border-border/60 bg-card px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => scroll("right")}
                className="rounded-lg border border-border/60 bg-card px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
              >
                Next
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
