import React, { useState } from "react";
import { X, Presentation } from "lucide-react";
import { StudioModalDiscoverPromptsButton } from "./StudioModalDiscoverPromptsButton";

interface CustomizeSlidesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: SlideDeckConfig) => void;
  embedded?: boolean;
}

export interface SlideDeckConfig {
  slideType: "detailed_deck" | "presenter_slides";
  deckLength: "short" | "default";
  customPrompt: string;
}

export const CustomizeSlidesModal: React.FC<CustomizeSlidesModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  embedded = false,
}) => {
  const [slideType, setSlideType] = useState<SlideDeckConfig["slideType"]>("detailed_deck");
  const [deckLength, setDeckLength] = useState<SlideDeckConfig["deckLength"]>("default");
  const [customPrompt, setCustomPrompt] = useState("");

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
              <Presentation className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-sans tracking-tight">Customize Slide Deck</h2>
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
          <div className="space-y-10">
            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
                Format
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(
                  [
                    {
                      value: "detailed_deck" as const,
                      label: "Detailed Deck",
                      description:
                        "A comprehensive deck with full text and details, perfect for emailing or reading on its own.",
                    },
                    {
                      value: "presenter_slides" as const,
                      label: "Presenter Slides",
                      description:
                        "Clean, visual slides with key talking points to support you while you speak.",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSlideType(opt.value)}
                    className={`
                      relative flex flex-col p-5 rounded-xl border text-left transition-all h-full
                      ${
                        slideType === opt.value
                          ? "bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20"
                          : "bg-card border-border/50 hover:border-primary/40 hover:bg-secondary/30"
                      }
                    `}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span
                        className={`font-bold text-sm ${slideType === opt.value ? "text-primary" : "text-foreground"}`}
                      >
                        {opt.label}
                      </span>
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-relaxed font-serif">
                      {opt.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
                Length
              </label>
              <div className="flex bg-background border border-border rounded-xl p-1 w-fit">
                {(
                  [
                    { value: "short" as const, label: "Short" },
                    { value: "default" as const, label: "Default" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDeckLength(opt.value)}
                    className={`
                      flex items-center justify-center px-6 py-2 rounded-xl text-xs font-bold transition-all
                      ${
                        deckLength === opt.value
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    {opt.label}
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
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Add a high-level outline, or guide the audience, style, and focus: 'Create a deck for beginners using a bold and playful style with a focus on step-by-step instructions.'"
              className="w-full h-44 bg-background border border-border rounded-xl p-6 text-base leading-relaxed font-serif focus:outline-none focus:ring-1 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground/30"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => onGenerate({ slideType, deckLength, customPrompt })}
              className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all shadow-md active:scale-95 text-sm"
            >
              Generate Slide Deck
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
