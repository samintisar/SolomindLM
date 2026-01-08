import React from 'react';
import { AudioLines, GitFork, FileText, Layers, HelpCircle, MessageSquareText, Brain } from 'lucide-react';
import { LANDING_CONTENT } from '../constants';

export const FeaturesGrid: React.FC = () => {
  const getIconForFeature = (id: string) => {
    switch (id) {
      case 'audio': return AudioLines;
      case 'mindmap': return GitFork;
      case 'reports': return FileText;
      case 'flashcards': return Layers;
      case 'quiz': return HelpCircle;
      case 'writtenQuestions': return MessageSquareText;
      case 'rag': return Brain;
      default: return HelpCircle;
    }
  };

  const getColorForFeature = (id: string) => {
    switch (id) {
      case 'audio': return 'text-indigo-600';
      case 'mindmap': return 'text-fuchsia-600';
      case 'reports': return 'text-amber-600';
      case 'flashcards': return 'text-orange-600';
      case 'quiz': return 'text-sky-600';
      case 'writtenQuestions': return 'text-emerald-600';
      case 'rag': return 'text-violet-600';
      default: return 'text-primary';
    }
  };

  return (
    <section id="features" className="py-20 px-6 bg-background">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-4">
            Powerful Study Tools
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            AI-powered tools designed to help you learn faster and retain more
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {LANDING_CONTENT.features.map((feature) => {
            const Icon = getIconForFeature(feature.id);
            const colorClass = getColorForFeature(feature.id);

            return (
              <div
                key={feature.id}
                className="group aspect-[4/3] rounded-2xl bg-card border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-8 flex flex-col items-center justify-center text-center"
              >
                <Icon className={`w-12 h-12 ${colorClass} mb-4 group-hover:scale-110 transition-transform duration-300`} />
                <h3 className="text-xl font-sans font-bold text-foreground mb-3">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
