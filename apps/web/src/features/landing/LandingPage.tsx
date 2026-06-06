import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { ContentShowcase } from "./components/ContentShowcase";
import { FAQSection } from "./components/FAQSection";
import { FeaturesGrid } from "./components/FeaturesGrid";
import { Footer } from "./components/Footer";
import { HeroSection } from "./components/HeroSection";
import { NavigationHeader } from "./components/NavigationHeader";
import { PricingSection } from "./components/PricingSection";
import { UseCasesSection } from "./components/UseCasesSection";

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (isNativeShell()) {
    if (isLoading) {
      return <div className="min-h-screen bg-[#FDFBF7]" />;
    }
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  return (
    <>
      <SEOMeta pagePath="/" />
      <div className="min-h-screen landing-grid-pattern">
        <NavigationHeader onGetStarted={onGetStarted} onLogin={() => setAuthModalOpen(true)} />
        <HeroSection onGetStarted={onGetStarted} />
        <FeaturesGrid />
        <UseCasesSection />
        <ContentShowcase />
        <PricingSection onGetStarted={onGetStarted} />
        <FAQSection />
        <Footer />
      </div>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={() => navigate("/home", { replace: true })}
      />
    </>
  );
};
