import React, { useState, useEffect } from "react";
import { LandingHeroMockup } from "./LandingHeroMockup";

interface HeroSectionProps {
  onGetStarted: () => void;
}

const PLACEHOLDER_TEXTS = [
  "Summarize this PDF...",
  "Quiz me on Biology...",
  "Explain this lecture...",
  "Create flashcards from...",
  "Analyze this research paper...",
  "Generate study guide for...",
  "Break down this concept...",
  "What are the key points from...",
];

export const HeroSection: React.FC<HeroSectionProps> = ({ onGetStarted }) => {
  const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const currentText = PLACEHOLDER_TEXTS[currentPlaceholderIndex];
    const typingSpeed = isDeleting ? 30 : 50;
    const pauseDuration = 2000;
    const deletePauseDuration = 500;

    const timer = setTimeout(
      () => {
        if (!isDeleting) {
          if (displayText.length < currentText.length) {
            setDisplayText(currentText.slice(0, displayText.length + 1));
          } else {
            setTimeout(() => setIsDeleting(true), pauseDuration);
          }
        } else {
          if (displayText.length > 0) {
            setDisplayText(displayText.slice(0, -1));
          } else {
            setIsDeleting(false);
            setCurrentPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_TEXTS.length);
          }
        }
      },
      isDeleting && displayText.length === 0 ? deletePauseDuration : typingSpeed
    );

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, currentPlaceholderIndex]);

  return (
    <section className="relative flex flex-col items-center px-6 sm:px-8 lg:px-12 pt-44 sm:pt-52 pb-44 sm:pb-52 overflow-hidden">
      {/* Animated mesh gradient background – full-width glow, smooth bottom fade */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 20% 40%, rgba(249, 115, 22, 0.15), transparent),
              radial-gradient(ellipse 90% 55% at 85% 55%, rgba(251, 191, 36, 0.12), transparent),
              radial-gradient(ellipse 100% 70% at 100% 50%, rgba(251, 113, 133, 0.08), transparent),
              radial-gradient(ellipse 50% 60% at 50% 80%, rgba(251, 113, 133, 0.1), transparent)
            `,
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            background: `
              radial-gradient(ellipse 70% 50% at 70% 30%, rgba(251, 113, 133, 0.12), transparent),
              radial-gradient(ellipse 80% 50% at 95% 60%, rgba(249, 115, 22, 0.08), transparent),
              radial-gradient(ellipse 50% 60% at 30% 70%, rgba(249, 115, 22, 0.1), transparent)
            `,
          }}
        />
        <div className="absolute inset-0 bg-background/15" aria-hidden />
        {/* Soft fade into next section – no hard bottom border */}
        <div
          className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, transparent 35%, var(--background) 100%)",
          }}
          aria-hidden
        />
      </div>

      <div className="relative z-10 max-w-[1500px] w-full mx-auto text-center space-y-36 sm:space-y-40 px-4 sm:px-6">
        {/* Headline + tagline */}
        <div className="space-y-5 sm:space-y-6">
          <h1
            className="text-6xl md:text-8xl font-display font-extrabold text-foreground tracking-tight"
            style={{ lineHeight: "1.1" }}
          >
            Learn{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #f97316 0%, #fbbf24 50%, #fb7185 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Anything
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-display font-light leading-relaxed max-w-2xl mx-auto animate-in fade-in duration-700 delay-200">
            AI that enhances learning, not replaces thinking.
          </p>
        </div>

        {/* CTA Search Bar - Redesigned */}
        <div
          className="group/bar relative w-full max-w-3xl mx-auto min-h-[136px] sm:min-h-[144px] animate-in fade-in delay-300 transition-[transform] duration-300 ease-out hover:scale-[1.02]"
          onClick={onGetStarted}
          onMouseEnter={() => setIsFocused(true)}
          onMouseLeave={() => setIsFocused(false)}
          style={{ transform: isFocused ? "scale(1.02)" : undefined }}
        >
          {/* Focus/hover glow - palette-colored; size fixed by wrapper min-height + w-full */}
          <div
            className={`absolute -inset-3 rounded-2xl transition-all duration-500 ${
              isFocused
                ? "bg-gradient-to-r from-orange-400/50 via-amber-400/45 to-rose-400/50 blur-2xl opacity-100"
                : "bg-gradient-to-r from-orange-400/20 via-amber-400/15 to-rose-400/20 blur-xl opacity-100 group-hover/bar:from-orange-400/25 group-hover/bar:via-amber-400/20 group-hover/bar:to-rose-400/25"
            }`}
            aria-hidden
          />

          <div
            className={`hero-search-glass relative rounded-2xl overflow-hidden cursor-pointer group border border-white/20 hover:border-primary/40 transition-all duration-300 ease-out h-[136px] sm:h-[144px] min-w-0 flex flex-col ${
              isFocused
                ? "scale-[1.02] ring-2 ring-primary/30"
                : "hover:ring-2 hover:ring-primary/20"
            }`}
            style={
              isFocused
                ? {
                    boxShadow:
                      "0 20px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.5), 0 0 40px rgba(249,115,22,0.15), 0 0 80px rgba(251,191,36,0.1)",
                  }
                : undefined
            }
          >
            {/* Placeholder at top - fixed height row so bar size never changes */}
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 flex items-center gap-1.5 pt-5 sm:pt-6 px-4 sm:px-6 min-h-0 min-w-0">
                <span
                  className={`font-display text-base sm:text-lg font-medium truncate text-left transition-colors duration-300 ${
                    isFocused
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {displayText}
                </span>
                <span
                  className={`flex-shrink-0 w-0.5 h-4 rounded-xl transition-opacity duration-200 ${
                    isFocused || !displayText ? "opacity-100" : "opacity-0"
                  } bg-primary animate-cursor-blink`}
                  aria-hidden
                />
              </div>
              {/* Bottom row: + icon, spacer, Plan button, sound icon, send button (fake, no handlers) */}
              <div className="flex flex-nowrap items-center gap-2 sm:gap-4 px-4 sm:px-6 pt-8 sm:pt-10 pb-5 sm:pb-6">
                <div
                  className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
                    isFocused
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                  }`}
                  aria-hidden
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0" />
                <div className="flex-shrink-0 flex items-center gap-2">
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ease-out ${
                      isFocused
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground"
                    }`}
                    aria-hidden
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Product Preview / Visual Proof Area */}
        <div className="pt-20 sm:pt-24 animate-in fade-in duration-1000 delay-500">
          <div className="relative max-w-[1500px] w-full mx-auto">
            {/* Glow Effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-orange-500/20 via-amber-500/20 to-rose-500/20 rounded-3xl blur-2xl"></div>

            {/* Preview Container */}
            <div className="relative bg-card border-2 border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Browser Bar */}
              <div className="bg-muted/50 px-4 py-3 flex items-center gap-2 border-b border-border">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-background rounded-md px-3 py-1 text-xs text-muted-foreground text-center">
                    www.solomindlm.com
                  </div>
                </div>
              </div>

              {/* Interactive product preview (demo only — no backend) */}
              <div className="relative h-[min(76vh,56rem)] w-full min-h-[28rem] sm:min-h-[34rem] md:min-h-[38rem] lg:min-h-[42rem]">
                <LandingHeroMockup onGetStarted={onGetStarted} className="h-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
