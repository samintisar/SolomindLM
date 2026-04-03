import React from 'react';
import Marquee from 'react-fast-marquee';
import { AudioLines, GitFork, FileText, Layers, HelpCircle, MessageSquareText, Brain, Table2, Presentation } from 'lucide-react';
import { LANDING_CONTENT } from '../constants';

export const FeaturesGrid: React.FC = () => {
  const getIconForFeature = (id: string) => {
    switch (id) {
      case 'audio': return AudioLines;
      case 'mindmap': return GitFork;
      case 'reports': return FileText;
      case 'flashcards': return Layers;
      case 'quiz': return HelpCircle;
      case 'slides': return Presentation;
      case 'writtenQuestions': return MessageSquareText;
      case 'rag': return Brain;
      case 'spreadsheets': return Table2;
      default: return HelpCircle;
    }
  };

  const getColorForFeature = (id: string) => {
    switch (id) {
      case 'audio': return 'text-purple-700';
      case 'mindmap': return 'text-fuchsia-600';
      case 'reports': return 'text-amber-600';
      case 'flashcards': return 'text-red-700';
      case 'quiz': return 'text-blue-700';
      case 'slides': return 'text-violet-600';
      case 'writtenQuestions': return 'text-green-700';
      case 'rag': return 'text-violet-600';
      case 'spreadsheets': return 'text-cyan-600';
      default: return 'text-primary';
    }
  };

  const renderCard = (feature: (typeof LANDING_CONTENT.features)[0]) => {
    const Icon = getIconForFeature(feature.id);
    const colorClass = getColorForFeature(feature.id);
    return (
      <div
        key={feature.id}
        className="group flex-shrink-0 w-[300px] min-h-[220px] rounded-2xl bg-card border border-border shadow-sm p-12 flex flex-col items-center justify-center text-center mx-4"
      >
        <Icon className={`w-10 h-10 flex-shrink-0 ${colorClass} mb-2 group-hover:scale-105 transition-transform duration-300`} />
        <h3 className="text-lg font-display font-bold text-foreground mb-1 line-clamp-1">
          {feature.title}
        </h3>
        <p className="text-muted-foreground text-base leading-relaxed line-clamp-2">
          {feature.description}
        </p>
      </div>
    );
  };

  const featureCardsRow1 = LANDING_CONTENT.features.map(renderCard);
  const featureCardsRow2 = LANDING_CONTENT.features.map(renderCard);

  const marqueeClass = "[mask-image:linear-gradient(to_right,transparent,black_64px,black_calc(100%-64px),transparent)]";

  return (
    <section id="features" className="py-32 md:py-40 px-6 overflow-hidden">
      <div className="max-w-[1500px] w-full mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            Powerful Learning Tools
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            AI-powered tools designed to help you learn faster and retain more
          </p>
        </div>

        {/* Row 1: scrolls left */}
        <Marquee
          speed={40}
          pauseOnHover
          gradient
          gradientColor="var(--background)"
          gradientWidth={64}
          className={marqueeClass}
        >
          {featureCardsRow1}
        </Marquee>

        {/* Row 2: scrolls right */}
        <Marquee
          speed={40}
          direction="right"
          pauseOnHover
          gradient
          gradientColor="var(--background)"
          gradientWidth={64}
          className={`mt-6 ${marqueeClass}`}
        >
          {featureCardsRow2}
        </Marquee>
      </div>
    </section>
  );
};
