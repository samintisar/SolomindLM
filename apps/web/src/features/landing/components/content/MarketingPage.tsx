import { type ReactNode, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { AuthFormInitialMode } from "@/features/auth/components/AuthFormPanel";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { isNativeShell } from "@/utils/platformDetection";
import { Footer } from "../Footer";
import { FirstNotebookCta } from "../home/FirstNotebookCta";
import { LandingNav } from "../home/LandingNav";

interface MarketingPageProps {
  /** Page copy for the closing section; its heading and demo stay the same. */
  closing?: { body?: string; ctaLabel?: string };
  /** The page body. `openSignup` opens the sign-up modal. */
  children: (openSignup: () => void) => ReactNode;
}

/** The content-page frame: light pin, nav, main, closing section, footer and the auth modal (sign-up, or sign-in from "Log in"). */
export function MarketingPage({ closing, children }: MarketingPageProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthFormInitialMode>("signUp");

  if (isNativeShell()) {
    if (isLoading) return <div className="auth-form-light min-h-screen bg-background" />;
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  const openAuth = (mode: AuthFormInitialMode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };
  const openSignup = () => openAuth("signUp");
  return (
    <>
      {/* Pinned light, like the home page: the marketing pages don't follow the app theme. */}
      <div className="auth-form-light min-h-screen bg-background font-serif text-foreground antialiased">
        <LandingNav onGetStarted={openSignup} onLogin={() => openAuth("signIn")} />
        <main>
          {children(openSignup)}
          <FirstNotebookCta
            onGetStarted={openSignup}
            body={closing?.body}
            ctaLabel={closing?.ctaLabel}
          />
        </main>
        <Footer />
      </div>
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={() => navigate("/home", { replace: true })}
      />
    </>
  );
}
