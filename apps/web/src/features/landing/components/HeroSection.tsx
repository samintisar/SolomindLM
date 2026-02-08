import React, { useState, useEffect } from 'react';

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
  "What are the key points from..."
];

export const HeroSection: React.FC<HeroSectionProps> = ({ onGetStarted }) => {
  const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const currentText = PLACEHOLDER_TEXTS[currentPlaceholderIndex];
    const typingSpeed = isDeleting ? 30 : 50;
    const pauseDuration = 2000;
    const deletePauseDuration = 500;

    const timer = setTimeout(() => {
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
    }, isDeleting && displayText.length === 0 ? deletePauseDuration : typingSpeed);

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, currentPlaceholderIndex]);

  return (
        <section className="relative flex flex-col items-center px-6 pt-40 pb-40 overflow-hidden">
      {/* Animated mesh gradient background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0 animate-mesh-gradient opacity-[0.4]"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 20% 40%, rgba(249, 115, 22, 0.15), transparent),
              radial-gradient(ellipse 60% 40% at 80% 60%, rgba(251, 191, 36, 0.12), transparent),
              radial-gradient(ellipse 50% 60% at 50% 80%, rgba(251, 113, 133, 0.1), transparent)
            `
          }}
        />
        <div
          className="absolute inset-0 animate-mesh-gradient opacity-[0.35]"
          style={{
            animationDelay: '-6s',
            background: `
              radial-gradient(ellipse 70% 50% at 70% 30%, rgba(251, 113, 133, 0.12), transparent),
              radial-gradient(ellipse 50% 60% at 30% 70%, rgba(249, 115, 22, 0.1), transparent)
            `
          }}
        />
        <div className="absolute inset-0 bg-background/15" aria-hidden />
      </div>

      <div className="relative z-10 max-w-[1500px] w-full mx-auto text-center space-y-24 px-4">
        {/* Headline + tagline with tight gap */}
        <div className="space-y-4">
          <h1 className="text-6xl md:text-8xl font-sans font-extrabold text-foreground tracking-tight" style={{ lineHeight: '1.1' }}>
            Learn{' '}
            <span style={{
              background: 'linear-gradient(135deg, #f97316 0%, #fbbf24 50%, #fb7185 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              Anything
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-sans font-light leading-relaxed max-w-2xl mx-auto animate-in fade-in duration-700 delay-200">
            AI that enhances learning, not replaces thinking.
          </p>
        </div>

        {/* CTA Search Bar - Redesigned */}
        <div 
          className="group/bar relative max-w-2xl mx-auto animate-in fade-in delay-300 transition-[transform] duration-300 ease-out hover:scale-[1.02]"
          onClick={onGetStarted}
          onMouseEnter={() => setIsFocused(true)}
          onMouseLeave={() => setIsFocused(false)}
          style={{ transform: isFocused ? 'scale(1.02)' : undefined }}
        >
          {/* Focus/hover glow - palette-colored */}
          <div className={`absolute -inset-3 rounded-2xl transition-all duration-500 ${
            isFocused 
              ? 'bg-gradient-to-r from-orange-400/50 via-amber-400/45 to-rose-400/50 blur-2xl opacity-100' 
              : 'bg-gradient-to-r from-orange-400/20 via-amber-400/15 to-rose-400/20 blur-xl opacity-100 group-hover/bar:from-orange-400/25 group-hover/bar:via-amber-400/20 group-hover/bar:to-rose-400/25'
          }`} aria-hidden />

          <div
            className={`hero-search-glass relative rounded-2xl overflow-hidden cursor-pointer group border border-white/20 hover:border-primary/40 transition-all duration-300 ease-out ${
              isFocused ? 'scale-[1.02] ring-2 ring-primary/30' : 'hover:ring-2 hover:ring-primary/20'
            }`}
            style={isFocused ? { boxShadow: '0 20px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.5), 0 0 40px rgba(249,115,22,0.15), 0 0 80px rgba(251,191,36,0.1)' } : undefined}
          >
            {/* Top: prompt row - single line on all viewports */}
            <div className="flex flex-nowrap items-center gap-2 sm:gap-4 px-3 sm:px-5 py-6">
              {/* Search icon */}
              <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                isFocused 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
              }`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>

              <div className="flex-1 min-w-0 text-left overflow-hidden">
                <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
                  <span className={`text-base md:text-lg font-medium transition-colors duration-300 truncate ${
                    isFocused ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                  }`}>
                    {displayText}
                  </span>
                  <span className={`flex-shrink-0 w-0.5 h-4 rounded-full transition-opacity duration-200 ${
                    isFocused || !displayText ? 'opacity-100' : 'opacity-0'
                  } bg-primary animate-cursor-blink`} aria-hidden />
                </div>
              </div>

              {/* Go button - pill, hover scale */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] ${
                isFocused 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground'
              }`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Product Preview / Visual Proof Area */}
        <div className="pt-16 animate-in fade-in duration-1000 delay-500">
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
                    www.solomindlm.com/studio
                  </div>
                </div>
              </div>

              {/* Preview Content - Product Screenshot */}
              <img 
                src="https://i.ibb.co/279jDP1N/Demo-Screenshot.png" 
                alt="SolomindLM Product Preview" 
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
