import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import {
  generateFAQStructuredData,
  generateOrganizationStructuredData,
  generateSoftwareApplicationStructuredData,
  generateWebSiteStructuredData,
} from "@/shared/seo/structuredData";
import { isNativeShell } from "@/utils/platformDetection";
import { ContentShowcase } from "./components/ContentShowcase";
import { FAQSection } from "./components/FAQSection";
import { FeaturesGrid } from "./components/FeaturesGrid";
import { Footer } from "./components/Footer";
import { HeroSection } from "./components/HeroSection";
import { NavigationHeader } from "./components/NavigationHeader";
import { PricingSection } from "./components/PricingSection";
import { UseCasesSection } from "./components/UseCasesSection";
import { LANDING_FAQS } from "./constants";

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isNativeShell()) {
    if (isLoading) {
      return <div className="min-h-screen bg-[#FDFBF7]" />;
    }
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

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
      <div className="min-h-screen landing-grid-pattern">
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
