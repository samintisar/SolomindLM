import React, { useRef } from 'react';
import { HeroSection } from './components/HeroSection';
import { FeaturesGrid } from './components/FeaturesGrid';
import { ContentShowcase } from './components/ContentShowcase';
import { HowItWorks } from './components/HowItWorks';
import { FinalCTA } from './components/FinalCTA';

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const featuresRef = useRef<HTMLDivElement>(null);

  const handleScrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background">
      <HeroSection
        onGetStarted={onGetStarted}
        onScrollToFeatures={handleScrollToFeatures}
      />
      <div ref={featuresRef}>
        <FeaturesGrid />
      </div>
      <ContentShowcase />
      <HowItWorks />
      <FinalCTA onGetStarted={onGetStarted} />
    </div>
  );
};
