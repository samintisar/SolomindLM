import React from 'react';
import { ArrowRight } from 'lucide-react';

interface HeroSectionProps {
  onGetStarted: () => void;
  onScrollToFeatures: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onGetStarted, onScrollToFeatures }) => {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-background">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        {/* Logo/Brand */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src="/SolomindLM_logo.png" alt="SolomindLM" className="w-12 h-12" />
          <span className="text-2xl font-sans font-bold text-foreground">SolomindLM</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-5xl md:text-6xl font-sans font-bold text-foreground leading-tight animate-in fade-in duration-700">
          Transform How You Learn with AI
        </h1>

        {/* Subheadline */}
        <p className="text-xl md:text-2xl text-muted-foreground font-serif leading-relaxed max-w-3xl mx-auto animate-in fade-in duration-700 delay-150">
          Upload any content—PDFs, videos, articles—and generate flashcards, quizzes, mind maps, and more. Perfect for students, researchers, and lifelong learners.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 animate-in fade-in duration-700 delay-300">
          <button
            onClick={onGetStarted}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full font-bold shadow-md px-8 py-4 transition-all active:scale-95 flex items-center gap-2"
          >
            Try SolomindLM
            <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={onScrollToFeatures}
            className="bg-card border border-border hover:bg-secondary hover:border-primary/30 text-foreground rounded-full font-bold shadow-sm px-8 py-4 transition-all active:scale-95"
          >
            See Features
          </button>
        </div>

        {/* Social Proof */}
        <div className="pt-8 flex items-center justify-center gap-8 text-muted-foreground text-sm animate-in fade-in duration-700 delay-500">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success"></div>
            <span>AI-Powered</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success"></div>
            <span>Free to Start</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success"></div>
            <span>No Credit Card Required</span>
          </div>
        </div>
      </div>
    </section>
  );
};
