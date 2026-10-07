import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { Footer } from "./components/Footer";
import { AudienceTabs } from "./components/home/AudienceTabs";
import { FaqSection } from "./components/home/FaqSection";
import { FirstNotebookCta } from "./components/home/FirstNotebookCta";
import { HeroSection } from "./components/home/HeroSection";
import { HowItWorks } from "./components/home/HowItWorks";
import { LandingNav } from "./components/home/LandingNav";
import { PricingSection } from "./components/home/PricingSection";
import { SourceStrip } from "./components/home/SourceStrip";
import { StudioMarquee } from "./components/home/StudioMarquee";
import { scrollToSection } from "./components/home/scrollToSection";

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { hash } = useLocation();

  // Nav links on other pages arrive as `/#section`: scroll to it once the home page has rendered.
  useEffect(() => {
    if (hash) scrollToSection(hash.slice(1));
  }, [hash]);

  if (isNativeShell()) {
    if (isLoading) {
      return <div className="auth-form-light min-h-screen bg-background" />;
    }
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  return (
    <>
      <SEOMeta pagePath="/" />
      {/* Pinned light, like sign-in: the marketing pages don't follow the app theme. */}
      <div className="auth-form-light min-h-screen bg-background font-serif text-foreground antialiased">
        <LandingNav onGetStarted={onGetStarted} onLogin={() => setAuthModalOpen(true)} />
        <main>
          <HeroSection onGetStarted={onGetStarted} />
          <SourceStrip />
          <HowItWorks />
          <StudioMarquee />
          <AudienceTabs />
          <PricingSection onGetStarted={onGetStarted} />
          <FaqSection />
          <FirstNotebookCta onGetStarted={onGetStarted} />
        </main>
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
