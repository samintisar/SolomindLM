import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface FinalCTAProps {
  onGetStarted: () => void;
}

const benefits = [
  'Generate flashcards from any PDF in seconds',
  'Create quizzes from videos and articles',
  'Turn notes into mind maps automatically',
  'Export to Anki, Quizlet, and more'
];

export const FinalCTA: React.FC<FinalCTAProps> = ({ onGetStarted }) => {
  return (
    <section className="py-20 px-6 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="max-w-3xl mx-auto text-center space-y-8">
        {/* Headline */}
        <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground">
          Start Learning Smarter Today
        </h2>

        {/* Description */}
        <p className="text-lg text-muted-foreground">
          Join thousands of students and researchers who save hours of study time every week
        </p>

        {/* Benefits List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto text-left">
          {benefits.map((benefit, index) => (
            <div key={index} className="flex items-start gap-3">
              <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm text-foreground">{benefit}</span>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <Button
          onClick={onGetStarted}
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full font-bold shadow-lg hover:shadow-xl px-12 py-6 text-lg transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
        >
          Create Your Free Account
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-success" />
            Takes 30 seconds
          </span>
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-success" />
            No credit card required
          </span>
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-success" />
            Cancel anytime
          </span>
        </div>
      </div>
    </section>
  );
};
