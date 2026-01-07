import React from 'react';
import { NavigationHeader } from './components/NavigationHeader';
import { HeroSection } from './components/HeroSection';
import { FeaturesGrid } from './components/FeaturesGrid';
import { UseCasesSection } from './components/UseCasesSection';
import { ContentShowcase } from './components/ContentShowcase';
import { PricingSection } from './components/PricingSection';
import { FAQSection } from './components/FAQSection';

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader onGetStarted={onGetStarted} />
      <HeroSection onGetStarted={onGetStarted} />
      <FeaturesGrid />
      <UseCasesSection />
      <ContentShowcase />
      <PricingSection onGetStarted={onGetStarted} />
      <FAQSection />
    </div>
  );
};
