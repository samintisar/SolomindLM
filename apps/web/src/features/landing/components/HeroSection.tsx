import React, { useState } from 'react';
import { ArrowRight, Play, Sparkles } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface HeroSectionProps {
  onGetStarted: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onGetStarted }) => {
  const [isDemoPlaying, setIsDemoPlaying] = useState(false);

  return (
    <section className="flex flex-col items-center px-6 pt-56 pb-20 bg-background">
      <div className="max-w-5xl mx-auto text-center space-y-10">
        {/* Main Headline - Stronger Hook */}
        <h1 className="text-5xl md:text-7xl font-sans font-bold text-foreground leading-tight animate-in fade-in duration-700 delay-150">
          Turn Any Content Into{' '}
          <span style={{
            background: 'linear-gradient(135deg, #f97316 0%, #fbbf24 50%, #fb7185 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Smart Study Tools
          </span>
          <br />in Seconds
        </h1>

        {/* Subheadline - More Specific */}
        <p className="text-xl md:text-2xl text-muted-foreground font-serif leading-relaxed max-w-3xl mx-auto animate-in fade-in duration-700 delay-200">
          Upload PDFs, videos, or articles. Get AI-generated flashcards, quizzes, and mind maps instantly.
          <span className="text-foreground font-semibold"> Study smarter, not harder.</span>
        </p>

        {/* CTA Buttons - More Compelling */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2 animate-in fade-in duration-700 delay-300">
          <Button
            onClick={onGetStarted}
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full font-bold shadow-lg hover:shadow-xl px-10 py-6 text-lg transition-all active:scale-95"
          >
            Try SolomindLM
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>

        {/* Product Preview / Visual Proof Area */}
        <div className="pt-8 animate-in fade-in duration-1000 delay-500">
          <div className="relative max-w-6xl mx-auto">
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
