import {
  AudioLines,
  BookOpen,
  Brain,
  FileText,
  GitFork,
  HelpCircle,
  Image,
  Layers,
  MessageCircle,
  MessageSquareText,
  Table2,
  Telescope,
} from "lucide-react";
import React from "react";
import Marquee from "react-fast-marquee";
import { Link } from "react-router-dom";
import {
  FEATURES_MARQUEE_ROW_1_ORDER,
  FEATURES_MARQUEE_ROW_2_ORDER,
  getLandingFeatureColor,
  LANDING_CONTENT,
  orderLandingFeatures,
} from "../constants";
import { FEATURE_INTENT_PATHS } from "../intentLandingPages";

export const FeaturesGrid: React.FC = () => {
  const getIconForFeature = (id: string) => {
    switch (id) {
      case "rag":
        return Brain;
      case "chat":
        return MessageCircle;
      case "deepResearch":
        return Telescope;
      case "literatureReview":
        return BookOpen;
      case "audio":
        return AudioLines;
      case "mindmap":
        return GitFork;
      case "reports":
        return FileText;
      case "flashcards":
        return Layers;
      case "quiz":
        return HelpCircle;
      case "infographic":
        return Image;
      case "writtenQuestions":
        return MessageSquareText;
      case "spreadsheets":
        return Table2;
      default:
        return HelpCircle;
    }
  };

  const renderCard = (feature: (typeof LANDING_CONTENT.features)[0]) => {
    const Icon = getIconForFeature(feature.id);
    const colorClass = getLandingFeatureColor(feature.id);
    const intentPath = FEATURE_INTENT_PATHS[feature.id];
    return (
      <div
        key={feature.id}
        className="group shrink-0 w-[300px] min-h-[220px] rounded-2xl bg-card border border-border shadow-sm p-12 flex flex-col items-center justify-center text-center mx-4"
      >
        <Icon
          className={`w-10 h-10 shrink-0 ${colorClass} mb-2 group-hover:scale-105 transition-transform duration-300`}
        />
        <h3 className="text-lg font-display font-bold text-foreground mb-1 line-clamp-1">
          {feature.title}
        </h3>
        <p className="text-muted-foreground text-base leading-relaxed line-clamp-2">
          {feature.description}
        </p>
        {intentPath ? (
          <Link to={intentPath} className="mt-3 text-sm font-medium text-primary hover:underline">
            Learn more →
          </Link>
        ) : null}
      </div>
    );
  };

  const featureCardsRow1 = orderLandingFeatures(
    LANDING_CONTENT.features,
    FEATURES_MARQUEE_ROW_1_ORDER
  ).map(renderCard);
  const featureCardsRow2 = orderLandingFeatures(
    LANDING_CONTENT.features,
    FEATURES_MARQUEE_ROW_2_ORDER
  ).map(renderCard);

  const marqueeClass =
    "[mask-image:linear-gradient(to_right,transparent,black_64px,black_calc(100%-64px),transparent)]";

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
