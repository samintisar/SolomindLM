import React from 'react';
import { NavigationHeader } from './components/NavigationHeader';
import { HeroSection } from './components/HeroSection';
import { FeaturesGrid } from './components/FeaturesGrid';
import { UseCasesSection } from './components/UseCasesSection';
import { ContentShowcase } from './components/ContentShowcase';
import { PricingSection } from './components/PricingSection';
import { FAQSection } from './components/FAQSection';
import { Footer } from './components/Footer';
import {
  SEOMeta,
  generateOrganizationStructuredData,
  generateWebSiteStructuredData,
  generateSoftwareApplicationStructuredData,
  generateFAQStructuredData,
} from '@/shared/seo/SEOMeta';
import { LANDING_FAQS } from './components/FAQSection';

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  return (
    <>
      <SEOMeta
        title="SolomindLM - AI Research Tool & Learning Partner"
        description="Transform PDFs, videos, and articles into flashcards, quizzes, mind maps, and audio overviews. Grounded AI ensures accurate, hallucination-free study materials."
        canonical="/"
        structuredData={[
          generateOrganizationStructuredData(),
          generateWebSiteStructuredData(),
          generateSoftwareApplicationStructuredData(),
          generateFAQStructuredData(LANDING_FAQS),
        ]}
      />
      <div className="min-h-screen bg-background">
        <NavigationHeader onGetStarted={onGetStarted} />
        <HeroSection onGetStarted={onGetStarted} />
        <FeaturesGrid />
        <UseCasesSection />
        <ContentShowcase />
        <PricingSection onGetStarted={onGetStarted} />
        <FAQSection />
        <Footer />
      </div>
    </>
  );
};
