import React from "react";
import { Button } from "@/shared/components/ui/button";
import { LandingHeroMockup } from "./LandingHeroMockup";

interface HeroSectionProps {
  onGetStarted: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onGetStarted }) => {
  return (
    <section className="relative flex flex-col items-center px-6 sm:px-8 lg:px-12 pt-32 sm:pt-36 pb-16 sm:pb-20 overflow-hidden">
      {/* Animated mesh gradient background – full-width glow, smooth bottom fade */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.25]"
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
          className="absolute inset-0 opacity-[0.2]"
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

      <div className="relative z-10 max-w-[1500px] w-full mx-auto text-center px-4 sm:px-6">
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
          <div className="pt-2 animate-in fade-in delay-300">
            <Button
              onClick={onGetStarted}
              className="font-sans bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold px-8 py-3 text-base transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
            >
              Get Started Free
            </Button>
          </div>
        </div>

        {/* Product Preview / Visual Proof Area */}
        <div className="mt-14 sm:mt-16 animate-in fade-in duration-1000 delay-500">
          <div className="relative max-w-[1500px] w-full mx-auto">
            {/* Glow Effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-orange-500/20 via-amber-500/20 to-rose-500/20 rounded-3xl blur-2xl" />

            {/* Preview Container */}
            <div className="relative bg-card border-2 border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Browser Bar */}
              <div className="bg-muted/50 px-4 py-3 flex items-center gap-2 border-b border-border">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-background rounded-md px-3 py-1 text-xs text-muted-foreground text-center">
                    www.solomindlm.com
                  </div>
                </div>
              </div>

              {/* Interactive product preview (demo only — no backend) */}
              <div className="relative h-[min(56vh,44rem)] w-full min-h-[24rem] sm:min-h-[28rem] md:min-h-[32rem] lg:min-h-[36rem]">
                <LandingHeroMockup onGetStarted={onGetStarted} className="h-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
