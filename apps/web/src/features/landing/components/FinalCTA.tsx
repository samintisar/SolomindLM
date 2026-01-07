import React from 'react';
import { ArrowRight } from 'lucide-react';
import { LANDING_CONTENT } from '../constants';

interface FinalCTAProps {
  onGetStarted: () => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ onGetStarted }) => {
  return (
    <section className="py-20 px-6 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="max-w-3xl mx-auto text-center space-y-8">
        {/* Headline */}
        <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground">
          {LANDING_CONTENT.finalCTA.title}
        </h2>

        {/* Description */}
        <p className="text-lg text-muted-foreground">
          {LANDING_CONTENT.finalCTA.description}
        </p>

        {/* CTA Button */}
        <button
          onClick={onGetStarted}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full font-bold shadow-md px-10 py-5 text-lg transition-all active:scale-95 inline-flex items-center gap-2"
        >
          {LANDING_CONTENT.finalCTA.buttonText}
          <ArrowRight className="w-5 h-5" />
        </button>

        {/* Trust Badge */}
        <p className="text-sm text-muted-foreground pt-4">
          {LANDING_CONTENT.finalCTA.trustBadge}
        </p>
      </div>
    </section>
  );
};
