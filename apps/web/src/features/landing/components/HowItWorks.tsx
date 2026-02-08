import React from 'react';
import { Upload, Wand2, GraduationCap, Circle } from 'lucide-react';
import { LANDING_CONTENT } from '../constants';

export const HowItWorks: React.FC = () => {
  const getIconForStep = (iconName: string) => {
    switch (iconName) {
      case 'Upload': return Upload;
      case 'Wand2': return Wand2;
      case 'GraduationCap': return GraduationCap;
      default: return Circle;
    }
  };

  return (
    <section className="py-32 px-6 bg-background">
      <div className="max-w-[1500px] w-full mx-auto">
        {/* Section Header */}
        <div className="text-center mb-24">
          <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-4">
            {LANDING_CONTENT.howItWorks.title}
          </h2>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {LANDING_CONTENT.howItWorks.steps.map((step, index) => {
            const Icon = getIconForStep(step.icon);

            return (
              <div
                key={step.number}
                className="relative bg-card border border-border rounded-2xl p-8 shadow-sm hover:shadow-md transition-all"
              >
                {/* Step Number Badge */}
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl shadow-lg">
                  {step.number}
                </div>

                {/* Icon */}
                <div className="mb-6 mt-4">
                  <div className="w-16 h-16 bg-secondary/50 rounded-2xl flex items-center justify-center">
                    <Icon className="w-8 h-8 text-primary" />
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-sans font-bold text-foreground mb-3">
                  {step.title}
                </h3>

                {/* Description */}
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.description}
                </p>

                {/* Connector Line (not on last item) */}
                {index < LANDING_CONTENT.howItWorks.steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-border" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
